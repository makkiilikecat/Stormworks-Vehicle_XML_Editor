/**
 * @fileoverview XML編集パネルの内容（プロパティ入力欄）を動的に生成・更新します。
 * 元の xmlEditUI.js から分離。
 * 【主な変更点】
 * - `vp`, `t`, `r` を動的生成から除外。
 * - 固定入力欄 (`vp`, `t`, `r`) を更新する `populateStandardInputs` を追加。
 * - 動的入力欄生成を `populateDynamicInputs` に改名。
 * - `updateXmlEditUI` が両方の populate 関数を呼び出すように変更。
 */

import { getSelectedBlocks } from '../interactions/selectionState.js'; // 選択中のブロック取得
import { getBlockDefinition } from '../data/blockDefinitions.js';   // ブロック定義取得

// --- UI要素への参照 ---
const panel = document.getElementById('xml-edit-panel'); // 表示状態確認用
const infoText = document.getElementById('xml-edit-info');
const dynamicPropsContainer = document.getElementById('xml-edit-dynamic-props'); // 動的プロパティ用

// ★追加: 固定入力欄への参照
const vpInputs = {
    x: document.getElementById('edit-vp-x'),
    y: document.getElementById('edit-vp-y'),
    z: document.getElementById('edit-vp-z'),
};
const tInput = document.getElementById('edit-t');
const rInputs = {};
for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) { rInputs[`${r}.${c}`] = document.getElementById(`edit-r-${r+1}${c+1}`); } } // キーを 'r.c' 形式に

/**
 * 現在のブロック選択状態に基づいて、XML編集パネルのUI内容を更新。
 * 固定入力欄と動的入力欄の両方を更新する。
 */
export function updateXmlEditUI() {
    if (!panel || panel.style.display === 'none' || !infoText) { return; } // パネル非表示なら何もしない

    const selected = getSelectedBlocks();
    const count = selected.length;

    // 固定入力欄と動的コンテナをクリア/リセット
    clearFixedInputs();
    if (dynamicPropsContainer) dynamicPropsContainer.innerHTML = '';

    if (count === 0) {
        infoText.textContent = "ブロックが選択されていません。";
        disableFixedInputs(true); // 固定入力欄も無効化
        return;
    }

    // タイプ混在チェック
    const firstBlockDefId = selected[0].definitionId;
    const isSameType = selected.every(block => block.definitionId === firstBlockDefId);

    if (!isSameType) {
        infoText.textContent = `${count}個の異なるタイプのブロックを選択中。編集できません。`;
        disableFixedInputs(true); // 固定入力欄も無効化
        return;
    }

    // 情報テキスト設定
    infoText.textContent = (count === 1)
        ? `ブロックID: ${selected[0].id} (タイプ: ${firstBlockDefId})`
        : `${count}個の同タイプブロック (${firstBlockDefId}) を選択中。`;

    // 固定入力欄と動的入力欄を生成・更新
    disableFixedInputs(false); // まず有効化
    populateStandardInputs(selected);
    populateDynamicInputs(selected); // 動的プロパティ生成
}

/**
 * 固定入力欄 (`vp`, `t`, `r`) の値をクリアし、必要に応じて無効化する。
 * @param {boolean} disable - 無効化するかどうか。
 * @private
 */
function clearFixedInputs(disable = true) {
    const allFixedInputs = [
        ...Object.values(vpInputs),
        tInput,
        ...Object.values(rInputs)
    ];
    allFixedInputs.forEach(input => {
        if (input) {
            input.value = '';
            input.placeholder = '';
            input.classList.remove('multiple-selected');
            input.disabled = disable;
        }
    });
}
/**
 * 固定入力欄 (`vp`, `t`, `r`) を有効化/無効化する。
 * @param {boolean} disable - 無効化するかどうか。
 * @private
 */
function disableFixedInputs(disable) {
    const allFixedInputs = [
        ...Object.values(vpInputs),
        tInput,
        ...Object.values(rInputs)
    ];
    allFixedInputs.forEach(input => { if (input) input.disabled = disable; });
}


/**
 * 固定入力欄 (`vp`, `t`, `r`) に選択ブロックの値を設定する。
 * 複数選択時に値が異なればプレースホルダーを表示。
 * @param {BlockData[]} selectedBlocks - 選択中のブロック。
 * @private
 */
function populateStandardInputs(selectedBlocks) {
    if (!selectedBlocks || selectedBlocks.length === 0) return;

    const count = selectedBlocks.length;

    // --- 値を収集 ---
    const values = { t: new Set(), vp: { x: new Set(), y: new Set(), z: new Set() }, r: {} };
    for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) { values.r[`${r}.${c}`] = new Set(); } }

    selectedBlocks.forEach(block => {
        values.t.add(block.tAttribute);
        const pos = block.getPositionXml();
        values.vp.x.add(pos.x); values.vp.y.add(pos.y); values.vp.z.add(pos.z);
        const rot = block.getRotationMatrixXmlElements();
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                values.r[`${r}.${c}`].add(rot[c * 3 + r]);
            }
        }
    });

    // --- UIに反映 ---
    const setInput = (input, valueSet) => {
        if (!input) return;
        const isMultiple = valueSet.size > 1;
        input.classList.toggle('multiple-selected', isMultiple);
        input.placeholder = isMultiple ? '複数' : '';
        input.value = isMultiple ? '' : (valueSet.size === 1 ? valueSet.values().next().value : '');
    };

    setInput(tInput, values.t);
    setInput(vpInputs.x, values.vp.x);
    setInput(vpInputs.y, values.vp.y);
    setInput(vpInputs.z, values.vp.z);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            setInput(rInputs[`${r}.${c}`], values.r[`${r}.${c}`]);
        }
    }
}


/**
 * 選択されたブロックに基づいて、動的にプロパティ入力欄 (`vp`, `t`, `r` を除く) を生成・配置する。
 * @param {BlockData[]} selectedBlocks - 選択中のブロック (単一または同タイプ複数)。
 * @private
 */
function populateDynamicInputs(selectedBlocks) {
    if (!selectedBlocks || selectedBlocks.length === 0 || !dynamicPropsContainer) return;
    // dynamicPropsContainer のクリアは updateXmlEditUI で実施済み

    const firstBlock = selectedBlocks[0];
    const definition = getBlockDefinition(firstBlock.definitionId);
    // ★修正: vp, t, r を除外してプロパティ収集
    const propertiesToDisplay = collectProperties(selectedBlocks, definition)
                                 .filter(prop => prop.source !== 'standard'); // 標準プロパティを除外

    if (propertiesToDisplay.length === 0) return; // 動的プロパティがなければ終了

    const groups = {}; // グループ名 -> UI要素の配列
    propertiesToDisplay.forEach(propInfo => {
        const groupName = propInfo.group || 'Unknown';
        if (!groups[groupName]) { groups[groupName] = []; }
        const inputElement = createPropertyInput(propInfo); // UI要素生成
        if (inputElement) { groups[groupName].push(inputElement); }
    });

    // ★修正: Transform グループは存在しないはずなので除外
    const groupOrder = [...Object.keys(groups).filter(g => g !== 'Unknown').sort(), 'Unknown'];

    // グループごとにDOMに追加
    groupOrder.forEach(groupName => {
        if (groups[groupName] && groups[groupName].length > 0) {
            const groupContainer = document.createElement('div');
            groupContainer.className = 'edit-group dynamic-group'; // クラス追加
             const header = document.createElement('h5'); header.textContent = groupName;
             groupContainer.appendChild(header); groupContainer.appendChild(document.createElement('hr'));
            groups[groupName].forEach(el => groupContainer.appendChild(el));
            dynamicPropsContainer.appendChild(groupContainer);
        }
    });
}


/**
 * 表示・編集対象となるプロパティ情報 (`vp`, `t`, `r` を含む) を収集・整理する。
 * ★注意: この関数自体は修正せず、呼び出し元 (populateDynamicInputs) でフィルタリングする。
 * @param {BlockData[]} selectedBlocks - 選択中のブロック。
 * @param {object} definition - ブロック定義オブジェクト。
 * @returns {Array<object>} 表示するプロパティ情報の配列。
 * @private
 */
function collectProperties(selectedBlocks, definition) {
    // (元のロジックと同じ - vp, t, r も含めて収集)
    const propertiesMap = new Map();
    propertiesMap.set('t', { type: 'number', source: 'standard', group: 'Transform', values: new Set() });
    propertiesMap.set('vp.x', { type: 'number', source: 'standard', group: 'Transform', values: new Set() });
    propertiesMap.set('vp.y', { type: 'number', source: 'standard', group: 'Transform', values: new Set() });
    propertiesMap.set('vp.z', { type: 'number', source: 'standard', group: 'Transform', values: new Set() });
    for(let r=0; r<3; r++) for(let c=0; c<3; c++) { propertiesMap.set(`r.${r}.${c}`, { type: 'number', source: 'standard', group: 'Transform', values: new Set() }); }
    (definition.properties || []).forEach(propDef => { propertiesMap.set(propDef.name, { type: propDef.type, source: propDef.source, group: propDef.group, values: new Set(), defaultValue: propDef.defaultValue }); });
    selectedBlocks.forEach(block => { block.cAttributes.forEach((value, name) => { if (!propertiesMap.has(name)) propertiesMap.set(name, { type: 'string', source: 'c', group: 'Unknown', values: new Set() }); }); block.oAttributes.forEach((value, name) => { if (!propertiesMap.has(name)) propertiesMap.set(name, { type: 'string', source: 'o', group: 'Unknown', values: new Set() }); }); });
    selectedBlocks.forEach(block => {
        const pos = block.getPositionXml(); const rot = block.getRotationMatrixXmlElements();
        propertiesMap.forEach((propInfo, name) => {
            let value;
            if (propInfo.source === 'standard') { if (name === 't') value = block.tAttribute; else if (name === 'vp.x') value = pos.x; else if (name === 'vp.y') value = pos.y; else if (name === 'vp.z') value = pos.z; else if (name.startsWith('r.')) { const [, r, c] = name.split('.'); value = rot[parseInt(c) * 3 + parseInt(r)]; } }
            else if (propInfo.source === 'c') { value = block.cAttributes.get(name); } else if (propInfo.source === 'o') { value = block.oAttributes.get(name); }
            const displayValue = (value !== undefined && value !== null) ? value : propInfo.defaultValue;
             if (displayValue !== undefined && displayValue !== null) { if (propInfo.type === 'boolean') { propInfo.values.add(displayValue.toString().toLowerCase() === 'true'); } else { propInfo.values.add(displayValue); } }
        });
    });
    const result = [];
    propertiesMap.forEach((propInfo, name) => { const valueSet = propInfo.values; const isMultiple = valueSet.size > 1; let displayValue = (valueSet.size > 0) ? valueSet.values().next().value : propInfo.defaultValue; if (propInfo.type === 'boolean' && typeof displayValue === 'boolean') { displayValue = displayValue; } else if (displayValue === undefined || displayValue === null) { displayValue = ''; } result.push({ name: name, type: propInfo.type, source: propInfo.source, group: propInfo.group, value: displayValue, isMultiple: isMultiple }); });
     result.sort((a, b) => { const order = ['t', 'vp.x', 'vp.y', 'vp.z', 'r.0.0', 'r.1.0', 'r.2.0', 'r.0.1', 'r.1.1', 'r.2.1', 'r.0.2', 'r.1.2', 'r.2.2']; const idxA = order.indexOf(a.name); const idxB = order.indexOf(b.name); if (idxA !== -1 && idxB !== -1) return idxA - idxB; if (idxA !== -1) return -1; if (idxB !== -1) return 1; return a.name.localeCompare(b.name); });
    return result;
}


/**
 * プロパティ情報に基づいて適切なHTML入力要素を作成する。
 * (元の実装と同じ)
 * @param {object} propInfo - プロパティ情報。
 * @returns {HTMLElement | null} 生成された入力行要素。
 * @private
 */
function createPropertyInput(propInfo) {
    const container = document.createElement('div'); container.className = 'property-input-row';
    const label = document.createElement('label');
    let labelText = propInfo.name; // ラベルはそのまま属性名に
    label.textContent = labelText + ':'; // コロン追加
    label.title = `${propInfo.group} / ${propInfo.type} / ${propInfo.source}`; container.appendChild(label);
    let input;
    switch (propInfo.type) {
        case 'boolean': input = document.createElement('input'); input.type = 'checkbox'; if (propInfo.isMultiple) { input.indeterminate = true; input.checked = false; input.title = "複数の値"; } else { input.checked = propInfo.value === true; input.indeterminate = false; } break;
        case 'number': input = document.createElement('input'); input.type = 'number'; input.step = 'any'; if (propInfo.isMultiple) { input.value = ''; input.placeholder = '複数の値'; input.classList.add('multiple-selected'); } else { input.value = propInfo.value; } break;
        case 'string': default: input = document.createElement('input'); input.type = 'text'; if (propInfo.isMultiple) { input.value = ''; input.placeholder = '複数の値'; input.classList.add('multiple-selected'); } else { input.value = propInfo.value; } break;
    }
    // データ属性にプロパティ情報を格納 (イベントハンドラで使用)
    input.dataset.propertyName = propInfo.name; input.dataset.propertySource = propInfo.source; input.dataset.propertyType = propInfo.type;
    container.appendChild(input); return container;
}