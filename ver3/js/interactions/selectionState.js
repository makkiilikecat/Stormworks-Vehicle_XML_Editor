/**
 * @fileoverview ブロックの選択状態 (クリック選択、範囲選択) を管理するモジュール。
 * クリックによる選択ブロックリスト、範囲選択ボックスの状態保持、
 * およびモード変更時の自動クリアを担当。関連するレンダラーの呼び出しも行う。
 */

import * as THREE from 'three'; // Box3 などで使用
import { EditMode, getCurrentMode } from '../state/editMode.js'; // モード定義と現在のモード取得
import { clearAllHighlights, highlightMesh } from '../rendering/highlightHelper.js'; // ハイライト操作
import { showSelectionBox, hideSelectionBox } from '../rendering/selectionBoxRenderer.js'; // 選択ボックス表示
import { updateGizmos, hideGizmos } from '../rendering/rangeGizmoRenderer.js'; // ギズモ表示 (移動・サイズ変更含む)
import { updateXmlEditUI } from '../ui/xmlEditUI.js'; // XML編集UI更新

// --- モジュール内変数 ---

/** @type {BlockData[]} クリックで選択されているブロックデータの配列 */
let selectedBlocks = [];

/** @type {THREE.Box3 | null} 現在の範囲選択ボックスを示すBox3オブジェクト。範囲選択モード外ではnullの場合もあるが、維持される。 */
let currentSelectionRangeBox = null;

// --- 初期化 ---

/**
 * Selection State の初期化処理。
 * モード変更イベントをリッスンして、選択状態や範囲選択ボックス、ギズモを管理します。
 * main.js から呼び出されることを想定しています。
 * @param {THREE.Scene} scene - レンダリング中のシーンオブジェクト (ギズモやボックスの表示に必要)。
 * @public
 */
export function initializeSelectionState(scene) {
    console.log("[SelectionState] 初期化中...");
    // scene オブジェクトがないとギズモ/ボックス表示の初期化ができない
    if (!scene) {
        console.error("[SelectionState] 初期化エラー: Scene オブジェクトが必要です。");
        return;
    }
    // モード変更イベント ('editmodechange') を監視し、handleEditModeChange を実行
    document.addEventListener('editmodechange', (event) => handleEditModeChange(event, scene));
    console.log("[SelectionState] モード変更リスナーを設定しました。");
}

// --- プライベート関数 ---

/**
 * 編集モード変更イベントのハンドラ。
 * モードに応じて、クリック選択のクリアや範囲選択関連表示 (ボックス、ギズモ) の制御を行います。
 * @param {CustomEvent} event - editmodechangeイベントオブジェクト (detail に newMode, oldMode を含む)。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 * @private
 */
function handleEditModeChange(event, scene) {
    const { newMode, oldMode } = event.detail; // 新旧モードを取得
    console.log(`[SelectionState] モード変更を検知: ${oldMode} -> ${newMode}`);

    // --- クリック選択のクリア ---
    // XML編集モード以外では、クリックによるブロック選択は解除する
    if (newMode !== EditMode.XML_EDIT) {
        clearSelection(); // XML編集モード以外はハイライト等をクリア
    }

    // --- 範囲選択ボックスとギズモの表示/非表示 ---
    if (newMode === EditMode.RANGE_SELECT) {
        // 範囲選択モードになった時の処理
        if (!currentSelectionRangeBox) {
            // まだ選択範囲が存在しない場合 (例: 初めて範囲選択モードに入る)
            // -> 原点中心に 1x1x1 の初期ボックスを作成して設定
            const initialBox = new THREE.Box3(
                new THREE.Vector3(-0.5, -0.5, -0.5),
                new THREE.Vector3(0.5, 0.5, 0.5)
            );
            setSelectionRange(initialBox, scene); // 範囲を設定し、ボックスとギズモを表示
            console.log("[SelectionState] 範囲選択モード開始。初期選択ボックスとギズモを表示。");
        } else {
            // 既に選択範囲が存在する場合 (例: 他のモードから戻ってきた)
            // -> 既存の選択範囲を使ってボックスとギズモを再表示/更新
            updateGizmos(scene, currentSelectionRangeBox);
            showSelectionBox(scene, currentSelectionRangeBox);
            console.log("[SelectionState] 範囲選択モード再開。既存の選択ボックスとギズモを表示。");
        }
    } else {
        // 範囲選択モード"以外"になった時の処理
        // ★修正: 範囲選択モードから抜ける場合のみ非表示処理を行う
        if (oldMode === EditMode.RANGE_SELECT) {
            hideGizmos();       // 全てのギズモを非表示
            hideSelectionBox(); // 選択ボックスを非表示
            console.log("[SelectionState] 範囲選択モード終了。選択ボックスとギズモを非表示。");
            // クリップボードの内容はクリアせず維持する (ユーザー仕様変更)
        }
    }
}

// --- 公開関数 (クリック選択関連) ---

/**
 * 現在クリック選択されている全てのブロックデータを取得します。
 * @returns {BlockData[]} 選択中のBlockDataの配列 (コピー)。
 */
export function getSelectedBlocks() {
    return [...selectedBlocks]; // 安全のためコピーを返す
}

/**
 * 全てのクリック選択を解除し、ハイライトを元に戻します。
 * 選択状態が実際に変更された場合に 'selectionchanged' イベントを発行します。
 * @returns {boolean} 選択がクリアされた場合は true、もともと何も選択されていなかった場合は false。
 */
export function clearSelection() {
    const currentMode = getCurrentMode(); // ハイライト解除のために現在のモードが必要
    // 何か選択されている場合のみ処理
    if (selectedBlocks.length > 0) {
        console.log("[SelectionState] クリック選択をクリアします。");
        // ハイライトを全て解除 (モードに応じて対象メッシュが変わる)
        clearAllHighlights(selectedBlocks, currentMode);
        selectedBlocks = []; // 選択リストを空にする
        // 選択が変更されたことを通知するイベントを発行
        document.dispatchEvent(new CustomEvent('selectionchanged', { detail: { selectedBlocks: [] } }));
        // XML編集モードならUIも更新
        if (currentMode === EditMode.XML_EDIT) {
            updateXmlEditUI();
        }
        return true; // クリア成功
    }
    return false; // クリア不要 (元々空)
}

/**
 * クリック選択ブロックリストを指定されたものに設定し、ハイライトを更新します。
 * 主に範囲選択結果を反映する場合（Step 5 で使用想定）や、アンドゥ/リドゥで使用します。
 * @param {BlockData[]} newSelectedBlocks - 新しく選択するブロックの配列。
 */
export function setSelectedBlocks(newSelectedBlocks) {
    const currentMode = getCurrentMode();
    const oldSelectionIds = new Set(selectedBlocks.map(b => b.id));
    const newSelectionIds = new Set(newSelectedBlocks.map(b => b.id));
    // 選択内容が実際に変わったかチェック
    let selectionChanged = oldSelectionIds.size !== newSelectionIds.size || [...oldSelectionIds].some(id => !newSelectionIds.has(id));

    // 変更がない場合は処理終了
    if (!selectionChanged) return;

    console.log(`[SelectionState] クリック選択を ${newSelectedBlocks.length} 個のブロックに設定します。`);
    // 現在のハイライトを解除
    clearAllHighlights(selectedBlocks, currentMode);
    // 新しい選択リストを設定
    selectedBlocks = [...newSelectedBlocks];
    // 新しい選択対象をハイライト
    selectedBlocks.forEach(blockData => {
        const meshToHighlight = (currentMode === EditMode.XML_EDIT) ? blockData.foregroundMesh : blockData.mesh;
        highlightMesh(meshToHighlight);
    });
    // 選択変更イベントを発行
    document.dispatchEvent(new CustomEvent('selectionchanged', { detail: { selectedBlocks: getSelectedBlocks() } }));
    // XML編集UI更新
    if (currentMode === EditMode.XML_EDIT) {
        updateXmlEditUI();
    }
}

// --- 公開関数 (範囲選択関連) ---

/**
 * 現在の選択範囲を示す Box3 オブジェクトを取得します。
 * 範囲が設定されていない場合は null を返します。
 * @returns {THREE.Box3 | null} 選択範囲のBox3 (コピー)、またはnull。
 */
export function getSelectionRangeBox() {
    // 外部で変更されないように、存在する場合はクローンを返す
    return currentSelectionRangeBox ? currentSelectionRangeBox.clone() : null;
}

/**
 * 選択範囲を指定された Box3 に設定し、対応する選択ボックスとギズモを表示/更新します。
 * @param {THREE.Box3} box - 設定する新しい選択範囲。Box3 インスタンスである必要があります。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。ギズモ/ボックス表示に必要。
 */
export function setSelectionRange(box, scene) {
    // 入力値の検証
    if (!(box instanceof THREE.Box3)) {
        console.error("[SelectionState] setSelectionRange に無効な Box3 オブジェクトが渡されました。");
        return;
    }
    // 内部状態を更新 (安全のためクローンを保持)
    currentSelectionRangeBox = box.clone();
    // console.log("[SelectionState] 選択範囲を更新:", currentSelectionRangeBox.min, currentSelectionRangeBox.max); // ログが冗長な場合はコメントアウト

    // 関連するレンダラーを呼び出して表示を更新
    showSelectionBox(scene, currentSelectionRangeBox); // 選択ボックス
    updateGizmos(scene, currentSelectionRangeBox);     // 全てのギズモ (移動用+サイズ変更用)

    // TODO (Step 5): 範囲内のブロック選択を更新する処理をここに追加
    // updateSelectionFromRange(scene, currentSelectionRangeBox);
}

/**
 * 現在の選択範囲をクリアし、選択ボックスとギズモを非表示にします。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。非表示処理に必要。
 */
export function clearSelectionRange(scene) {
    // 範囲が設定されている場合のみ処理
    if (currentSelectionRangeBox) {
        currentSelectionRangeBox = null; // 内部状態をクリア
        hideSelectionBox(); // ボックスを非表示
        hideGizmos();       // 全ギズモを非表示
        console.log("[SelectionState] 選択範囲をクリアしました。");

        // TODO (Step 5): 範囲選択によるブロック選択もクリアする処理をここに追加
        // setSelectedBlocks([]);
    }
}

// initializeSelectionState は main.js から呼び出される想定