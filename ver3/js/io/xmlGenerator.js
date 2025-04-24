/**
 * @fileoverview StormworksビークルXMLの生成機能を提供します。
 * 元の fileHandler.js から generateVehicleXml 関数を分離し、方法Bに対応。
 * 【主な変更点】
 * - 属性書き出し時に blockDefinitions の defaultValue と比較し、
 * 値が異なる場合のみ属性を出力するように修正。
 */

// ★ 依存関係: BlockDataクラス、XML回転行列生成関数、ブロック定義取得関数が必要
import { BlockData } from '../data/blockData.js';
import { rotationMatrixToXmlElements } from '../utils/coordinateConverter.js';
import { getBlockDefinition } from '../data/blockDefinitions.js'; // ★追加

// XML要素を文字列化するためのシリアライザー (グローバルスコープ)
const xmlSerializer = new XMLSerializer();

/**
 * 値がデフォルト値と異なるか比較します (型を考慮)。
 * @param {string} currentValue - BlockDataに格納されている現在の値 (文字列)。
 * @param {*} defaultValue - blockDefinitions から取得したデフォルト値。
 * @param {string} type - プロパティの型 ('boolean', 'number', 'string')。
 * @returns {boolean} 値がデフォルトと異なる場合は true。
 * @private
 */
function isValueDifferentFromDefault(currentValue, defaultValue, type) {
    // defaultValue が未定義なら、常に「異なる」= 保存対象とする
    if (defaultValue === undefined || defaultValue === null) {
        return true;
    }
    // currentValue が null や undefined (BlockDataに存在しない) なら、「同じ」= 保存しない
    if (currentValue === undefined || currentValue === null) {
        return false;
    }

    // 型に応じた比較
    try {
        switch (type) {
            case 'boolean':
                // 文字列 'true'/'false' (XML属性値) を boolean に変換して比較
                const boolValue = currentValue.toLowerCase() === 'true';
                return boolValue !== defaultValue;
            case 'number':
                // 文字列 (XML属性値) を number に変換して比較
                const numValue = parseFloat(currentValue);
                 // NaN チェック: どちらか一方でも NaN なら「異なる」とする方が安全か？
                 // ここでは単純比較。必要なら調整。
                 if (isNaN(numValue) && isNaN(defaultValue)) return false;
                 if (isNaN(numValue) || isNaN(defaultValue)) return true;
                return numValue !== defaultValue;
            case 'string':
            default:
                // 文字列として比較 (defaultValue も文字列に変換)
                return currentValue !== defaultValue.toString();
        }
    } catch (e) {
        console.warn(`[XmlGenerator] デフォルト値比較中にエラー (type: ${type}, value: ${currentValue}, default: ${defaultValue}):`, e);
        return true; // エラー時は安全のため保存する
    }
}

/**
 * BlockDataの配列からStormworksビークルXML形式の文字列を生成します (方法B)。
 * BlockData に保持された属性を、デフォルト値と比較して必要なら書き出します。
 * @param {BlockData[]} blockDataArray - XMLに変換するブロックデータの配列。
 * @returns {string} 生成されたXML文字列。
 */
export function generateVehicleXml(blockDataArray) {
    console.log(`[XmlGenerator] ${blockDataArray.length} 個のブロックデータからXML生成を開始します (方法B, デフォルト値比較)...`);
    let componentsXmlString = '';

    const tempDoc = document.implementation.createDocument(null, null, null);

    blockDataArray.forEach((blockData, index) => {
        try {
            // ブロック定義を取得 (デフォルト値比較のため)
            const definition = getBlockDefinition(blockData.definitionId);
            const definedProperties = new Map(definition.properties?.map(p => [p.name, p]) ?? []);

            // 1. <c> 要素の生成と基本属性設定
            const cElement = tempDoc.createElement('c');
            if (blockData.definitionId) { cElement.setAttribute('d', blockData.definitionId); }
            if (blockData.tAttribute !== 0) { cElement.setAttribute('t', blockData.tAttribute.toString()); }

            // ★修正: 保存されている他の<c>属性を、デフォルト値と比較して設定
            blockData.cAttributes.forEach((value, name) => {
                const propDef = definedProperties.get(name);
                if (propDef && propDef.source === 'c') {
                    // 定義済みプロパティ: デフォルト値と比較
                    if (isValueDifferentFromDefault(value, propDef.defaultValue, propDef.type)) {
                        cElement.setAttribute(name, value);
                        // console.log(`[XmlGenerator] <c> attr '${name}' saved (differs from default ${propDef.defaultValue})`);
                    } else {
                        // console.log(`[XmlGenerator] <c> attr '${name}' skipped (same as default ${propDef.defaultValue})`);
                    }
                } else {
                    // 未定義プロパティ: 常に保存
                    cElement.setAttribute(name, value);
                    // console.log(`[XmlGenerator] <c> attr '${name}' saved (unknown property)`);
                }
            });

            // 2. <o> 要素の生成と基本属性設定
            const oElement = tempDoc.createElement('o');
            const rString = rotationMatrixToXmlElements(blockData.rotationMatrix).join(',');
            oElement.setAttribute('r', rString); // 'r' は常に保存 (デフォルト比較しない)
            const scString = blockData.colorIndices.join(',');
            oElement.setAttribute('sc', scString); // 'sc' も常に保存 (デフォルト比較しない)

            // ★修正: 保存されている他の<o>属性を、デフォルト値と比較して設定
            blockData.oAttributes.forEach((value, name) => {
                const propDef = definedProperties.get(name);
                 if (propDef && propDef.source === 'o') {
                    // 定義済みプロパティ: デフォルト値と比較
                    if (isValueDifferentFromDefault(value, propDef.defaultValue, propDef.type)) {
                        oElement.setAttribute(name, value);
                        // console.log(`[XmlGenerator] <o> attr '${name}' saved (differs from default ${propDef.defaultValue})`);
                    } else {
                         // console.log(`[XmlGenerator] <o> attr '${name}' skipped (same as default ${propDef.defaultValue})`);
                    }
                } else {
                    // 未定義プロパティ: 常に保存
                    oElement.setAttribute(name, value);
                     // console.log(`[XmlGenerator] <o> attr '${name}' saved (unknown property)`);
                }
            });

            // 3. <vp> 要素の生成と追加 (変更なし)
            const posXml = blockData.getPositionXml();
            const vpElement = tempDoc.createElement('vp');
            vpElement.setAttribute('x', posXml.x.toString());
            vpElement.setAttribute('y', posXml.y.toString());
            vpElement.setAttribute('z', posXml.z.toString());
            oElement.appendChild(vpElement);

            // 4. 保存されている他の <o> の子要素を追加 (変更なし)
            blockData.oChildren.forEach(childNode => {
                oElement.appendChild(childNode.cloneNode(true));
            });

            // 5. <o> を <c> に追加 (変更なし)
            cElement.appendChild(oElement);

            // 6. 完成した <c> 要素を文字列化して追記 (変更なし)
            componentsXmlString += '\n            ' + xmlSerializer.serializeToString(cElement);

        } catch (error) {
             console.error(`[XmlGenerator] ブロック ${index + 1} (ID: ${blockData?.id}) のXML生成中にエラー:`, error, blockData);
        }
    });

    // --- 車両全体のXML構造を組み立て (変更なし - 基本テンプレート使用) ---
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

    console.log("[XmlGenerator] XML生成完了 (方法B, デフォルト値比較適用)。");
    return vehicleXml;
}