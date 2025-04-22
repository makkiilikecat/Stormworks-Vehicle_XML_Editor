/**
 * @fileoverview ブロックの選択状態 (クリック選択、範囲選択) を管理するモジュール。
 * クリックによる選択ブロックリスト、範囲選択ボックスの状態保持、
 * およびモード変更時の自動クリアを担当。関連するレンダラーの呼び出しも行う。
 */

import * as THREE from 'three';
import { EditMode, getCurrentMode } from '../state/editMode.js';
import { clearAllHighlights, highlightMesh } from '../rendering/highlightHelper.js';
import { showSelectionBox, hideSelectionBox } from '../rendering/selectionBoxRenderer.js';
import { updateGizmos, hideGizmos } from '../rendering/rangeGizmoRenderer.js';
// ペーストプレビューのレンダラー関数をインポート
import { updatePastePreview, clearPastePreview } from '../rendering/pastePreviewRenderer.js';
// クリップボードの状態を取得する関数をインポート
import { hasClipboard, getClipboardData } from '../state/clipboardState.js';
import { updateXmlEditUI } from '../ui/xmlEditUI.js';

// --- モジュール内変数 ---

/** @type {BlockData[]} クリックで選択されているブロックデータの配列 */
let selectedBlocks = [];

/** @type {THREE.Box3 | null} 現在の範囲選択ボックスを示すBox3オブジェクト。範囲選択モード外ではnull。 */
let currentSelectionRangeBox = null;

/** @type {THREE.Scene | null} アプリケーションのシーンオブジェクトへの参照 */
let sceneRef = null;

// --- 計算用一時変数 ---
const _center = new THREE.Vector3();
const _initialBoxCenter = new THREE.Vector3(0, 0, 0); // 原点
const _initialBoxSize = new THREE.Vector3(1, 1, 1);   // 1x1x1

// --- 初期化 ---

/**
 * Selection State の初期化処理。
 * 必要な参照を設定し、イベントリスナーを登録します。
 * @param {THREE.Scene} scene - レンダリング中のシーンオブジェクト。
 * @public
 */
export function initializeSelectionState(scene) {
    console.log("[SelectionState] 初期化中...");
    if (!scene) {
        console.error("[SelectionState] 初期化エラー: Scene オブジェクトが必要です。");
        return;
    }
    // scene への参照を保持
    sceneRef = scene;
    // モード変更イベントをリッスン
    document.addEventListener('editmodechange', handleEditModeChange);
    // クリップボード状態変更イベントをリッスン
    document.addEventListener('clipboardstatechange', handleClipboardStateChange);
    console.log("[SelectionState] モード変更およびクリップボード状態変更リスナーを設定しました。");
}

// --- プライベート イベントハンドラ ---

/**
 * 編集モード変更イベントのハンドラ。
 * モードに応じて、クリック選択のクリアや範囲選択関連表示 (ボックス、ギズモ、プレビュー) の制御を行います。
 * @param {CustomEvent} event - editmodechangeイベントオブジェクト。
 * @private
 */
function handleEditModeChange(event) {
    const { newMode, oldMode } = event.detail;
    console.log(`[SelectionState] モード変更を検知: ${oldMode} -> ${newMode}`);
    // sceneRef がなければ処理中断
    if (!sceneRef) return;

    // --- クリック選択のクリア判定 ---
    // XML編集モード以外では、既存のクリック選択をクリアする
    if (newMode !== EditMode.XML_EDIT) {
        clearSelection(); // クリック選択リストをクリア (ハイライト解除含む)
    }

    // --- 範囲選択ボックスとギズモ、プレビューの表示/非表示判定 ---
    if (newMode === EditMode.RANGE_SELECT) {
        // 範囲選択モードになった場合
        if (!currentSelectionRangeBox) { // まだ範囲が定義されていなければ初期化
            const initialBox = new THREE.Box3().setFromCenterAndSize(_initialBoxCenter, _initialBoxSize);
            setSelectionRange(initialBox, sceneRef); // 初期範囲設定 (内部で表示も行う)
            console.log("[SelectionState] 範囲選択モード開始。初期選択ボックスとギズモを表示。");
        } else { // 既に範囲があればそれを再表示
            updateGizmos(sceneRef, currentSelectionRangeBox);     // ギズモ更新/表示
            showSelectionBox(sceneRef, currentSelectionRangeBox); // ボックス表示/更新
            console.log("[SelectionState] 範囲選択モード再開。既存の選択ボックスとギズモを表示。");
        }
        // クリップボードにデータがあればプレビューも表示/更新
        if (hasClipboard()) {
            const center = currentSelectionRangeBox ? currentSelectionRangeBox.getCenter(_center) : _initialBoxCenter;
            updatePastePreview(sceneRef, getClipboardData(), center);
        }
    } else {
        // 範囲選択モードから抜けた場合
        if (oldMode === EditMode.RANGE_SELECT) { // 抜ける瞬間のみ処理
            // ギズモ、選択ボックス、プレビューを非表示にする
            hideGizmos();
            hideSelectionBox();
            clearPastePreview(sceneRef);
            console.log("[SelectionState] 範囲選択モード終了。選択ボックス、ギズモ、プレビューを非表示。");
            // 注意: 範囲選択ボックスの状態(currentSelectionRangeBox)自体は保持する
            // 注意: クリップボードの内容も保持する (モード切替ではクリアしない仕様)
        }
    }
}

/**
 * クリップボード状態変更イベントのハンドラ。
 * 範囲選択モード中であれば、ペーストプレビュー表示を更新またはクリアします。
 * @param {CustomEvent} event - clipboardstatechangeイベントオブジェクト ({ detail: { hasData: boolean } })。
 * @private
 */
function handleClipboardStateChange(event) {
    // sceneRef がない、または範囲選択モードでなければ何もしない
    if (!sceneRef || getCurrentMode() !== EditMode.RANGE_SELECT) {
        return;
    }

    const hasData = event.detail.hasData;
    console.log(`[SelectionState] クリップボード状態変更検知: データあり = ${hasData}`);

    if (hasData) {
        // データが設定/更新された -> プレビューを更新
        const currentRange = getSelectionRangeBox(); // 現在の選択範囲を取得
        // 範囲がない場合は初期ボックスの中心を使う (モード切替直後など)
        const currentCenter = currentRange ? currentRange.getCenter(_center) : _initialBoxCenter;
        updatePastePreview(sceneRef, getClipboardData(), currentCenter); // プレビュー表示/更新
    } else {
        // データがクリアされた -> プレビューをクリア
        clearPastePreview(sceneRef);
    }
}


// --- 公開関数 (クリック選択関連) ---

/**
 * 現在クリック選択されている全てのブロックデータを取得します。
 * @returns {BlockData[]} 選択中のBlockDataの配列 (コピー)。
 */
export function getSelectedBlocks() {
    return [...selectedBlocks];
}

/**
 * 全てのクリック選択を解除し、ハイライトを元に戻します。
 * @returns {boolean} 選択がクリアされた場合は true。
 */
export function clearSelection() {
    const currentMode = getCurrentMode(); // ハイライト解除のためにモード取得
    if (selectedBlocks.length > 0) {
        console.log("[SelectionState] クリック選択をクリアします。");
        clearAllHighlights(selectedBlocks, currentMode); // モードに応じたハイライト解除
        selectedBlocks = []; // 配列を空にする
        // 選択変更イベント発行
        document.dispatchEvent(new CustomEvent('selectionchanged', { detail: { selectedBlocks: [] } }));
        // XML編集UI更新 (もしXML編集モードなら)
        if (currentMode === EditMode.XML_EDIT) {
            updateXmlEditUI();
        }
        return true;
    }
    return false;
}

/**
 * クリック選択ブロックリストを指定されたものに設定し、ハイライトを更新します。
 * (主に Step 5 の範囲内リアルタイム選択で使用される想定)
 * @param {BlockData[]} newSelectedBlocks - 新しく選択するブロックの配列。
 */
export function setSelectedBlocks(newSelectedBlocks) {
    const currentMode = getCurrentMode();
    // 変更があったか比較 (より効率的な比較)
    const oldIds = new Set(selectedBlocks.map(b => b.id));
    const newIds = new Set(newSelectedBlocks.map(b => b.id));
    if (oldIds.size === newIds.size && [...oldIds].every(id => newIds.has(id))) {
        return; // 変更がなければ何もしない
    }

    console.log(`[SelectionState] クリック選択を ${newSelectedBlocks.length} 個のブロックに設定します。`);
    // 現在のハイライトをクリア
    clearAllHighlights(selectedBlocks, currentMode);
    // 新しい選択リストとハイライトを設定
    selectedBlocks = [...newSelectedBlocks]; // 配列コピーで置き換え
    selectedBlocks.forEach(blockData => {
        const meshToHighlight = (currentMode === EditMode.XML_EDIT) ? blockData.foregroundMesh : blockData.mesh;
        if (meshToHighlight) { // メッシュが存在するか確認
             highlightMesh(meshToHighlight);
        }
    });
    // 選択変更イベント発行
    document.dispatchEvent(new CustomEvent('selectionchanged', { detail: { selectedBlocks: getSelectedBlocks() } }));
    // XML編集UI更新
    if (currentMode === EditMode.XML_EDIT) {
        updateXmlEditUI();
    }
}

// --- 公開関数 (範囲選択関連) ---

/**
 * 現在の選択範囲を示す Box3 オブジェクトを取得します。
 * 範囲選択モードでない場合や範囲が未定義の場合は null を返します。
 * @returns {THREE.Box3 | null} 選択範囲のBox3 (コピー)、またはnull。
 */
export function getSelectionRangeBox() {
    // コピーを返すことで、外部での意図しない変更を防ぐ
    return currentSelectionRangeBox ? currentSelectionRangeBox.clone() : null;
}

/**
 * 選択範囲を指定された Box3 に設定し、関連する表示（ボックス、ギズモ、プレビュー）を更新します。
 * @param {THREE.Box3} box - 設定する新しい選択範囲。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 */
export function setSelectionRange(box, scene) {
    if (!(box instanceof THREE.Box3)) {
        console.error("[SelectionState] setSelectionRange に無効な Box3 が渡されました。");
        return;
    }
    if (!scene) { // sceneRef を使うように変更しても良いが、引数で渡す方が確実
        console.error("[SelectionState] setSelectionRange: Scene が必要です。");
        return;
    }

    // 内部状態を更新 (クローンして保持)
    currentSelectionRangeBox = box.clone();
    // console.log("[SelectionState] 選択範囲を更新:", currentSelectionRangeBox.min, currentSelectionRangeBox.max);

    // 関連する表示を更新
    showSelectionBox(scene, currentSelectionRangeBox); // 選択ボックス
    updateGizmos(scene, currentSelectionRangeBox);     // 移動・サイズ変更ギズモ

    // クリップボードにデータがあればプレビューも更新
    if (hasClipboard()) {
        // getCenter() は新しい Vector3 を返すので _center は不要になった
        updatePastePreview(scene, getClipboardData(), currentSelectionRangeBox.getCenter(new THREE.Vector3()));
    }

    // TODO (Step 5 のリアルタイム選択を実装する場合):
    // selectBlocksInCurrentRange(appState.loadedBlocks);
}

/**
 * 現在の選択範囲をクリアし、関連する表示（ボックス、ギズモ、プレビュー）を非表示にします。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 */
export function clearSelectionRange(scene) {
    if (currentSelectionRangeBox) {
        currentSelectionRangeBox = null; // 内部状態をクリア
        // 関連する表示を非表示にする
        hideSelectionBox();
        hideGizmos();
        clearPastePreview(scene); // シーン参照が必要
        console.log("[SelectionState] 選択範囲、ボックス、ギズモ、プレビューをクリアしました。");

        // TODO (Step 5 のリアルタイム選択を実装する場合):
        // setSelectedBlocks([]); // 範囲選択によるブロック選択もクリア
    }
}

// initializeSelectionState は main.js から呼び出す