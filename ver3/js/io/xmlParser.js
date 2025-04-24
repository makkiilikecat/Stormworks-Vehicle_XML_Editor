/**
 * @fileoverview StormworksビークルXMLの解析機能を提供します。
 * 元の fileHandler.js から parseVehicleXml 関数を分離し、方法Bに対応。
 *
 * 【主な変更点 v4 (ペイントモード対応 Stage 1.2)】
 * - BlockDataの変更に合わせ、<o>要素から sc, bc, ac 属性を個別に取得。
 * - 取得した色属性を BlockData コンストラクタに渡すように修正。
 * - sc, bc, ac が oAttributes Map に含まれないように修正。
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
        const rotationString = oElement.getAttribute('r');
        // ★変更: sc, bc, ac を個別に取得
        const scString = oElement.getAttribute('sc');
        const bcString = oElement.getAttribute('bc'); // null の可能性あり
        const acString = oElement.getAttribute('ac'); // null の可能性あり

        const positionXml = {
            x: vpElement.getAttribute('x') || '0',
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
        const excludedOAttributes = ['r', 'sc', 'bc', 'ac']; // 除外リスト
        for (const attr of oElement.attributes) {
            // ★変更: 除外リストに含まれない属性のみ oAttributes に格納
            if (!excludedOAttributes.includes(attr.name)) {
                oAttributes.set(attr.name, attr.value);
            }
        }

        const oChildren = [];
        for (const child of oElement.childNodes) {
            // ノードタイプ 1 は要素ノード、3 はテキストノード
            // vp 以外の要素ノード、または空でないテキストノードを子要素として保持
            if (child.nodeName !== 'vp' && (child.nodeType === 1 || (child.nodeType === 3 && child.nodeValue.trim() !== ''))) {
                oChildren.push(child.cloneNode(true)); // クローンして保持
            }
        }

        try {
             // --- BlockDataインスタンス生成 (★修正: sc, bc, ac を引数に追加) ---
             blocks.push(new BlockData(
                 definitionId, positionXml, rotationString,
                 scString, bcString, acString, // ★色情報を渡す
                 tAttributeValue,
                 cAttributes, oAttributes, oChildren
                 // initialMatrix, restoreId はここでは null (通常読み込みのため)
             ));
        } catch (e) {
             console.error(`[XmlParser] BlockData の作成中にエラーが発生しました (要素 ${index + 1}):`, e);
             // エラーが発生しても処理を継続
        }
    });

    console.log(`[XmlParser] XML解析完了。 ${blocks.length} 個のブロックデータを生成しました。`);
    return blocks;
}