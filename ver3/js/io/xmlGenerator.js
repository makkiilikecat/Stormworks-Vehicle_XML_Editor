/**
 * @fileoverview StormworksビークルXMLの生成機能を提供します。
 * 元の fileHandler.js から generateVehicleXml 関数を分離し、方法Bに対応。
 */

// ★ 依存関係: BlockDataクラスと、XML回転行列生成関数が必要
import { BlockData } from '../data/blockData.js';
import { rotationMatrixToXmlElements } from '../utils/coordinateConverter.js';

// XML要素を文字列化するためのシリアライザー (グローバルスコープ)
const xmlSerializer = new XMLSerializer();

/**
 * BlockDataの配列からStormworksビークルXML形式の文字列を生成します (方法B)。
 * BlockData に保持された全ての属性と子要素を復元します。
 * @param {BlockData[]} blockDataArray - XMLに変換するブロックデータの配列。
 * @returns {string} 生成されたXML文字列。
 */
export function generateVehicleXml(blockDataArray) {
    console.log(`[XmlGenerator] ${blockDataArray.length} 個のブロックデータからXML生成を開始します (方法B)...`);
    let componentsXmlString = ''; // <components> の中身の文字列

    // 一時的な DocumentFragment を使用してメモリ内で要素を構築
    const tempDoc = document.implementation.createDocument(null, null, null); // 空のドキュメント

    blockDataArray.forEach((blockData, index) => {
        try {
            // 1. <c> 要素の生成と基本属性設定
            const cElement = tempDoc.createElement('c');
            if (blockData.definitionId) {
                cElement.setAttribute('d', blockData.definitionId);
            }
            if (blockData.tAttribute !== 0) {
                cElement.setAttribute('t', blockData.tAttribute.toString());
            }
            // 保存されている他の<c>属性を設定
            blockData.cAttributes.forEach((value, name) => {
                cElement.setAttribute(name, value);
            });

            // 2. <o> 要素の生成と基本属性設定
            const oElement = tempDoc.createElement('o');
            // 回転行列 (`r`) を文字列に変換して設定
            const rString = rotationMatrixToXmlElements(blockData.rotationMatrix).join(',');
            oElement.setAttribute('r', rString);
            // 色 (`sc`) を文字列に変換して設定
            const scString = blockData.colorIndices.join(',');
            oElement.setAttribute('sc', scString);
            // 保存されている他の<o>属性を設定
            blockData.oAttributes.forEach((value, name) => {
                oElement.setAttribute(name, value);
            });

            // 3. <vp> 要素の生成と追加
            const posXml = blockData.getPositionXml(); // {x, y, z} (整数化済み)
            const vpElement = tempDoc.createElement('vp');
            vpElement.setAttribute('x', posXml.x.toString());
            vpElement.setAttribute('y', posXml.y.toString());
            vpElement.setAttribute('z', posXml.z.toString());
            oElement.appendChild(vpElement);

            // 4. 保存されている他の <o> の子要素を追加
            blockData.oChildren.forEach(childNode => {
                // 必ずクローンを追加する
                oElement.appendChild(childNode.cloneNode(true));
            });

            // 5. <o> を <c> に追加
            cElement.appendChild(oElement);

            // 6. 完成した <c> 要素を文字列化して追記 (改行とインデント付き)
            componentsXmlString += '\n            ' + xmlSerializer.serializeToString(cElement);

        } catch (error) {
            console.error(`[XmlGenerator] ブロック ${index + 1} (ID: ${blockData?.id}) のXML生成中にエラー:`, error, blockData);
            // エラーが発生したブロックはスキップして処理を続行
        }
    });

    // --- 車両全体のXML構造を組み立て (基本テンプレート使用) ---
    // TODO: 読み込んだヘッダー情報などを使うように将来的に改善可能
    const vehicleXml = `<?xml version="1.0" encoding="UTF-8"?>
<vehicle data_version="3" bodies_id="1">
    <authors/>
    <bodies>
        <body unique_id="1">
            <components>${componentsXmlString}
            </components>
        </body>
    </bodies>
    <logic_node_links/>
</vehicle>`;

    console.log("[XmlGenerator] XML生成完了 (方法B)。");
    return vehicleXml;
}