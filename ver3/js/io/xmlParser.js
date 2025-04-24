/**
 * @fileoverview StormworksビークルXMLの解析機能を提供します。
 * 元の fileHandler.js から parseVehicleXml 関数を分離し、方法Bに対応。
 */

import { BlockData } from '../data/blockData.js'; // BlockData クラス定義が必要

/**
 * StormworksのビークルXML文字列を解析し、BlockDataオブジェクトの配列を生成します。
 * <c>, <o> の属性や子要素も可能な限り BlockData に保持します。
 * @param {string} xmlString - 解析するXML文字列。
 * @returns {BlockData[]} 抽出されたブロックデータの配列。
 * @throws {Error} XMLの解析に失敗した場合。
 */
export function parseVehicleXml(xmlString) {
    console.log("[XmlParser] XML解析を開始します (方法B)...");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // XMLパースエラーチェック
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
        console.error("[XmlParser] XML解析エラー:", parserError.textContent);
        throw new Error('XMLファイルの解析に失敗しました。ファイル形式を確認してください。');
    }

    const blocks = [];
    // TODO: 将来的に複数の body に対応する必要がある
    const componentElements = xmlDoc.querySelectorAll("vehicle > bodies > body > components > c");
    console.log(`[XmlParser] ${componentElements.length}個の <c> 要素が見つかりました。`);

    componentElements.forEach((cElement, index) => {
        const oElement = cElement.querySelector("o");
        if (!oElement) {
            console.warn(`[XmlParser] <c> 要素 ${index + 1} 内に <o> 要素が見つからずスキップ。`);
            return;
        }
        const vpElement = oElement.querySelector("vp");
        if (!vpElement) {
            console.warn(`[XmlParser] <o> 要素 ${index + 1} 内に <vp> 要素が見つからずスキップ。`);
            return;
        }

        // --- 基本情報の抽出 ---
        const definitionId = cElement.getAttribute('d') || '01_block';
        const tAttributeValue = cElement.getAttribute('t');
        //console.log("t: ", tAttributeValue)
        const rotationString = oElement.getAttribute('r');
        const colorString = oElement.getAttribute('sc');
        const positionXml = {
            x: vpElement.getAttribute('x') || '0', // 属性がない場合も考慮
            y: vpElement.getAttribute('y') || '0',
            z: vpElement.getAttribute('z') || '0'
        };

        // --- その他の属性と子要素の抽出 ---
        const cAttributes = new Map();
        for (const attr of cElement.attributes) {
            if (attr.name !== 'd' && attr.name !== 't') {
                cAttributes.set(attr.name, attr.value);
            }
        }

        const oAttributes = new Map();
        for (const attr of oElement.attributes) {
            if (attr.name !== 'r' && attr.name !== 'sc') {
                oAttributes.set(attr.name, attr.value);
            }
        }

        const oChildren = [];
        for (const child of oElement.childNodes) {
            if (child.nodeName !== 'vp' && (child.nodeType === 1 || (child.nodeType === 3 && child.nodeValue.trim() !== ''))) {
                oChildren.push(child.cloneNode(true)); // クローンして保持
            }
        }
        // 【デバッグログ】追加情報の確認
        // console.log(`[XmlParser] Block ${index+1}: cAttrs=${cAttributes.size}, oAttrs=${oAttributes.size}, oChildren=${oChildren.length}`);

        try {
             // --- 拡張されたBlockDataインスタンス生成 ---
             blocks.push(new BlockData(
                 definitionId, positionXml, rotationString, colorString, tAttributeValue,
                 cAttributes, oAttributes, oChildren
             ));
        } catch (e) {
             console.error(`[XmlParser] BlockData の作成中にエラーが発生しました (要素 ${index + 1}):`, e, {definitionId, positionXml, rotationString, colorString, tAttributeValue});
             // エラーが発生しても処理を継続 (エラーのあるブロックはスキップされる)
        }
    });

    console.log(`[XmlParser] XML解析完了。 ${blocks.length} 個のブロックデータを生成しました。`);
    return blocks;
}