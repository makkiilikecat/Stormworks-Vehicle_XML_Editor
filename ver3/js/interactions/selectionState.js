/**
 * @fileoverview ブロックの選択状態 (クリック選択リスト、範囲選択ボックス) を管理するモジュール。
 * 選択状態の保持、取得、設定、クリアを行う。
 * また、編集モードやクリップボードの状態変化に応じて、関連するレンダラー
 * (選択ボックス、ギズモ、ペーストプレビュー) の表示/非表示/更新を連携して制御する。
 *
 * 主要な役割:
 * - クリックによって選択されたブロック (`selectedBlocks`) のリスト管理。
 * - 範囲選択モードで使用する選択範囲 (`currentSelectionRangeBox`) の状態管理 (Box3)。
 * - 編集モード変更時の選択状態クリア、範囲選択表示の初期化/クリア。
 * - クリップボード状態変更時のペーストプレビュー表示/クリア。
 * - 範囲選択ボックスが変更された際のギズモとプレビューの更新。
 * - 範囲選択ボックスのサイズをキー操作で入れ替える機能。
 */

import * as THREE from 'three';
// 編集モード定義と現在のモード取得
import { EditMode, getCurrentMode } from '../state/editMode.js';
// ハイライト操作 (クリック選択されたブロックに使用)
import { clearAllHighlights, highlightMesh } from '../rendering/highlightHelper.js';
// 範囲選択ボックスの表示制御
import { showSelectionBox, hideSelectionBox } from '../rendering/selectionBoxRenderer.js';
// 範囲選択ギズモ (移動・サイズ変更) の表示制御
import { updateGizmos, hideGizmos } from '../rendering/rangeGizmoRenderer.js';
// ペーストプレビューの表示制御
import { updatePastePreview, clearPastePreview } from '../rendering/pastePreviewRenderer.js';
// クリップボードの状態 (データ有無、内容) 取得
import { hasClipboard, getClipboardData } from '../state/clipboardState.js';
// XML編集UIの更新 (クリック選択変更時に呼び出す)
import { updateXmlEditUI } from '../ui/xmlEditUI.js';

// --- モジュール内変数 ---

/** @type {BlockData[]} クリックによって現在選択されているブロックデータの配列 */
let selectedBlocks = [];

/** @type {THREE.Box3 | null} 範囲選択モードで定義されている現在の選択範囲。モード外では null。 */
let currentSelectionRangeBox = null;

/** @type {THREE.Scene | null} レンダリング対象のシーンオブジェクトへの参照。初期化時に設定される。 */
let sceneRef = null;

// --- 計算用一時変数 (メモリ効率化のため) ---
const _center = new THREE.Vector3(); // Box3の中心計算用
const _size = new THREE.Vector3();   // Box3のサイズ計算用
const _initialBoxCenter = new THREE.Vector3(0, 0, 0); // 範囲選択開始時のデフォルト中心
const _initialBoxSize = new THREE.Vector3(1, 1, 1);   // 範囲選択開始時のデフォルトサイズ
const _tempBox = new THREE.Box3(); // Box3計算用

// --- 初期化 ---

/**
 * Selection State モジュールを初期化します。
 * 必要なイベントリスナー（モード変更、クリップボード状態変更）を設定します。
 * @param {THREE.Scene} scene - レンダリング対象のシーンオブジェクト。各種レンダラー呼び出しに必要。
 */
export function initializeSelectionState(scene) {
    console.log("[SelectionState] 初期化中...");
    if (!scene) {
        console.error("[SelectionState] 初期化エラー: Scene オブジェクトが必要です。");
        return;
    }
    // シーンへの参照を保持
    sceneRef = scene;
    // モード変更イベントを監視
    document.addEventListener('editmodechange', handleEditModeChange);
    // クリップボード状態変更イベントを監視
    document.addEventListener('clipboardstatechange', handleClipboardStateChange);
    console.log("[SelectionState] モード変更およびクリップボード状態変更リスナーを設定しました。");
}

// --- プライベート イベントハンドラ ---

/**
 * 編集モード変更 (`editmodechange`) イベントを処理します。
 * モードに応じて、クリック選択のクリアや、範囲選択ボックス・ギズモ・プレビューの表示/非表示を制御します。
 * @param {CustomEvent} event - `editmodechange` イベントオブジェクト ({ detail: { newMode, oldMode } })。
 * @private
 */
function handleEditModeChange(event) {
    const { newMode, oldMode } = event.detail;
    console.log(`[SelectionState] モード変更を検知: ${oldMode} -> ${newMode}`);
    // シーン参照がなければ処理中断
    if (!sceneRef) return;

    // --- クリック選択のクリア ---
    // XML編集モード以外になったら、クリック選択リストをクリアする
    if (newMode !== EditMode.XML_EDIT) {
        clearSelection();
    }

    // --- 範囲選択ボックス、ギズモ、プレビューの表示制御 ---
    if (newMode === EditMode.RANGE_SELECT) {
        // 【範囲選択モード 開始時】
        if (!currentSelectionRangeBox) {
            // 範囲が未定義なら、原点中心の1x1x1ボックスで初期化
            const initialBox = new THREE.Box3().setFromCenterAndSize(_initialBoxCenter, _initialBoxSize);
            setSelectionRange(initialBox, sceneRef); // ボックス、ギズモ、プレビュー（あれば）を表示/更新
            console.log("[SelectionState] 範囲選択モード開始。初期選択ボックスとギズモを表示。");
        } else {
            // 既に範囲が定義されている場合 (他のモードから戻ってきたなど) は、
            // 現在の範囲でボックスとギズモを再表示/更新する
            updateGizmos(sceneRef, currentSelectionRangeBox);
            showSelectionBox(sceneRef, currentSelectionRangeBox);
            console.log("[SelectionState] 範囲選択モード再開。既存の選択ボックスとギズモを表示。");
        }
        // クリップボードにデータがあれば、プレビューも表示/更新する
        if (hasClipboard()) {
            // プレビューの中心は現在の選択範囲の中心 (なければ原点)
            const currentCenter = currentSelectionRangeBox ? currentSelectionRangeBox.getCenter(_center) : _initialBoxCenter;
            updatePastePreview(sceneRef, getClipboardData(), currentCenter);
        }

    } else {
        // 【範囲選択モード 終了時】
        if (oldMode === EditMode.RANGE_SELECT) {
            // 範囲選択モードから抜けるときに、関連する表示を非表示にする
            hideGizmos();         // ギズモ非表示
            hideSelectionBox(); // 選択ボックス非表示
            clearPastePreview(sceneRef); // ペーストプレビュー非表示
            // 選択範囲の状態(`currentSelectionRangeBox`) はクリアしない (モードを戻った時に再利用するため)
            // クリップボードの状態もクリアしない (仕様変更により)
            console.log("[SelectionState] 範囲選択モード終了。ボックス、ギズモ、プレビューを非表示。");
        }
    }
}

/**
 * クリップボード状態変更 (`clipboardstatechange`) イベントを処理します。
 * クリップボードのデータ有無に応じて、ペーストプレビューの表示/非表示を切り替えます。
 * @param {CustomEvent} event - `clipboardstatechange` イベントオブジェクト ({ detail: { hasData: boolean } })。
 * @private
 */
function handleClipboardStateChange(event) {
    // シーン参照がないか、範囲選択モードでなければ何もしない
    if (!sceneRef || getCurrentMode() !== EditMode.RANGE_SELECT) return;

    const hasData = event.detail.hasData; // クリップボードにデータがあるか
    console.log(`[SelectionState] クリップボード状態変更検知: データあり = ${hasData}`);

    if (hasData) {
        // データが設定/更新された -> プレビューを更新
        const currentRange = getSelectionRangeBox(); // 現在の選択範囲を取得
        const currentCenter = currentRange ? currentRange.getCenter(_center).round() : _initialBoxCenter; // 基準点を計算 (丸める)
        updatePastePreview(sceneRef, getClipboardData(), currentCenter); // プレビュー表示/更新
    } else {
        // データがクリアされた -> プレビューをクリア
        clearPastePreview(sceneRef);
    }
}


// --- 公開関数 (クリック選択関連) ---

/**
 * 現在クリック選択されている全てのブロックデータを取得します。
 * @returns {BlockData[]} 選択中のBlockDataの配列のコピー。
 */
export function getSelectedBlocks() {
    return [...selectedBlocks]; // 配列のコピーを返す
}

/**
 * 全てのクリック選択を解除し、関連するハイライトもクリアします。
 * 選択状態が変更された場合、`selectionchanged` イベントを発行します。
 * @returns {boolean} 選択がクリアされた場合は true、元々選択がなかった場合は false。
 */
export function clearSelection() {
    const currentMode = getCurrentMode();
    // 選択中のブロックがある場合のみ処理
    if (selectedBlocks.length > 0) {
        console.log("[SelectionState] クリック選択をクリアします。");
        // ハイライト解除
        clearAllHighlights(selectedBlocks, currentMode);
        // 選択リストを空にする
        selectedBlocks = [];
        // イベント発行
        document.dispatchEvent(new CustomEvent('selectionchanged', { detail: { selectedBlocks: [] } }));
        // UI更新 (XML編集モードの場合)
        if (currentMode === EditMode.XML_EDIT) {
            updateXmlEditUI();
        }
        return true; // クリア実行
    }
    return false; // クリア不要
}

/**
 * クリック選択ブロックリストを指定されたものに設定し、ハイライトを更新します。
 * 主に範囲選択の結果を反映する目的で設計されましたが、現在は Step 5 (リアルタイム選択) 待ち。
 * @param {BlockData[]} newSelectedBlocks - 新しく選択するブロックの配列。
 */
export function setSelectedBlocks(newSelectedBlocks) {
    const currentMode = getCurrentMode();
    const oldSelectionIds = new Set(selectedBlocks.map(b => b.id));
    const newSelectionIds = new Set(newSelectedBlocks.map(b => b.id));
    // 選択内容が変更されたか比較
    let selectionChanged = oldSelectionIds.size !== newSelectionIds.size || [...oldSelectionIds].some(id => !newSelectionIds.has(id));
    // 変更がない場合は処理中断
    if (!selectionChanged) return;

    console.log(`[SelectionState] クリック選択を ${newSelectedBlocks.length} 個のブロックに設定します。`);
    // 現在のハイライトをクリア
    clearAllHighlights(selectedBlocks, currentMode);
    // 新しい選択リストで置き換え
    selectedBlocks = [...newSelectedBlocks];
    // 新しい選択をハイライト
    selectedBlocks.forEach(blockData => {
        const meshToHighlight = (currentMode === EditMode.XML_EDIT) ? blockData.foregroundMesh : blockData.mesh;
        if (meshToHighlight) highlightMesh(meshToHighlight); // mesh が null でないことを確認
    });
    // イベント発行
    document.dispatchEvent(new CustomEvent('selectionchanged', { detail: { selectedBlocks: getSelectedBlocks() } }));
    // UI更新
    if (currentMode === EditMode.XML_EDIT) {
        updateXmlEditUI();
    }
}

// --- 公開関数 (範囲選択関連) ---

/**
 * 現在の範囲選択ボックス (`THREE.Box3`) を取得します。
 * 範囲選択モードでない場合や範囲が未定義の場合は null を返します。
 * @returns {THREE.Box3 | null} 選択範囲のBox3オブジェクトのコピー、または null。
 */
export function getSelectionRangeBox() {
    // 外部で変更されないようにクローンを返す
    return currentSelectionRangeBox ? currentSelectionRangeBox.clone() : null;
}

/**
 * 選択範囲を指定された Box3 に設定します。
 * 同時に、関連する表示（選択ボックス、ギズモ、ペーストプレビュー）も更新します。
 * @param {THREE.Box3} box - 設定する新しい選択範囲。空や無効な場合は処理を中断。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 */
export function setSelectionRange(box, scene) {
    // 引数チェック
    if (!(box instanceof THREE.Box3)) {
        console.error("[SelectionState] setSelectionRange に無効な Box3 が渡されました。"); return;
    }
    if (!scene) { console.error("[SelectionState] setSelectionRange: Scene が必要です。"); return; }
    if (box.isEmpty()) {
        console.warn("[SelectionState] setSelectionRange に空の Box3 が渡されたため、処理をスキップします。"); return;
    }

    // 内部状態を更新 (コピーして保持)
    currentSelectionRangeBox = box.clone();
    // console.log("[SelectionState] 選択範囲を更新:", currentSelectionRangeBox.min, currentSelectionRangeBox.max);

    // 関連するレンダリングを更新
    showSelectionBox(scene, currentSelectionRangeBox); // 選択ボックス表示
    updateGizmos(scene, currentSelectionRangeBox);     // 移動・サイズ変更ギズモ表示/位置更新

    // クリップボードにデータがあればペーストプレビューも更新
    if (hasClipboard()) {
        currentSelectionRangeBox.getCenter(_center); // 更新後の中心を取得
        updatePastePreview(scene, getClipboardData(), _center);
    }

    // TODO (Step 5 完了後): この関数内で、範囲内のブロックを選択状態にする処理を呼び出す
    // selectBlocksInCurrentRange(scene); // 仮
}

/**
 * 現在の範囲選択をクリアし、関連する表示（選択ボックス、ギズモ、プレビュー）を非表示にします。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 */
export function clearSelectionRange(scene) {
    // 範囲が設定されている場合のみ処理
    if (currentSelectionRangeBox) {
        currentSelectionRangeBox = null; // 内部状態をクリア
        // 関連表示を非表示にする
        hideSelectionBox();
        hideGizmos();
        clearPastePreview(scene);
        console.log("[SelectionState] 選択範囲、ボックス、ギズモ、プレビューをクリアしました。");
        // TODO (Step 5 完了後): 範囲選択によるブロック選択もクリアする
        // setSelectedBlocks([]);
    }
}


/**
 * 現在の選択範囲ボックスの中心を維持したまま、サイズ（辺の長さ W, H, D）を
 * 指定されたキー (`J`, `K`, `L`) に応じて入れ替えます。
 * この操作はアンドゥ/リドゥに対応しません。
 * @param {'J'|'K'|'L'} key - 操作キー。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 */
export function swapSelectionRangeAxes(key, scene) {
    // 現在の範囲ボックスを取得
    const currentRange = getSelectionRangeBox();
    // ボックスが存在し、空でないことを確認
    if (!currentRange || currentRange.isEmpty()) {
        console.warn("[SelectionState] サイズ入れ替え対象の有効な選択範囲がありません。");
        return;
    }

    // 現在の中心とサイズを取得
    currentRange.getCenter(_center);
    currentRange.getSize(_size);

    // キーに応じてサイズを入れ替え
    let newSize = _size.clone(); // 新しいサイズ用ベクトル
    switch (key) {
        case 'J': // Pitch (Y/Z 入れ替え): W, H, D -> W, D, H
            newSize.set(_size.x, _size.z, _size.y);
            console.log(`[SelectionState] 範囲サイズ入れ替え (J): Y <-> Z`);
            break;
        case 'K': // Yaw (X/Z 入れ替え): W, H, D -> D, H, W
            newSize.set(_size.z, _size.y, _size.x);
            console.log(`[SelectionState] 範囲サイズ入れ替え (K): X <-> Z`);
            break;
        case 'L': // Roll (X/Y 入れ替え): W, H, D -> H, W, D
            newSize.set(_size.y, _size.x, _size.z);
            console.log(`[SelectionState] 範囲サイズ入れ替え (L): X <-> Y`);
            break;
        default:
            console.warn(`[SelectionState] swapSelectionRangeAxes: 無効なキー ${key}`);
            return;
    }

    // 最小サイズを保証 (各辺が最低でも 1.0 になるように)
    const minDim = 1.0;
    newSize.max(new THREE.Vector3(minDim, minDim, minDim));

    // 新しい中心 (変更なし) と新しいサイズで Box3 を再作成
    const newBox = _tempBox.setFromCenterAndSize(_center, newSize);

    // 状態と関連表示を更新
    setSelectionRange(newBox, scene);
}

// initializeSelectionState は main.js から呼び出す