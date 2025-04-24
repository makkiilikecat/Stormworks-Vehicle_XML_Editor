/**
 * @fileoverview StormworksビークルXMLの生成機能を提供します。
 * 元の fileHandler.js から generateVehicleXml 関数を分離し、方法Bに対応。
 *
 * 【主な変更点 v4 (ペイントモード対応 Stage 1.3)】
 * - BlockDataの変更に合わせ、sc, bc, ac 属性を正しく生成するように修正。
 * - sc属性は BlockData.getSurfaceColorsString() から生成。
 * - bc, ac属性は BlockData.getBaseColor(), getAdditiveColor() から取得し、
 * 値が存在する場合のみ属性を書き出すように変更。
 */

// ★ 依存関係: BlockDataクラス、XML回転行列生成関数、ブロック定義取得関数が必要
import { BlockData } from '../data/blockData.js';
import { rotationMatrixToXmlElements } from '../utils/coordinateConverter.js';
import { getBlockDefinition } from '../data/blockDefinitions.js';

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
    // (変更なし)
    if (defaultValue === undefined || defaultValue === null) { return true; }
    if (currentValue === undefined || currentValue === null) { return false; }
    try {
        switch (type) {
            case 'boolean': const boolValue = currentValue.toLowerCase() === 'true'; return boolValue !== defaultValue;
            case 'number': const numValue = parseFloat(currentValue); if (isNaN(numValue) && isNaN(defaultValue)) return false; if (isNaN(numValue) || isNaN(defaultValue)) return true; return numValue !== defaultValue;
            case 'string': default: return currentValue !== defaultValue.toString();
        }
    } catch (e) { console.warn(`[XmlGenerator] デフォルト値比較中にエラー (type: ${type}, value: ${currentValue}, default: ${defaultValue}):`, e); return true; }
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
            const definition = getBlockDefinition(blockData.definitionId);
            const definedProperties = new Map(definition.properties?.map(p => [p.name, p]) ?? []);

            // 1. <c> 要素の生成と基本属性設定 (変更なし)
            const cElement = tempDoc.createElement('c');
            if (blockData.definitionId) { cElement.setAttribute('d', blockData.definitionId); }
            if (blockData.tAttribute !== 0) { cElement.setAttribute('t', blockData.tAttribute.toString()); }
            blockData.cAttributes.forEach((value, name) => {
                const propDef = definedProperties.get(name);
                if (propDef && propDef.source === 'c') { if (isValueDifferentFromDefault(value, propDef.defaultValue, propDef.type)) { cElement.setAttribute(name, value); } }
                else { cElement.setAttribute(name, value); }
            });

            // 2. <o> 要素の生成と基本属性設定
            const oElement = tempDoc.createElement('o');
            const rString = rotationMatrixToXmlElements(blockData.rotationMatrix).join(',');
            oElement.setAttribute('r', rString);

            // sc, bc, ac 属性を BlockData から取得して設定
            const scString = blockData.getSurfaceColorsString();
            if (scString) { // 空文字列でない場合のみ設定
                oElement.setAttribute('sc', scString);
            }
            const bcString = blockData.getBaseColor();
            if (bcString) { // null や空文字列でない場合のみ設定
                oElement.setAttribute('bc', bcString);
            }
            const acString = blockData.getAdditiveColor();
            if (acString) { // null や空文字列でない場合のみ設定
                oElement.setAttribute('ac', acString);
            }
            // ---------------------------------------------------

            // 保存されている他の<o>属性を、デフォルト値と比較して設定
            // (bc, ac は BlockData の専用プロパティから設定済みなので、oAttributes からは除外される想定)
            blockData.oAttributes.forEach((value, name) => {
                const propDef = definedProperties.get(name);
                 if (propDef && propDef.source === 'o') { if (isValueDifferentFromDefault(value, propDef.defaultValue, propDef.type)) { oElement.setAttribute(name, value); } }
                 else { oElement.setAttribute(name, value); }
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

    // --- 車両全体のXML構造を組み立て (変更なし) ---
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

    console.log("[XmlGenerator] XML生成完了 (方法B, デフォルト値比較, 色属性対応)。");
    return vehicleXml;
}