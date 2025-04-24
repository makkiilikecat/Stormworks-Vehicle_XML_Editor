/**
 * @fileoverview XML編集パネルの表示制御、内容更新、イベント処理を統合管理します。
 * このモジュールは、xmlEditPanelVisibility.js, xmlEditPanelHandler.js, xmlEditPanelContent.js の
 * 機能を統合し、XML編集モードに関連するUI操作を一元的に扱います。
 */

// --- 必要なモジュールや関数をインポート ---
import { getSelectedBlocks } from '../interactions/selectionState.js'; // 選択中のブロックを取得
import { addAction } from '../state/historyManager.js';                 // アンドゥ履歴登録
import { showPopup } from './popupUtils.js';                            // ポップアップメッセージ表示
import { getBlockDefinition } from '../data/blockDefinitions.js';       // ブロック定義取得
import { rotationMatrixFromXmlElements, rotationMatrixToXmlElements } from '../utils/coordinateConverter.js'; // 座標変換 (未使用だが将来のため残す)

// --- DOM要素キャッシュ ---
/** @type {HTMLElement | null} XML編集パネルのメイン要素 */
let panel = null;
/** @type {HTMLElement | null} パネル内の情報表示用テキスト要素 */
let infoText = null;
/** @type {HTMLElement | null} 動的プロパティ入力欄を格納するコンテナ要素 */
let dynamicPropsContainer = null;
/** @type {HTMLElement | null} パネル格納/展開ボタン */
let togglePanelButton = null;
/** @type {{x: HTMLElement|null, y: HTMLElement|null, z: HTMLElement|null}} vp (座標) 入力欄 */
const vpInputs = { x: null, y: null, z: null };
/** @type {HTMLElement | null} t (向き) 入力欄 */
let tInput = null;
/** @type {Object<string, HTMLElement|null>} r (回転行列) 入力欄 (キーは 'r.c' 形式) */
const rInputs = {};
/** @type {Array<HTMLElement>} 固定入力欄 (vp, t, r) の要素配列 */
let fixedInputs = [];

// --- 状態 ---
/** @type {boolean} イベントリスナーが初期化されたか */
let isInitialized = false;
/** @type {boolean} パネルが格納されているか */
let xmlPanelCollapsed = false;

/**
 * XML編集パネル関連の初期化を行います。
 * DOM要素への参照を取得し、イベントリスナーを設定します。
 * uiInitializer.js から呼び出されることを想定しています。
 * @param {object} appStateRef - アプリケーション状態 (現状は直接利用しないが、将来的な拡張のため引数として保持)。
 */
export function initializeXmlPanel(appStateRef) {
    console.log("[XmlPanelHandler] 初期化中...");

    // --- DOM要素を取得 ---
    panel = document.getElementById('xml-edit-panel');
    infoText = document.getElementById('xml-edit-info');
    dynamicPropsContainer = document.getElementById('xml-edit-dynamic-props');
    togglePanelButton = document.getElementById('toggle-xml-panel');
    vpInputs.x = document.getElementById('edit-vp-x');
    vpInputs.y = document.getElementById('edit-vp-y');
    vpInputs.z = document.getElementById('edit-vp-z');
    tInput = document.getElementById('edit-t');
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            // 'r.c' 形式 (0-indexed) をキーとして、対応する要素を取得
            rInputs[`${r}.${c}`] = document.getElementById(`edit-r-${r+1}${c+1}`);
        }
    }
    // 固定入力欄のリストを作成 (存在しない要素は除外)
    fixedInputs = [ ...Object.values(vpInputs), tInput, ...Object.values(rInputs) ].filter(Boolean);

    // 必須要素が見つからない場合はエラーログを出力して終了
    if (!panel || !infoText || !dynamicPropsContainer || !togglePanelButton || fixedInputs.length < 13) { // vp(3)+t(1)+r(9)=13
        console.error("[XmlPanelHandler] XML編集パネルの必須要素が見つかりません。初期化を中断します。");
        return;
    }

    // --- イベントリスナー設定 ---
    // パネル格納/展開ボタン
    togglePanelButton.addEventListener('click', toggleXmlPanelCollapse);
    // 入力欄へのリスナー設定 (固定 + 動的)
    setupXmlEditListeners();

    // --- 初期状態 ---
    panel.style.display = 'none'; // 初期状態では非表示
    panel.classList.toggle('collapsed', xmlPanelCollapsed); // 初期格納状態を反映

    console.log("[XmlPanelHandler] 初期化完了。");
}

// --- 表示制御 ---

/**
 * XML編集パネルを表示します。
 * 表示時に現在の選択状態に基づいて内容を更新します。
 */
export function showXmlEditPanel() {
    if (!panel) return; // パネル要素がなければ何もしない
    panel.style.display = 'block'; // 表示
    updateXmlEditUI(); // 内容を更新
    // イベントリスナーは initializeXmlPanel で一度だけ設定される
}

/**
 * XML編集パネルを非表示にします。
 */
export function hideXmlEditPanel() {
    if (panel) panel.style.display = 'none'; // 非表示
}

/**
 * XML編集パネルの格納/展開状態を切り替えます。
 * @private Internal helper function.
 */
function toggleXmlPanelCollapse() {
    xmlPanelCollapsed = !xmlPanelCollapsed; // 状態を反転
    panel?.classList.toggle('collapsed', xmlPanelCollapsed); // CSSクラスを切り替え
    console.log(`[XmlPanelHandler] XMLパネル ${xmlPanelCollapsed ? '格納' : '展開'}`);
}

// --- 内容更新 ---

/**
 * 現在のブロック選択状態に基づいて、XML編集パネルのUI内容全体を更新します。
 * 情報テキスト、固定入力欄、動的プロパティ入力欄を更新します。
 */
export function updateXmlEditUI() {
    // パネル非表示、または必須要素がなければ処理しない
    if (!panel || panel.style.display === 'none' || !infoText || !dynamicPropsContainer) {
        return;
    }

    const selected = getSelectedBlocks(); // 現在選択中のブロックを取得
    const count = selected.length;

    // まず入力欄をクリア/リセット
    clearFixedInputs();
    dynamicPropsContainer.innerHTML = ''; // 動的プロパティ欄を空にする

    // 選択されていない場合
    if (count === 0) {
        infoText.textContent = "ブロックが選択されていません。";
        disableFixedInputs(true); // 全ての入力欄を無効化
        return;
    }

    // 選択されているブロックのタイプが全て同じかチェック
    const firstBlockDefId = selected[0].definitionId;
    const isSameType = selected.every(block => block.definitionId === firstBlockDefId);

    // タイプが混在している場合
    if (!isSameType) {
        infoText.textContent = `${count}個の異なるタイプのブロックを選択中。編集できません。`;
        disableFixedInputs(true); // 全ての入力欄を無効化
        return;
    }

    // 選択状態に応じた情報テキストを設定
    infoText.textContent = (count === 1)
        ? `ID: ${selected[0].id} (タイプ: ${firstBlockDefId})`
        : `${count}個の同タイプブロック (${firstBlockDefId}) を選択中。`;

    // 入力欄を有効化し、内容を設定
    disableFixedInputs(false);
    populateStandardInputs(selected); // 固定入力欄 (vp, t, r) の内容を設定
    populateDynamicInputs(selected);  // 動的プロパティ入力欄を生成・設定
}

/**
 * 固定入力欄 (`vp`, `t`, `r`) の値をクリアし、プレースホルダーを削除し、
 * 必要に応じて無効化します。
 * @param {boolean} [disable=true] - 入力欄を無効化するかどうか。
 * @private Internal helper function.
 */
function clearFixedInputs(disable = true) {
    fixedInputs.forEach(input => {
        if (input) {
            input.value = '';                   // 値をクリア
            input.placeholder = '';             // プレースホルダーをクリア
            input.classList.remove('multiple-selected'); // 複数選択表示クラスを削除
            input.disabled = disable;           // 有効/無効を設定
        }
    });
}

/**
 * 固定入力欄 (`vp`, `t`, `r`) を有効化または無効化します。
 * @param {boolean} disable - 無効化する場合は true、有効化する場合は false。
 * @private Internal helper function.
 */
function disableFixedInputs(disable) {
    fixedInputs.forEach(input => { if (input) input.disabled = disable; });
}

/**
 * 固定入力欄 (`vp`, `t`, `r`) に、選択されたブロックの値を設定します。
 * 複数ブロックが選択されており、値が異なる場合はプレースホルダーを表示します。
 * @param {BlockData[]} selectedBlocks - 選択中のブロックデータ配列。
 * @private Internal helper function.
 */
function populateStandardInputs(selectedBlocks) {
    if (!selectedBlocks || selectedBlocks.length === 0) return; // 選択がなければ何もしない

    const count = selectedBlocks.length;
    // 各プロパティの値を保持するための Set を用意
    const values = { t: new Set(), vp: { x: new Set(), y: new Set(), z: new Set() }, r: {} };
    for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) { values.r[`${r}.${c}`] = new Set(); } }

    // 全ての選択ブロックから値を取得し、Set に追加
    selectedBlocks.forEach(block => {
        values.t.add(block.tAttribute);
        const pos = block.getPositionXml();
        values.vp.x.add(pos.x); values.vp.y.add(pos.y); values.vp.z.add(pos.z);
        const rot = block.getRotationMatrixXmlElements(); // [r11, r21, r31, r12, ...]
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                // XML要素のインデックス (列優先) から値を取得
                values.r[`${r}.${c}`].add(rot[c * 3 + r]);
            }
        }
    });

    // 各入力欄に値を設定するヘルパー関数
    const setInput = (input, valueSet) => {
        if (!input) return; // 要素がなければ何もしない
        const isMultiple = valueSet.size > 1; // 値が複数あるか (Setのサイズで判定)
        input.classList.toggle('multiple-selected', isMultiple); // 複数あれば専用クラスを付与
        input.placeholder = isMultiple ? '複数' : ''; // 複数あればプレースホルダー設定
        // 値が単一ならその値を設定、複数または0個なら空文字を設定
        input.value = isMultiple ? '' : (valueSet.size === 1 ? valueSet.values().next().value : '');
    };

    // 各固定入力欄に値を設定
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
 * 選択されたブロックに基づいて、動的にプロパティ入力欄 (`vp`, `t`, `r` を除く) を生成・配置します。
 * @param {BlockData[]} selectedBlocks - 選択中のブロックデータ配列 (単一または同タイプ複数)。
 * @private Internal helper function.
 */
function populateDynamicInputs(selectedBlocks) {
    if (!selectedBlocks || selectedBlocks.length === 0 || !dynamicPropsContainer) return;

    const firstBlock = selectedBlocks[0];
    const definition = getBlockDefinition(firstBlock.definitionId); // ブロック定義を取得

    // 表示すべきプロパティ情報を収集 (vp, t, r 以外)
    const propertiesToDisplay = collectProperties(selectedBlocks, definition)
                                 .filter(prop => prop.source !== 'standard'); // 標準(vp,t,r)を除外

    if (propertiesToDisplay.length === 0) return; // 動的プロパティがなければ終了

    // プロパティをグループごとにまとめる
    const groups = {}; // groupName -> [HTMLElement, HTMLElement, ...]
    propertiesToDisplay.forEach(propInfo => {
        const groupName = propInfo.group || 'Unknown'; // グループ名 (未定義なら'Unknown')
        if (!groups[groupName]) { groups[groupName] = []; }
        const inputElement = createPropertyInput(propInfo); // 入力要素を生成
        if (inputElement) { groups[groupName].push(inputElement); }
    });

    // グループの表示順序を決定 (Unknownを最後に)
    const groupOrder = [...Object.keys(groups).filter(g => g !== 'Unknown').sort(), 'Unknown'];

    // グループごとにDOMに追加
    groupOrder.forEach(groupName => {
        if (groups[groupName] && groups[groupName].length > 0) {
            const groupContainer = document.createElement('div');
            groupContainer.className = 'edit-group dynamic-group'; // グループ用クラス
            const header = document.createElement('h5'); // グループ見出し
            header.textContent = groupName;
            groupContainer.appendChild(header);
            // グループ内の各入力要素を追加
            groups[groupName].forEach(el => groupContainer.appendChild(el));
            dynamicPropsContainer.appendChild(groupContainer); // パネルに追加
        }
    });
}


/**
 * 表示・編集対象となる全てのプロパティ情報 (`vp`, `t`, `r` を含む) を
 * 選択中のブロックから収集・整理します。複数選択時の値の違いも考慮します。
 * @param {BlockData[]} selectedBlocks - 選択中のブロックデータ配列。
 * @param {object} definition - 選択中ブロックの定義オブジェクト。
 * @returns {Array<object>} 表示するプロパティ情報の配列。各要素は { name, type, source, group, value, isMultiple }。
 * @private Internal helper function.
 */
function collectProperties(selectedBlocks, definition) {
    // (xmlEditPanelContent.js から移動 - 変更なし)
    // この関数は標準プロパティ(vp,t,r)も収集するが、populateDynamicInputsでフィルタリングされる
    const propertiesMap = new Map();
    // 標準プロパティを事前に追加
    propertiesMap.set('t', { type: 'number', source: 'standard', group: 'Transform', values: new Set() });
    propertiesMap.set('vp.x', { type: 'number', source: 'standard', group: 'Transform', values: new Set() });
    propertiesMap.set('vp.y', { type: 'number', source: 'standard', group: 'Transform', values: new Set() });
    propertiesMap.set('vp.z', { type: 'number', source: 'standard', group: 'Transform', values: new Set() });
    for(let r=0; r<3; r++) for(let c=0; c<3; c++) { propertiesMap.set(`r.${r}.${c}`, { type: 'number', source: 'standard', group: 'Transform', values: new Set() }); }
    // ブロック定義からのプロパティを追加
    (definition.properties || []).forEach(propDef => {
        propertiesMap.set(propDef.name, { type: propDef.type, source: propDef.source, group: propDef.group, values: new Set(), defaultValue: propDef.defaultValue });
    });
    // BlockDataに直接保存されている追加属性 (<c>, <o>) を追加 (定義にないもの)
    selectedBlocks.forEach(block => {
        block.cAttributes.forEach((value, name) => { if (!propertiesMap.has(name)) propertiesMap.set(name, { type: 'string', source: 'c', group: 'Unknown', values: new Set() }); });
        block.oAttributes.forEach((value, name) => { if (!propertiesMap.has(name)) propertiesMap.set(name, { type: 'string', source: 'o', group: 'Unknown', values: new Set() }); });
    });
    // 各ブロックから実際の値を取得してSetに追加
    selectedBlocks.forEach(block => {
        const pos = block.getPositionXml(); const rot = block.getRotationMatrixXmlElements();
        propertiesMap.forEach((propInfo, name) => {
            let value;
            // プロパティのソースに応じて値を取得
            if (propInfo.source === 'standard') { if (name === 't') value = block.tAttribute; else if (name === 'vp.x') value = pos.x; else if (name === 'vp.y') value = pos.y; else if (name === 'vp.z') value = pos.z; else if (name.startsWith('r.')) { const [, rStr, cStr] = name.split('.'); const r=parseInt(rStr); const c=parseInt(cStr); value = rot[c * 3 + r]; } }
            else if (propInfo.source === 'c') { value = block.cAttributes.get(name); }
            else if (propInfo.source === 'o') { value = block.oAttributes.get(name); }
            // 値が存在しない場合はデフォルト値を使用
            const displayValue = (value !== undefined && value !== null) ? value : propInfo.defaultValue;
             // 値をSetに追加 (booleanはtrue/falseで統一)
             if (displayValue !== undefined && displayValue !== null) {
                 if (propInfo.type === 'boolean') { propInfo.values.add(displayValue.toString().toLowerCase() === 'true'); }
                 else { propInfo.values.add(displayValue); }
             }
        });
    });
    // 結果を整形して配列にする
    const result = [];
    propertiesMap.forEach((propInfo, name) => {
        const valueSet = propInfo.values;
        const isMultiple = valueSet.size > 1; // 値が複数あるか
        // 表示する値 (単一ならその値、なければデフォルト値、booleanはtrue/falseで)
        let displayValue = (valueSet.size > 0) ? valueSet.values().next().value : propInfo.defaultValue;
        if (propInfo.type === 'boolean' && typeof displayValue === 'boolean') { displayValue = displayValue; }
        else if (displayValue === undefined || displayValue === null) { displayValue = ''; } // 未定義なら空文字
        result.push({ name: name, type: propInfo.type, source: propInfo.source, group: propInfo.group, value: displayValue, isMultiple: isMultiple });
    });
     // プロパティの表示順をソート (Transform -> その他定義順 -> Unknown)
     result.sort((a, b) => {
         const groupOrder = {'Transform': 1, 'Robotics': 2, 'Display': 3}; // 例: グループ優先度
         const groupA = groupOrder[a.group] || 99;
         const groupB = groupOrder[b.group] || 99;
         if (groupA !== groupB) return groupA - groupB; // グループでソート
         // Transform内の順序
         const transformOrder = ['t', 'vp.x', 'vp.y', 'vp.z', 'r.0.0', 'r.1.0', 'r.2.0', 'r.0.1', 'r.1.1', 'r.2.1', 'r.0.2', 'r.1.2', 'r.2.2'];
         const idxA = transformOrder.indexOf(a.name); const idxB = transformOrder.indexOf(b.name);
         if (idxA !== -1 && idxB !== -1) return idxA - idxB;
         if (idxA !== -1) return -1; if (idxB !== -1) return 1;
         // それ以外は名前順
         return a.name.localeCompare(b.name);
     });
    return result;
}


/**
 * プロパティ情報に基づいて、ラベルと入力要素 (input) を含むHTML要素を作成します。
 * @param {object} propInfo - プロパティ情報 ({ name, type, source, group, value, isMultiple })。
 * @returns {HTMLElement | null} 生成された入力行要素 (div)。
 * @private Internal helper function.
 */
function createPropertyInput(propInfo) {
    // (xmlEditPanelContent.js から移動 - 変更なし)
    const container = document.createElement('div'); container.className = 'property-input-row';
    const label = document.createElement('label');
    let labelText = propInfo.name; // ラベル表示名 (将来的に別名を設定可能)
    label.textContent = labelText + ':'; // コロン追加
    label.title = `${propInfo.group} / ${propInfo.type} / Source:<${propInfo.source}>`; // ツールチップ
    container.appendChild(label);
    let input;
    // プロパティの型に応じて input 要素を作成
    switch (propInfo.type) {
        case 'boolean':
            input = document.createElement('input'); input.type = 'checkbox';
            // 複数選択で値が異なる場合は indeterminate 状態にする
            if (propInfo.isMultiple) { input.indeterminate = true; input.checked = false; input.title = "複数の値"; }
            else { input.checked = propInfo.value === true; input.indeterminate = false; }
            break;
        case 'number':
            input = document.createElement('input'); input.type = 'number'; input.step = 'any'; // 小数も許可
             // 複数選択で値が異なる場合はプレースホルダー表示
            if (propInfo.isMultiple) { input.value = ''; input.placeholder = '複数の値'; input.classList.add('multiple-selected'); }
            else { input.value = propInfo.value; }
            break;
        case 'string':
        default: // 不明な型もテキストとして扱う
            input = document.createElement('input'); input.type = 'text';
             // 複数選択で値が異なる場合はプレースホルダー表示
            if (propInfo.isMultiple) { input.value = ''; input.placeholder = '複数の値'; input.classList.add('multiple-selected'); }
            else { input.value = propInfo.value; }
            break;
    }
    // データ属性に入力欄の情報を格納 (イベントハンドラで利用)
    input.dataset.propertyName = propInfo.name;
    input.dataset.propertySource = propInfo.source;
    input.dataset.propertyType = propInfo.type;
    container.appendChild(input);
    return container;
}

// --- イベント処理 ---

/**
 * 固定入力欄および動的入力欄にイベントリスナーを設定します。
 * 'change' (値変更確定時) と 'keydown' (Enterキー) イベントを捕捉します。
 * @private Internal setup function.
 */
function setupXmlEditListeners() {
    // (xmlEditPanelHandler.js から移動)
    // 固定入力欄へのリスナー設定
    if (fixedInputs.length < 13) { console.error("[XmlPanelHandler] 固定入力要素の一部が見つかりません。"); } // 要素数チェック
    console.log(`[XmlPanelHandler] ${fixedInputs.length}個の固定入力欄にリスナーを設定します...`);
    fixedInputs.forEach(input => {
        input.addEventListener('change', handleInputChange); // 値変更時
        input.addEventListener('keydown', (event) => { // Enterキー押下時
            if (event.key === 'Enter') {
                handleInputChange(event); // 変更を適用
                event.target.blur();      // フォーカスを外す
            }
        });
    });
    console.log("[XmlPanelHandler] 固定入力欄へのリスナー設定完了。");

    // 動的プロパティコンテナへのイベント委任リスナー設定
    if (!dynamicPropsContainer) { console.error("[XmlPanelHandler] 動的プロパティコンテナ不明。"); return; }
    console.log("[XmlPanelHandler] 動的入力欄コンテナにイベント委任リスナーを設定します...");
    dynamicPropsContainer.addEventListener('change', handleInputChange); // 子孫 input の change イベントを捕捉
    dynamicPropsContainer.addEventListener('keydown', (event) => { // 子孫 input の keydown イベントを捕捉
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
            handleInputChange(event); // 変更を適用
            event.target.blur();      // フォーカスを外す
        }
    });
    console.log("[XmlPanelHandler] 動的入力欄のイベントリスナー設定完了。");
}

/**
 * 入力フィールドの値が変更された際のイベントハンドラ。
 * 値の検証、BlockDataへの適用、アンドゥ履歴への登録を行います。
 * @param {Event} event - 'change' または 'keydown' (Enter) イベントオブジェクト。
 * @private Event handler.
 */
function handleInputChange(event) {
    // (xmlEditPanelHandler.js から移動)
    const input = event.target;
    // input 要素で、必要なデータ属性を持っているか確認
    if (!input || input.tagName !== 'INPUT' || !input.dataset.propertyName) {
        return; // 関係ない要素からのイベントは無視
    }

    const selected = getSelectedBlocks(); // 現在選択中のブロックを取得
    if (selected.length === 0) return; // 選択されていなければ何もしない

    // 変更されたプロパティの情報を取得
    const propName = input.dataset.propertyName;
    const propSource = input.dataset.propertySource;
    const propType = input.dataset.propertyType;

    // --- 値のパースと検証 ---
    let newValue; // 変更後の値 (型変換後)
    let isValid = true; // 値が有効か
    try {
        if (propType === 'boolean') { newValue = input.checked; }
        else if (propType === 'number') {
            newValue = parseFloat(input.value); // 文字列を数値に変換
            if (isNaN(newValue)) isValid = false; // 数値でなければ無効
            else {
                // 標準プロパティ (vp, t, r) は整数に丸める
                if (propName === 't' || propName.startsWith('vp.') || propName.startsWith('r.')) {
                    newValue = Math.round(newValue);
                    // t属性は 0-7 の範囲内かチェック
                    if (propName === 't' && (newValue < 0 || newValue > 7)) isValid = false;
                }
            }
        } else { // string または不明な型
            newValue = input.value; // そのまま文字列として使用
        }
    } catch (e) {
        isValid = false;
        console.error(`[XmlPanelHandler] 値のパース/検証中にエラー (${propName}):`, e);
    }
    // 無効な値の場合はポップアップ表示してUIを元に戻し、処理中断
    if (!isValid) {
        showPopup(`無効な値が入力されました (${propType})`, 'warning', 2000);
        updateXmlEditUI(); // UIを元の値に戻す
        return;
    }

    // --- 履歴情報の作成 ---
    const changes = []; // 各ブロックの変更情報を格納する配列
    selected.forEach(block => {
        const oldValue = getBlockValue(block, propName, propSource); // 変更前の値を取得
        // 変更前後の値を比較可能な文字列形式に変換 (null/undefined 対策)
        const oldValueStr = (oldValue !== undefined && oldValue !== null) ? (typeof oldValue === 'boolean' ? oldValue.toString() : oldValue) : '';
        const newValueStr = (newValue !== undefined && newValue !== null) ? (typeof newValue === 'boolean' ? newValue.toString() : newValue) : '';
        // 値が実際に変更されたブロックのみを履歴対象とする
        if (oldValueStr.toString() !== newValueStr.toString()) {
            changes.push({ blockId: block.id, propName, propSource, propType, oldValue: oldValueStr, newValue: newValueStr });
        }
    });
    // 変更がなければ何もしない (チェックボックスの indeterminate 解除のためUI更新は行う場合あり)
    if (changes.length === 0) {
        console.log(`[XmlPanelHandler] ${propName}: 値の変更はありませんでした。`);
        if (input.type === 'checkbox' && input.indeterminate) {
            updateXmlEditUI(); // indeterminate 状態を解除するためにUI更新
        }
        return;
    }

    // --- BlockData への適用 ---
    console.log(`[XmlPanelHandler] ${propName} に ${newValue} (${propType}) を適用中 (${changes.length} blocks)...`);
    try {
        changes.forEach(change => {
            const block = selected.find(b => b.id === change.blockId);
            if (!block) return; // 対象ブロックが見つからなければスキップ
            // 適用する値を履歴情報から再取得 (型を再確認)
            let valueToApply;
            if (change.propType === 'boolean') valueToApply = (change.newValue === 'true');
            else if (change.propType === 'number') valueToApply = parseFloat(change.newValue);
            else valueToApply = change.newValue;

            // プロパティのソースに応じて BlockData の適切なメソッドを呼び出す
            if (change.propSource === 'standard') {
                if (change.propName === 't') block.setTAttribute(valueToApply);
                else if (change.propName.startsWith('vp.')) applyVectorChange(selected, 'vp', change.propName.slice(3), valueToApply); // Vector3ヘルパー呼び出し
                else if (change.propName.startsWith('r.')) applyMatrixChange(selected, change.propName, valueToApply); // Matrix3x3ヘルパー呼び出し
            }
            else if (change.propSource === 'c') { block.setCAttribute(change.propName, valueToApply.toString()); } // <c>属性として設定
            else if (change.propSource === 'o') { block.setOAttribute(change.propName, valueToApply.toString()); } // <o>属性として設定
        });
    } catch (applyError) {
        console.error(`[XmlPanelHandler] BlockDataへの値適用中にエラー:`, applyError);
        showPopup("値の適用中にエラーが発生しました", "error");
        updateXmlEditUI(); // エラー時はUIを元に戻す
        return;
    }

    // --- アンドゥ履歴登録 ---
    addAction({ type: 'SET_PROPERTIES', changes }); // 変更情報を履歴に追加

    // --- UI更新 ---
    // 複数選択表示を解除
    if (input.classList.contains('multiple-selected')) {
        input.classList.remove('multiple-selected');
        input.placeholder = '';
    }
    // チェックボックスの indeterminate 状態を解除
    if (input.type === 'checkbox' && input.indeterminate) {
        input.indeterminate = false;
    }
    // 適用後の値を入力欄に反映 (不要かもしれないが念のため)
    if (propType === 'boolean') input.checked = newValue;
    else input.value = newValue;

    console.log(`[XmlPanelHandler] ${propName} の変更を適用し、履歴に登録しました。`);
    // ブロック情報が変更されたことを通知 (情報表示エリアなどの更新のため)
    document.dispatchEvent(new CustomEvent('blocksChanged'));
}

/**
 * BlockData インスタンスから指定されたプロパティの値を取得するヘルパー関数。
 * @param {BlockData} block - 対象の BlockData。
 * @param {string} propName - プロパティ名 ('t', 'vp.x', 'max_force_scalar' など)。
 * @param {string} propSource - プロパティのソース ('standard', 'c', 'o')。
 * @returns {*} プロパティの値。見つからない場合は undefined。
 * @private Internal helper function.
 */
function getBlockValue(block, propName, propSource) {
    // (xmlEditPanelHandler.js から移動 - 変更なし)
    if (propSource === 'standard') {
        if (propName === 't') return block.tAttribute;
        if (propName === 'vp.x') return block.getPositionXml().x;
        if (propName === 'vp.y') return block.getPositionXml().y;
        if (propName === 'vp.z') return block.getPositionXml().z;
        if (propName.startsWith('r.')) {
            // r.R.C (0-indexed) 形式
            const [, rStr, cStr] = propName.split('.');
            const r = parseInt(rStr); const c = parseInt(cStr);
            const elements = block.getRotationMatrixXmlElements(); // [r11, r21, r31, r12, ...]
            return elements[c * 3 + r]; // 列優先インデックス
        }
    } else if (propSource === 'c') { return block.cAttributes.get(propName); }
    else if (propSource === 'o') { return block.oAttributes.get(propName); }
    return undefined; // 不明な場合は undefined
}

/**
 * 選択中の全ブロックに対して、Vector3 (vp) プロパティの特定軸の値を一括で適用するヘルパー関数。
 * @param {BlockData[]} selectedBlocks - 選択中のブロック配列。
 * @param {string} vecName - ベクトル名 ('vp')。
 * @param {'x'|'y'|'z'} axis - 変更する軸。
 * @param {number} value - 設定する値。
 * @private Internal helper function.
 */
function applyVectorChange(selectedBlocks, vecName, axis, value) {
    // (xmlEditPanelHandler.js から移動 - 変更なし)
     selectedBlocks.forEach(block => {
         const currentPos = block.getPositionXml();
         const newPos = { ...currentPos };
         newPos[axis] = value; // 指定された軸の値のみ更新
         block.setPositionFromXml(newPos.x, newPos.y, newPos.z); // 新しい座標で設定
     });
}

/**
 * 選択中の全ブロックに対して、Matrix3x3 (r) プロパティの特定要素の値を一括で適用するヘルパー関数。
 * @param {BlockData[]} selectedBlocks - 選択中のブロック配列。
 * @param {string} propName - 変更する要素名 ('r.R.C' 形式)。
 * @param {number} value - 設定する値 (整数に丸められる)。
 * @private Internal helper function.
 */
function applyMatrixChange(selectedBlocks, propName, value) {
    // (xmlEditPanelHandler.js から移動 - 変更なし)
     const [, rStr, cStr] = propName.split('.'); // "r.R.C" を分解
     const r = parseInt(rStr); const c = parseInt(cStr);
     const index = c * 3 + r; // 列優先インデックスを計算
     selectedBlocks.forEach(block => {
         const currentElements = block.getRotationMatrixXmlElements(); // 現在の行列要素を取得
         currentElements[index] = Math.round(value); // 指定箇所を整数値で更新
         block.setRotationMatrixFromXmlElements(currentElements); // 新しい要素配列で設定
     });
}