import * as THREE from 'three'; // Matrix4を使うためにインポート
import { BlockData } from '../data/blockData.js';

/**
 * ユーザーが選択したファイルオブジェクトを読み込み、内容をテキストとして返します。
 * @param {File} file - ユーザーが選択したファイルオブジェクト。
 * @returns {Promise<string>} ファイルの内容 (XML文字列) を解決するPromise。
 */
export function loadFileAsText(file) {
    // (変更なし)
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('ファイルが選択されていません。'));
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (event) => {
            console.error("ファイル読み込みエラー:", event.target.error);
            reject(new Error('ファイルの読み込みに失敗しました。'));
        };
        reader.readAsText(file);
    });
}

/**
 * StormworksのビークルXML文字列を解析し、BlockDataオブジェクトの配列を生成します。
 * 'd'属性がない場合は '01_block' として扱います。
 * @param {string} xmlString - 解析するXML文字列。
 * @returns {BlockData[]} 抽出されたブロックデータの配列。
 * @throws {Error} XMLの解析に失敗した場合。
 */
export function parseVehicleXml(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) { /* ... エラー処理 ... */ }

    const blocks = [];
    const componentElements = xmlDoc.querySelectorAll("vehicle > bodies > body > components > c");

    componentElements.forEach(comp => {
        const objectElement = comp.querySelector("o");
        if (objectElement) {
            // --- 修正点: 'd'属性がない場合のデフォルト値を設定 ---
            const definitionId = comp.getAttribute('d') || '01_block';
            // --------------------------------------------------
            const rotationString = objectElement.getAttribute('r');
            const colorString = objectElement.getAttribute('sc');
            const vpElement = objectElement.querySelector("vp");
            const positionXml = vpElement ? { x: vpElement.getAttribute('x'), y: vpElement.getAttribute('y'), z: vpElement.getAttribute('z') } : null;
            try {
                 blocks.push(new BlockData(definitionId, positionXml, rotationString, colorString));
            } catch (e) {
                 console.error("BlockData の作成に失敗しました:", e);
            }
        }
    });
    console.log(`XMLから ${blocks.length} 個のブロックを解析しました。`);
    return blocks;
}

// --- Stage 1.4 追加 ---

/**
 * BlockDataの配列からStormworksビークルXML形式の文字列を生成します。
 * 座標と回転行列はStormworksの座標系・整数値に変換されます。
 * @param {BlockData[]} blockDataArray - XMLに変換するブロックデータの配列。
 * @returns {string} 生成されたXML文字列。
 */
export function generateVehicleXml(blockDataArray) {
    let componentsXml = ''; // 各ブロックのXMLを結合する変数

    blockDataArray.forEach(blockData => {
        // --- 座標 (`vp`) の準備 (Stormworks座標系に戻し、整数化) ---
        const posX = Math.round(blockData.position.x);
        const posY = Math.round(blockData.position.y);
        const posZ = Math.round(-blockData.position.z); // Zの符号を反転

        // --- 回転行列 (`r`) の準備 (Stormworks座標系に戻し、整数化) ---
        const matrix = blockData.rotationMatrix; // Three.js座標系のMatrix4
        const me = matrix.elements; // 列優先配列 m11, m21, m31, m41, m12, ...
        // 座標系逆変換 (T * M_three * T) と整数化
        const r11 = Math.round(me[0]); const r21 = Math.round(me[1]); const r31 = Math.round(-me[2]);
        const r12 = Math.round(me[4]); const r22 = Math.round(me[5]); const r32 = Math.round(-me[6]);
        const r13 = Math.round(-me[8]); const r23 = Math.round(-me[9]); const r33 = Math.round(me[10]);
        const rString = `${r11},${r21},${r31},${r12},${r22},${r32},${r13},${r23},${r33}`;

        // --- 色 (`sc`) の準備 ---
        const scString = blockData.colorIndices.join(',');

        // --- XML要素の組み立て ---
        const vpXml = `<vp x="${posX}" y="${posY}" z="${posZ}"/>`;
        // 'd'属性はdefinitionIdが存在する場合のみ追加
        const dAttribute = blockData.definitionId ? ` d="${blockData.definitionId}"` : '';
        // 'r'属性は単位行列でない場合に追加するのが一般的だが、常に含める方が安全
        const rAttribute = ` r="${rString}"`;
        // 'sc'属性も常に含める（デフォルトは"0"のはず）
        const scAttribute = ` sc="${scString}"`;

        const oXml = `<o${rAttribute}${scAttribute}>${vpXml}</o>`;
        const cXml = `<c${dAttribute}>${oXml}</c>\n`; // 各ブロックの定義

        componentsXml += cXml; // 文字列に追加
    });

    // --- 車両全体のXML構造を組み立て ---
    // TODO: bodies_id や unique_id は適切に管理・生成する必要がある (将来の課題)
    const vehicleXml = `<?xml version="1.0" encoding="UTF-8"?>
<vehicle data_version="3" bodies_id="1">
    <authors/>
    <bodies>
        <body unique_id="1">
            <components>
${componentsXml}            </components>
        </body>
    </bodies>
    <logic_node_links/>
</vehicle>`;

    return vehicleXml;
}

/**
 * 指定されたテキストコンテンツをXMLファイルとしてダウンロードさせます。
 * @param {string} xmlString - ダウンロードするXMLの内容。
 * @param {string} filename - ダウンロード時のデフォルトファイル名。
 */
export function downloadXmlFile(xmlString, filename = 'vehicle.xml') {
    // Blobオブジェクトを作成 (MIMEタイプをXMLに設定)
    const blob = new Blob([xmlString], { type: 'text/xml;charset=utf-8' });
    // ダウンロード用のURLを生成
    const url = URL.createObjectURL(blob);

    // 一時的な<a>要素（リンク）を作成
    const link = document.createElement('a');
    link.href = url;
    link.download = filename; // ダウンロードファイル名を設定

    // リンクをDOMに追加してプログラム的にクリックし、その後削除
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 生成したURLを解放
    URL.revokeObjectURL(url);
    console.log(`"${filename}"としてXMLファイルを保存しました。`);
}
// ----------------------