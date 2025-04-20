import * as THREE from 'three'; // Matrix4のため
import { getSelectedBlocks } from '../interactions/selectionHandler.js';
import { addAction } from '../state/historyManager.js';

// --- UI要素への参照 ---
const panel = document.getElementById('xml-edit-panel');
const infoText = document.getElementById('xml-edit-info');
// 座標入力フィールド
const vpInputs = {
    x: document.getElementById('edit-vp-x'),
    y: document.getElementById('edit-vp-y'),
    z: document.getElementById('edit-vp-z'),
};
// 回転行列入力フィールド (キー: 'r{row}{col}', 例: 'r11')
const rInputs = {};
for (let r = 1; r <= 3; r++) {
    for (let c = 1; c <= 3; c++) {
        // XMLは列優先 r11, r21, r31, r12 ... なので、IDもそれに合わせる
        rInputs[`r${r}${c}`] = document.getElementById(`edit-r-${r}${c}`);
    }
}

// 変更イベントリスナーを一度だけ設定
let isInitialized = false;

/**
 * XML編集パネルを表示します。
 */
export function showXmlEditPanel() {
    if (panel) panel.style.display = 'block';
    // 表示時に現在の選択状態でUIを更新
    updateXmlEditUI();
    // イベントリスナーを初期化 (一度だけ)
    if (!isInitialized) {
        setupXmlEditListeners();
        isInitialized = true;
    }
}

/**
 * XML編集パネルを非表示にします。
 */
export function hideXmlEditPanel() {
    if (panel) panel.style.display = 'none';
}

/**
 * 選択状態に基づいてXML編集UIの内容を更新します。
 */
export function updateXmlEditUI() {
    if (!panel || panel.style.display === 'none') return; // パネル非表示時は何もしない

    const selected = getSelectedBlocks();
    const count = selected.length;

    if (count === 0) {
        // --- 選択なし ---
        infoText.textContent = "ブロックが選択されていません。";
        clearAndDisableInputs(true); // 全てクリア＆無効化
    } else if (count === 1) {
        // --- 単一選択 ---
        infoText.textContent = `ブロックID: ${selected[0].id} (${selected[0].definitionId})`;
        populateInputsFromBlock(selected[0]); // 値を表示
        enableInputs(); // 有効化
    } else {
        // --- 複数選択 ---
        infoText.textContent = `${count}個のブロックを選択中。入力した値が全てに適用されます。`;
        clearAndDisableInputs(false); // クリアするが、編集は可能にする
        enableInputs();
    }
}

/**
 * 指定されたBlockDataの値で入力フィールドを埋めます。
 * @param {BlockData} blockData
 * @private
 */
function populateInputsFromBlock(blockData) {
    const posXml = blockData.getPositionXml(); // XML座標系
    vpInputs.x.value = posXml.x;
    vpInputs.y.value = posXml.y;
    vpInputs.z.value = posXml.z;

    const rotXml = blockData.getRotationMatrixXmlElements(); // XML回転行列要素
    // XML要素は [r11, r21, r31, r12, r22, r32, r13, r23, r33] の順
    rInputs['r11'].value = rotXml[0]; rInputs['r21'].value = rotXml[1]; rInputs['r31'].value = rotXml[2];
    rInputs['r12'].value = rotXml[3]; rInputs['r22'].value = rotXml[4]; rInputs['r32'].value = rotXml[5];
    rInputs['r13'].value = rotXml[6]; rInputs['r23'].value = rotXml[7]; rInputs['r33'].value = rotXml[8];

    // 複数選択用プレースホルダーなどをクリア
    Object.values(vpInputs).forEach(input => input.placeholder = '');
    Object.values(rInputs).forEach(input => input.placeholder = '');
    document.querySelectorAll('.multiple-selected').forEach(el => el.classList.remove('multiple-selected'));
}

/**
 * 入力フィールドをクリアし、オプションで無効化またはプレースホルダーを設定します。
 * @param {boolean} disable - trueの場合、フィールドを無効化する。
 * @private
 */
function clearAndDisableInputs(disable) {
    const placeholderText = disable ? '' : '複数';
    const addPlaceholderClass = !disable;

    Object.values(vpInputs).forEach(input => {
        input.value = '';
        input.disabled = disable;
        input.placeholder = placeholderText;
        if (addPlaceholderClass) input.classList.add('multiple-selected');
        else input.classList.remove('multiple-selected');
    });
    Object.values(rInputs).forEach(input => {
        input.value = '';
        input.disabled = disable;
        input.placeholder = placeholderText;
         if (addPlaceholderClass) input.classList.add('multiple-selected');
         else input.classList.remove('multiple-selected');
    });
}

/**
 * 全ての入力フィールドを有効化します。
 * @private
 */
function enableInputs() {
     Object.values(vpInputs).forEach(input => input.disabled = false);
     Object.values(rInputs).forEach(input => input.disabled = false);
}


/**
 * XML編集UIの入力フィールドにイベントリスナーを設定します。
 * @private
 */
function setupXmlEditListeners() {
    // 全ての数値入力フィールドに対して設定
    const allInputs = [...Object.values(vpInputs), ...Object.values(rInputs)];

    allInputs.forEach(input => {
        // 値が変更されたとき (フォーカスアウト時など)
        input.addEventListener('change', handleInputChange);
        // Enterキーが押されたときも変更を適用
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                handleInputChange(event); // changeイベントを発火させるか、直接処理
                input.blur(); // フォーカスを外す
            }
        });
    });
}

/**
 * 入力フィールドの値変更イベントハンドラ。
 * 選択中のブロックに変更を適用し、履歴に登録します。
 * @param {Event} event
 * @private
 */
function handleInputChange(event) {
    const input = event.target;
    const newValue = parseInt(input.value, 10); // 整数に変換

    // 無効な値の場合は何もしない (NaNなど)
    if (isNaN(newValue)) {
        console.warn("無効な数値が入力されました。");
        // 必要なら元の値を復元する処理
        updateXmlEditUI(); // UIを再描画して元の値に戻す
        return;
    }

    const selected = getSelectedBlocks();
    if (selected.length === 0) return; // 念のためチェック

    const propertyPath = input.dataset.property; // vp.x など
    const isMatrix = input.dataset.row !== undefined; // 回転行列か？
    const row = isMatrix ? parseInt(input.dataset.row, 10) : -1;
    const col = isMatrix ? parseInt(input.dataset.col, 10) : -1;

    // --- アンドゥ履歴用の情報作成 ---
    const changes = [];
    selected.forEach(block => {
        changes.push({
            blockId: block.id,
            oldValue: getBlockPropertyValue(block, propertyPath, row, col), // 変更前の値を取得
            newValue: newValue, // 変更後の値
            propertyPath: propertyPath, // どのプロパティか
            isMatrix: isMatrix, // 行列か？
            matrixRow: row,
            matrixCol: col
        });
    });

    // --- 実際の変更適用 ---
    selected.forEach(block => {
        setBlockPropertyValue(block, propertyPath, row, col, newValue);
    });

    // --- 履歴登録 ---
    addAction({
        type: 'SET_PROPERTIES', // 新しいアクションタイプ
        changes: changes
    });

    console.log(`Applied value ${newValue} to ${propertyPath || `r[${row}][${col}]`} for ${selected.length} blocks.`);

    // 単一選択の場合、UIを再描画して他の値も更新（行列操作などの副作用を反映するため）
    if (selected.length === 1) {
        updateXmlEditUI();
    }
}

/**
 * BlockDataから指定されたプロパティの値を取得します (XML座標系)。
 * @private
 */
function getBlockPropertyValue(blockData, propertyPath, row, col) {
    if (propertyPath) { // 座標の場合
        const parts = propertyPath.split('.'); // "vp.x" -> ["vp", "x"]
        const prop = parts[1];
        const posXml = blockData.getPositionXml();
        return posXml[prop];
    } else if (row !== -1 && col !== -1) { // 回転行列の場合
        const elements = blockData.getRotationMatrixXmlElements();
        // XML要素は列優先 [r11, r21, r31, r12, r22, r32, r13, r23, r33]
        // UIは row, col で指定 (0-indexed)
        // UIの (row, col) -> XML要素のインデックス = col * 3 + row
        const index = col * 3 + row;
        return elements[index];
    }
    return undefined;
}

/**
 * BlockDataの指定されたプロパティに値を設定します (入力はXML座標系)。
 * @private
 */
function setBlockPropertyValue(blockData, propertyPath, row, col, value) {
     if (propertyPath) { // 座標の場合
        const parts = propertyPath.split('.');
        const prop = parts[1];
        const currentPosXml = blockData.getPositionXml();
        currentPosXml[prop] = value; // 指定された要素だけ更新
        blockData.setPositionFromXml(currentPosXml.x, currentPosXml.y, currentPosXml.z);
    } else if (row !== -1 && col !== -1) { // 回転行列の場合
        const currentElements = blockData.getRotationMatrixXmlElements();
        const index = col * 3 + row;
        currentElements[index] = value; // 指定された要素だけ更新
        blockData.setRotationMatrixFromXmlElements(currentElements);
    }
}