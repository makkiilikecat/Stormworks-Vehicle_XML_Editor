/**
 * @fileoverview XML編集パネルのイベント処理と値の適用を担当します。
 * 動的に生成された入力欄、および固定の vp, t, r 入力欄の変更を検知し、
 * BlockDataを更新、履歴に登録します。
 * 元の xmlEditUI.js から分離。
 * 【主な変更点】
 * - `setupXmlEditListeners` で固定入力欄にもイベントリスナーを設定。
 */

import { getSelectedBlocks } from '../interactions/selectionState.js';
import { addAction } from '../state/historyManager.js';
// ActionType は historyActions.js に無いことが確認されたため、文字列リテラル 'SET_PROPERTIES' を使用
import { showPopup } from './popupUtils.js';
import { updateXmlEditUI } from './xmlEditPanelContent.js';
import { rotationMatrixFromXmlElements, rotationMatrixToXmlElements } from '../utils/coordinateConverter.js';

// --- UI要素への参照 ---
const dynamicPropsContainer = document.getElementById('xml-edit-dynamic-props'); // 動的プロパティ用
// ★追加: 固定入力欄への参照 (イベントリスナー設定用)
const vpInputs = {
    x: document.getElementById('edit-vp-x'),
    y: document.getElementById('edit-vp-y'),
    z: document.getElementById('edit-vp-z'),
};
const tInput = document.getElementById('edit-t');
const rInputs = {}; // キーは 'r.c' 形式 (0-indexed)
for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) { rInputs[`${r}.${c}`] = document.getElementById(`edit-r-${r+1}${c+1}`); } }

/**
 * XML編集パネル内の全ての入力フィールド (固定 + 動的) にイベントリスナーを設定。
 * @export
 */
export function setupXmlEditListeners() {
    // --- ★修正: 固定入力欄へのリスナー設定を追加 ---
    const fixedInputs = [
        ...Object.values(vpInputs),
        tInput,
        ...Object.values(rInputs)
    ].filter(Boolean); // nullを除外

    if (fixedInputs.length < 13) { // vp(3)+t(1)+r(9)=13
        console.error("[XmlEditPanelHandler] 固定入力要素の一部が見つかりません。");
        // return; // 致命的ではないかもしれないので続行
    }

    console.log(`[XmlEditPanelHandler] ${fixedInputs.length}個の固定入力欄にリスナーを設定します...`);
    fixedInputs.forEach(input => {
        // 'change': 値変更＆フォーカスアウト
        input.addEventListener('change', handleInputChange);
        // 'keydown': Enterキー押下
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                handleInputChange(event);
                event.target.blur();
            }
        });
    });
    console.log("[XmlEditPanelHandler] 固定入力欄へのリスナー設定完了。");


    // --- 動的入力欄へのリスナー設定 (イベント委任) ---
    if (!dynamicPropsContainer) {
        console.error("[XmlEditPanelHandler] #xml-edit-dynamic-props コンテナが見つかりません。動的入力欄のリスナーを設定できません。");
        return;
    }
    console.log("[XmlEditPanelHandler] 動的入力欄コンテナにイベント委任リスナーを設定します...");
    dynamicPropsContainer.addEventListener('change', handleInputChange);
    dynamicPropsContainer.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
            handleInputChange(event);
            event.target.blur();
        }
    });
     console.log("[XmlEditPanelHandler] 動的入力欄のイベントリスナー設定完了。");
}


/**
 * 入力フィールド (固定または動的) の値変更イベントハンドラ。
 * @param {Event} event
 * @private
 */
function handleInputChange(event) {
    const input = event.target;
    // input要素で、かつカスタムデータ属性 (propertyName) を持っているか確認
    // 固定入力欄にも data-property-name を付与したため、これで両方拾える
    if (!input || input.tagName !== 'INPUT' || !input.dataset.propertyName) {
        console.warn("[XmlEditPanelHandler] handleInputChange: 無関係な要素またはデータ属性不足の要素からのイベントは無視します。", event.target);
        return;
    }

    const selected = getSelectedBlocks();
    if (selected.length === 0) return;

    const propName = input.dataset.propertyName; const propSource = input.dataset.propertySource; const propType = input.dataset.propertyType;
    console.log(`[XmlEditPanelHandler] Input change: Name=${propName}, Source=${propSource}, Type=${propType}`);

    // --- 値のパースと検証 --- (変更なし)
    let newValue; let isValid = true;
    try { if (propType === 'boolean') { newValue = input.checked; } else if (propType === 'number') { newValue = parseFloat(input.value); if (isNaN(newValue)) isValid = false; else { if (propName === 't' || propName.startsWith('vp.') || propName.startsWith('r.')) { newValue = Math.round(newValue); if (propName === 't' && (newValue < 0 || newValue > 7)) isValid = false; } } } else { newValue = input.value; } } catch (e) { isValid = false; /* エラーログ */ }
    if (!isValid) { showPopup(`無効な値 (${propType})`, 'warning', 2000); updateXmlEditUI(); return; }

    // --- 履歴情報の作成 --- (変更なし)
    const changes = [];
    selected.forEach(block => {
        let oldValue = getBlockValue(block, propName, propSource);
        let saveableNewValue = newValue;
        const oldValueStr = (oldValue !== undefined && oldValue !== null) ? (typeof oldValue === 'boolean' ? oldValue.toString() : oldValue) : '';
        const newValueStr = (newValue !== undefined && newValue !== null) ? (typeof newValue === 'boolean' ? newValue.toString() : newValue) : '';
        if (oldValueStr !== newValueStr.toString()) { changes.push({ blockId: block.id, propName, propSource, propType, oldValue: oldValueStr, newValue: newValueStr }); }
    });
    if (changes.length === 0) { console.log(`[XmlEditPanelHandler] ${propName}: 値変更なし`); if (input.type === 'checkbox' && input.indeterminate) { updateXmlEditUI(); } return; }

    // --- BlockData への適用 --- (変更なし)
    console.log(`[XmlEditPanelHandler] ${propName} に ${newValue} (${propType}) を適用中 (${changes.length} blocks)...`);
    try {
        changes.forEach(change => {
            const block = selected.find(b => b.id === change.blockId); if (!block) return;
            let valueToApply = newValue;
            if (change.propType === 'boolean') valueToApply = (change.newValue === 'true');
            else if (change.propType === 'number') valueToApply = parseFloat(change.newValue);
            else valueToApply = change.newValue;
            if (change.propSource === 'standard') { if (change.propName === 't') block.setTAttribute(valueToApply); else if (change.propName.startsWith('vp.')) applyVectorChange(selected, 'vp', change.propName.slice(3), valueToApply); else if (change.propName.startsWith('r.')) applyMatrixChange(selected, change.propName, valueToApply); }
            else if (change.propSource === 'c') { block.setCAttribute(change.propName, valueToApply.toString()); } else if (change.propSource === 'o') { block.setOAttribute(change.propName, valueToApply.toString()); }
        });
    } catch (applyError) { /* エラー処理 */ console.error(`[XmlEditPanelHandler] BlockData適用エラー:`, applyError); showPopup("値の適用エラー", "error"); updateXmlEditUI(); return; }

    // --- アンドゥ履歴登録 --- (変更なし - 文字列 'SET_PROPERTIES' を使用)
    addAction({ type: 'SET_PROPERTIES', changes });

    // --- UI更新 --- (変更なし)
    if (input.classList.contains('multiple-selected')) { input.classList.remove('multiple-selected'); input.placeholder = ''; }
    if (input.type === 'checkbox' && input.indeterminate) { input.indeterminate = false; }
    if (propType === 'boolean') input.checked = newValue; else input.value = newValue;

    console.log(`[XmlEditPanelHandler] ${propName} の変更を適用・履歴登録完了。`);
    document.dispatchEvent(new CustomEvent('blocksChanged'));
}

/** BlockData からプロパティ値を取得するヘルパー @private */
function getBlockValue(block, propName, propSource) {
    // (変更なし)
    if (propSource === 'standard') { if (propName === 't') return block.tAttribute; if (propName === 'vp.x') return block.getPositionXml().x; if (propName === 'vp.y') return block.getPositionXml().y; if (propName === 'vp.z') return block.getPositionXml().z; if (propName.startsWith('r.')) { const [, r, c] = propName.split('.'); const elements = block.getRotationMatrixXmlElements(); return elements[parseInt(c) * 3 + parseInt(r)]; } }
    else if (propSource === 'c') { return block.cAttributes.get(propName); } else if (propSource === 'o') { return block.oAttributes.get(propName); } return undefined;
}

/** Vector3 (vp) 変更適用ヘルパー @private */
function applyVectorChange(selectedBlocks, vecName, axis, value) {
    // (変更なし)
     selectedBlocks.forEach(block => { const currentPos = block.getPositionXml(); const newPos = { ...currentPos }; newPos[axis] = value; block.setPositionFromXml(newPos.x, newPos.y, newPos.z); });
}

/** Matrix3x3 (r) 変更適用ヘルパー @private */
function applyMatrixChange(selectedBlocks, propName, value) {
    // (変更なし)
     const [, rStr, cStr] = propName.split('.'); const r = parseInt(rStr); const c = parseInt(cStr); const index = c * 3 + r;
     selectedBlocks.forEach(block => { const currentElements = block.getRotationMatrixXmlElements(); currentElements[index] = value; block.setRotationMatrixFromXmlElements(currentElements); });
}