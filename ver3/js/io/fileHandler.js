import { BlockData } from '../data/blockData.js';

/**
 * ユーザーが選択したファイルオブジェクトを読み込み、内容をテキストとして返します。
 * @param {File} file - ユーザーが選択したファイルオブジェクト。
 * @returns {Promise<string>} ファイルの内容 (XML文字列) を解決するPromise。
 */
export function loadFileAsText(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('ファイルが選択されていません。'));
            return;
        }

        const reader = new FileReader();

        // 読み込み成功時の処理
        reader.onload = (event) => {
            resolve(event.target.result); // ファイルの内容をテキストとして返す
        };

        // 読み込み失敗時の処理
        reader.onerror = (event) => {
            console.error("ファイル読み込みエラー:", event.target.error);
            reject(new Error('ファイルの読み込みに失敗しました。'));
        };

        // ファイルをテキストとして読み込み開始
        reader.readAsText(file);
    });
}

/**
 * StormworksのビークルXML文字列を解析し、BlockDataオブジェクトの配列を生成します。
 * @param {string} xmlString - 解析するXML文字列。
 * @returns {BlockData[]} 抽出されたブロックデータの配列。
 * @throws {Error} XMLの解析に失敗した場合。
 */
export function parseVehicleXml(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // パースエラーチェック
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
        console.error("XMLパースエラー:", parserError.textContent);
        throw new Error("XMLファイルの形式が正しくありません。");
    }

    const blocks = [];
    const componentElements = xmlDoc.querySelectorAll("vehicle > bodies > body > components > c");

    componentElements.forEach(comp => {
        const objectElement = comp.querySelector("o"); // 各コンポーネント内の 'o' 要素を取得
        if (objectElement) {
            const definitionId = comp.getAttribute('d') || ''; // ブロック種類 ('d'属性)
            const rotationString = objectElement.getAttribute('r'); // 回転行列 ('r'属性)
            const colorString = objectElement.getAttribute('sc'); // 色情報 ('sc'属性)

            const vpElement = objectElement.querySelector("vp"); // 位置情報 ('vp'要素)
            const position = vpElement ? {
                x: vpElement.getAttribute('x'),
                y: vpElement.getAttribute('y'),
                z: vpElement.getAttribute('z')
            } : null; // vp要素がない場合 (通常は存在しないはず)

            // BlockData インスタンスを作成して配列に追加
            try {
                 blocks.push(new BlockData(definitionId, position, rotationString, colorString));
            } catch (e) {
                 console.error("BlockData の作成に失敗しました:", e, {definitionId, position, rotationString, colorString});
            }
        }
    });

    console.log(`XMLから ${blocks.length} 個のブロックを解析しました。`);
    return blocks;
}