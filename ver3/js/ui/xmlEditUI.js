/**
 * @fileoverview XML編集パネルのUI制御（表示/非表示、内容更新）と、
 * パネル内の入力フィールドからの値変更を検知し、選択中のBlockDataに適用、
 * アンドゥ履歴登録までを担当するモジュール。
 */

import * as THREE from 'three'; // 基本的な型定義のため (現状未使用だが、将来的に使う可能性)
// ★修正済み: selectionState から選択中のブロックを取得
import { getSelectedBlocks } from '../interactions/selectionState.js';
// アンドゥ履歴登録のため
import { addAction } from '../state/historyManager.js';
// ★追加: ポップアップ表示のため (無効値入力時など)
import { showPopup } from './popupUtils.js';

// --- UI要素への参照 ---
// パネル本体と情報表示テキスト
const panel = document.getElementById('xml-edit-panel');
const infoText = document.getElementById('xml-edit-info');

// 座標 (vp) 入力フィールド (x, y, z)
const vpInputs = {
    x: document.getElementById('edit-vp-x'),
    y: document.getElementById('edit-vp-y'),
    z: document.getElementById('edit-vp-z'),
};

// 回転行列 (r) 入力フィールド (r11, r21, ..., r33)
// HTMLのIDに合わせてキーを設定 (例: rInputs['r11'])
const rInputs = {};
for (let r = 1; r <= 3; r++) { // 行 (1-3)
    for (let c = 1; c <= 3; c++) { // 列 (1-3)
        const key = `r${r}${c}`;
        rInputs[key] = document.getElementById(`edit-r-${r}${c}`);
    }
}

// --- 状態変数 ---
/** @type {boolean} イベントリスナーが初期化済みかどうか */
let isInitialized = false;

// --- 関数 ---

/**
 * XML編集パネルを表示します。
 * 初回表示時にイベントリスナーを設定し、常に現在の選択状態で内容を更新します。
 */
export function showXmlEditPanel() {
    // パネル要素の存在チェック
    if (!panel) {
        console.error("[XmlEditUI] XML編集パネル要素 (#xml-edit-panel) が見つかりません。");
        return;
    }
    panel.style.display = 'block'; // パネルを表示
    updateXmlEditUI();             // 表示内容を更新

    // イベントリスナーを初期化 (まだ設定されていなければ)
    if (!isInitialized) {
        setupXmlEditListeners();
        isInitialized = true;
    }
}

/**
 * XML編集パネルを非表示にします。
 */
export function hideXmlEditPanel() {
    if (panel) {
        panel.style.display = 'none'; // パネルを非表示
    }
}

/**
 * 現在のブロック選択状態に基づいて、XML編集パネルのUI内容を更新します。
 * - 選択なし: フィールドを無効化しメッセージ表示。
 * - 単一選択: ブロックの値をフィールドに表示し、編集可能に。
 * - 複数選択: フィールドをクリアし、「複数」プレースホルダーを表示、編集可能に。
 */
export function updateXmlEditUI() {
    // パネルや主要な入力フィールドが存在し、かつパネルが表示されているか確認
    if (!panel || panel.style.display === 'none' || !vpInputs.x || !rInputs.r11 || !infoText) {
        // 必要な要素がない、またはパネルが非表示なら更新処理をスキップ
        // console.log("[XmlEditUI] パネル非表示または要素不足のためUI更新スキップ。");
        return;
    }

    // 現在選択されているブロックを取得
    const selected = getSelectedBlocks();
    const count = selected.length;

    // 選択数に応じてUIの状態を更新
    if (count === 0) {
        // --- 選択なし ---
        infoText.textContent = "ブロックが選択されていません。"; // 情報テキスト更新
        clearAndDisableInputs(true); // 入力フィールドをクリアして無効化
    } else if (count === 1) {
        // --- 単一選択 ---
        const block = selected[0];
        infoText.textContent = `ブロックID: ${block.id} (タイプ: ${block.definitionId})`; // 情報テキスト更新
        populateInputsFromBlock(block); // 入力フィールドにブロックの値を設定
        enableInputs(); // 入力フィールドを有効化
    } else {
        // --- 複数選択 ---
        infoText.textContent = `${count}個のブロックを選択中。\n入力した値が全てに適用されます。`; // 情報テキスト更新
        clearAndDisableInputs(false); // 入力フィールドをクリアするが、編集は可能にする
        enableInputs();               // 入力フィールドを有効化
        setMultipleSelectionPlaceholder(); // 「複数」というプレースホルダーを設定
    }
}

/**
 * 指定された単一のBlockDataオブジェクトの値で、パネル内の入力フィールドを埋めます。
 * @param {BlockData} blockData - 表示する値を持つBlockDataオブジェクト。
 * @private
 */
function populateInputsFromBlock(blockData) {
    if (!blockData) return; // ガード節
    try {
        // BlockDataからXML座標系の値を取得
        const posXml = blockData.getPositionXml(); // {x, y, z}
        const rotXml = blockData.getRotationMatrixXmlElements(); // [r11, r21, r31, ...]

        // 座標フィールドに値を設定
        vpInputs.x.value = posXml.x;
        vpInputs.y.value = posXml.y;
        vpInputs.z.value = posXml.z;

        // 回転行列フィールドに値を設定
        rInputs['r11'].value = rotXml[0]; rInputs['r21'].value = rotXml[1]; rInputs['r31'].value = rotXml[2];
        rInputs['r12'].value = rotXml[3]; rInputs['r22'].value = rotXml[4]; rInputs['r32'].value = rotXml[5];
        rInputs['r13'].value = rotXml[6]; rInputs['r23'].value = rotXml[7]; rInputs['r33'].value = rotXml[8];

        // 複数選択用のプレースホルダーやスタイルがあればクリア
        clearMultipleSelectionPlaceholder();

    } catch (error) {
        // エラーが発生した場合 (例: getPositionXmlなどが失敗)
        console.error("[XmlEditUI] 入力フィールドへの値設定中にエラー:", error, blockData);
        // エラー発生時はフィールドをクリアするなど、フォールバック処理を行う
        clearAndDisableInputs(true);
        infoText.textContent = "値の表示中にエラーが発生しました。";
    }
}

/**
 * 全ての入力フィールドの値をクリアします。
 * オプションでフィールドを無効化 (`disabled`) するかどうかを指定できます。
 * @param {boolean} disable - trueの場合、フィールドを無効化する。falseの場合は有効化。
 * @private
 */
function clearAndDisableInputs(disable) {
    // 座標フィールドを処理
    Object.values(vpInputs).forEach(input => {
        if (input) {
            input.value = '';          // 値をクリア
            input.disabled = disable; // 有効/無効を設定
        }
    });
    // 回転行列フィールドを処理
    Object.values(rInputs).forEach(input => {
        if (input) {
            input.value = '';          // 値をクリア
            input.disabled = disable; // 有効/無効を設定
        }
    });
    // 複数選択用のスタイルとプレースホルダーもクリア
    clearMultipleSelectionPlaceholder();
}

/**
 * 全ての入力フィールドを有効化 (`disabled = false`) します。
 * @private
 */
function enableInputs() {
     Object.values(vpInputs).forEach(input => { if (input) input.disabled = false; });
     Object.values(rInputs).forEach(input => { if (input) input.disabled = false; });
}

/**
 * 複数ブロックが選択されている場合に、入力フィールドに「複数」という
 * プレースホルダーを設定し、視覚的な区別のためのCSSクラスを追加します。
 * @private
 */
function setMultipleSelectionPlaceholder() {
    const placeholderText = '複数'; // プレースホルダーとして表示するテキスト
    // 座標フィールドに適用
    Object.values(vpInputs).forEach(input => {
        if (input) {
            input.placeholder = placeholderText;
            input.classList.add('multiple-selected'); // CSSクラス追加
        }
    });
    // 回転行列フィールドに適用
    Object.values(rInputs).forEach(input => {
        if (input) {
            input.placeholder = placeholderText;
            input.classList.add('multiple-selected'); // CSSクラス追加
        }
    });
}

/**
 * 入力フィールドから複数選択用のプレースホルダーとCSSクラスを削除します。
 * @private
 */
function clearMultipleSelectionPlaceholder() {
     // 座標フィールドから削除
     Object.values(vpInputs).forEach(input => {
         if (input) {
             input.placeholder = ''; // プレースホルダー削除
             input.classList.remove('multiple-selected'); // CSSクラス削除
         }
     });
     // 回転行列フィールドから削除
     Object.values(rInputs).forEach(input => {
         if (input) {
             input.placeholder = ''; // プレースホルダー削除
             input.classList.remove('multiple-selected'); // CSSクラス削除
         }
     });
}


/**
 * XML編集パネル内の全ての数値入力フィールドにイベントリスナー
 * ('change' および 'keydown' for Enter) を設定します。
 * この関数は `showXmlEditPanel` から一度だけ呼び出されます。
 * @private
 */
function setupXmlEditListeners() {
    console.log("[XmlEditUI] イベントリスナーを設定します...");
    // 座標入力と回転行列入力の全ての input 要素を取得
    const allInputs = [...Object.values(vpInputs), ...Object.values(rInputs)];

    allInputs.forEach(input => {
        // input 要素が見つからない場合はスキップ
        if (!input) {
            console.warn("[XmlEditUI] イベントリスナー設定中に無効な入力要素が見つかりました。");
            return;
        }
        // 'change' イベント: 値が変更され、フォーカスが外れたときなどに発火
        input.addEventListener('change', handleInputChange);
        // 'keydown' イベント: Enterキーが押されたときにも変更を適用
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                handleInputChange(event); // changeイベントと同じハンドラを呼び出す
                input.blur(); // Enterキー押下後にフォーカスを外す
            }
        });
    });
     console.log("[XmlEditUI] イベントリスナーの設定完了。");
}

/**
 * 入力フィールドの値変更イベント (`change` または Enterキー押下) のハンドラ。
 * 入力値を検証し、選択中のブロックデータに適用、アンドゥ履歴に登録します。
 * @param {Event} event - 'change' または 'keydown' イベントオブジェクト。
 * @private
 */
function handleInputChange(event) {
    const input = event.target; // イベントが発生した input 要素
    const newValueStr = input.value; // 入力された文字列

    // 複数選択時に「複数」プレースホルダーが表示されている状態で
    // Enterキーが押された場合など、実質的な変更がない場合は処理しない
    if(input.classList.contains('multiple-selected') && newValueStr === '') return;

    // 入力値を整数に変換
    const newValue = parseInt(newValueStr, 10);

    // --- 入力値の検証 ---
    if (isNaN(newValue)) { // 整数に変換できない場合
        console.warn("[XmlEditUI] 無効な数値が入力されたため、元に戻します:", newValueStr);
        // ユーザーにエラーを通知 (ポップアップ使用)
        showPopup("無効な数値です。整数を入力してください。", "warning", 2000);
        // UIを再描画して、入力前の値に戻す
        updateXmlEditUI();
        return; // 処理中断
    }

    // --- 変更対象の特定 ---
    const selected = getSelectedBlocks(); // 現在選択中のブロックを取得
    if (selected.length === 0) return; // 選択がなければ何もしない

    // 変更されたプロパティを特定 (data-* 属性は使わずIDから判定)
    const inputId = input.id;
    const isVp = inputId.startsWith('edit-vp-');
    const propName = isVp ? inputId.substring(8) : null; // 'x', 'y', or 'z'
    const isMatrix = inputId.startsWith('edit-r-');
    // ID (例: edit-r-12) から行(row)と列(col)を抽出 (0-indexed)
    const row = isMatrix ? parseInt(inputId.substring(7, 8), 10) - 1 : -1;
    const col = isMatrix ? parseInt(inputId.substring(8, 9), 10) - 1 : -1;

    // --- アンドゥ履歴用の情報作成 ---
    // 変更前後の値を保持するオブジェクトの配列を作成
    const changes = selected.map(block => ({
        blockId: block.id,
        // 変更前の値を取得
        oldValue: getBlockPropertyValue(block, isVp ? `vp.${propName}` : null, row, col),
        newValue: newValue, // 変更後の値 (入力値)
        // どのプロパティが変更されたかの情報
        propertyPath: isVp ? `vp.${propName}` : null,
        matrixRow: row,
        matrixCol: col
    }));

    // --- 実際のBlockData変更適用 ---
    // 選択中の全てのブロックに対して、同じ値を設定
    selected.forEach(block => {
        setBlockPropertyValue(block, isVp ? `vp.${propName}` : null, row, col, newValue);
    });

    // --- アンドゥ履歴登録 ---
    addAction({
        type: 'SET_PROPERTIES', // アクションタイプ
        changes: changes       // 変更内容の配列
    });

    // ログ出力
    const propIdentifier = isVp ? `vp.${propName}` : `r[${row + 1}][${col + 1}]`;
    console.log(`[XmlEditUI] 値 ${newValue} を ${propIdentifier} に適用 (${selected.length} ブロック)`);

    // --- UI更新 ---
    if (selected.length === 1) {
        // 単一選択の場合: 他の値も影響を受ける可能性があるため、UI全体を再描画
        updateXmlEditUI();
    } else {
        // 複数選択の場合: 他のフィールドは「複数」表示のままにし、変更したフィールドのみ値を表示
        setMultipleSelectionPlaceholder(); // 一旦プレースホルダー設定
        input.classList.remove('multiple-selected'); // 変更したフィールドはクラス解除
        input.placeholder = '';                // プレースホルダー解除
        input.value = newValue;                // 適用した値を表示
    }
    // ブロックデータが変更されたことを通知 (3Dビューの更新などを促す)
    document.dispatchEvent(new CustomEvent('blocksChanged'));
}


/**
 * 指定されたプロパティパスまたは行列インデックスに対応するBlockDataの値を取得します。
 * 値は常にXML座標系のものが返されます。
 * @param {BlockData} blockData - 値を取得するBlockDataオブジェクト。
 * @param {string | null} propertyPath - 'vp.x', 'vp.y', 'vp.z' のいずれか、またはnull。
 * @param {number} row - 行列の行インデックス (0-2)、座標の場合は -1。
 * @param {number} col - 行列の列インデックス (0-2)、座標の場合は -1。
 * @returns {number | undefined} 対応するプロパティの値。見つからない場合は undefined。
 * @private
 */
function getBlockPropertyValue(blockData, propertyPath, row, col) {
    // 座標プロパティの場合
    if (propertyPath === 'vp.x') return blockData.getPositionXml().x;
    if (propertyPath === 'vp.y') return blockData.getPositionXml().y;
    if (propertyPath === 'vp.z') return blockData.getPositionXml().z;
    // 回転行列プロパティの場合
    if (row >= 0 && row <= 2 && col >= 0 && col <= 2) {
        const elements = blockData.getRotationMatrixXmlElements(); // XML要素配列 [r11, r21, r31, r12, ...]
        const index = col * 3 + row; // 列優先インデックス計算
        return elements[index];
    }
    // 不明なプロパティ
    console.warn("[XmlEditUI] 未対応のプロパティ指定:", propertyPath, row, col);
    return undefined;
}

/**
 * 指定されたプロパティパスまたは行列インデックスに対応するBlockDataの値を設定します。
 * 設定する値 (`value`) はXML座標系の値（整数）である必要があります。
 * @param {BlockData} blockData - 値を設定するBlockDataオブジェクト。
 * @param {string | null} propertyPath - 'vp.x', 'vp.y', 'vp.z' のいずれか、またはnull。
 * @param {number} row - 行列の行インデックス (0-2)、座標の場合は -1。
 * @param {number} col - 行列の列インデックス (0-2)、座標の場合は -1。
 * @param {number} value - 設定する値 (整数)。
 * @private
 */
function setBlockPropertyValue(blockData, propertyPath, row, col, value) {
     // 座標プロパティの場合
     if (propertyPath === 'vp.x') {
         const currentPos = blockData.getPositionXml();
         blockData.setPositionFromXml(value, currentPos.y, currentPos.z);
     } else if (propertyPath === 'vp.y') {
         const currentPos = blockData.getPositionXml();
         blockData.setPositionFromXml(currentPos.x, value, currentPos.z);
     } else if (propertyPath === 'vp.z') {
         const currentPos = blockData.getPositionXml();
         blockData.setPositionFromXml(currentPos.x, currentPos.y, value);
     }
     // 回転行列プロパティの場合
     else if (row >= 0 && row <= 2 && col >= 0 && col <= 2) {
         const currentElements = blockData.getRotationMatrixXmlElements();
         const index = col * 3 + row; // 列優先インデックス
         currentElements[index] = value; // 指定要素を更新
         blockData.setRotationMatrixFromXmlElements(currentElements); // 更新した配列で設定
     } else {
         console.error("[XmlEditUI] プロパティの設定に失敗: 無効な指定です。", propertyPath, row, col);
     }
     // この関数自体はBlockDataの状態を更新するだけで、
     // 3Dメッシュの更新はBlockData内のメソッド(setPositionFromXmlなど)か、
     // またはこの関数の呼び出し元が 'blocksChanged' イベントを受けて行う想定。
}