/**
 * @fileoverview ブロックの選択状態（クリックによる個別選択と範囲選択ボックス）を管理します。
 * 選択状態の変更に伴い、関連するUI（ハイライト、選択ボックス、ギズモ、プレビュー）の
 * 表示更新やクリア処理を呼び出します。また、モード変更やクリップボード状態変化にも対応します。
 *
 * 依存関係:
 * - editMode.js: 現在のモード取得、モード定義
 * - highlightHelper.js: クリック選択時のハイライト制御
 * - selectionBoxRenderer.js: 範囲選択ボックスの表示制御
 * - rangeGizmoRenderer.js: 範囲選択ギズモの表示制御
 * - pastePreviewRenderer.js: ペーストプレビューの表示制御
 * - clipboardState.js: クリップボードの状態確認、データ取得
 * - xmlEditUI.js: XML編集パネルの更新 (クリック選択変更時)
 */

import * as THREE from 'three';
import { EditMode, getCurrentMode } from '../state/editMode.js';
import { clearAllHighlights, highlightMesh } from '../rendering/highlightHelper.js';
import { showSelectionBox, hideSelectionBox } from '../rendering/selectionBoxRenderer.js';
import { updateGizmos, hideGizmos } from '../rendering/rangeGizmoRenderer.js';
import { updatePastePreview, clearPastePreview } from '../rendering/pastePreviewRenderer.js';
import { hasClipboard, getClipboardData } from '../state/clipboardState.js';
import { updateXmlEditUI } from '../ui/xmlEditPanelContent.js';

// --- モジュール内変数 ---

/** @type {BlockData[]} クリックによって選択されているブロックデータの配列 */
let selectedBlocks = [];

/** @type {THREE.Box3 | null} 現在の範囲選択ボックスを示すBox3オブジェクト。範囲選択モード外や未定義時はnull。 */
let currentSelectionRangeBox = null;

/** @type {THREE.Scene | null} Three.js シーンオブジェクトへの参照（UI更新用） */
let sceneRef = null;

// --- 計算用一時変数 ---
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _initialBoxCenter = new THREE.Vector3(0, 0, 0); // 範囲選択開始時のデフォルト中心
const _initialBoxSize = new THREE.Vector3(1, 1, 1);   // 範囲選択開始時のデフォルトサイズ
const _tempBox = new THREE.Box3();                   // Box3計算用
const _moveVector = new THREE.Vector3();               // 十字キー移動用ベクトル

// --- 初期化 ---

/**
 * 選択状態管理モジュールを初期化します。
 * シーンへの参照を保持し、モード変更とクリップボード状態変化のイベントリスナーを設定します。
 * @param {THREE.Scene} scene - レンダリング中のシーンオブジェクト。
 */
export function initializeSelectionState(scene) {
    console.log("[SelectionState] 初期化中...");
    if (!scene) {
        console.error("[SelectionState] 初期化エラー: Scene オブジェクトが必要です。");
        return;
    }
    sceneRef = scene; // シーン参照を保持

    // イベントリスナーを設定
    document.addEventListener('editmodechange', handleEditModeChange);
    document.addEventListener('clipboardstatechange', handleClipboardStateChange);
    console.log("[SelectionState] モード変更およびクリップボード状態変更リスナーを設定しました。");
}

// --- プライベート イベントハンドラ ---

/**
 * 編集モード変更イベントのハンドラ。
 * モードに応じて、クリック選択のクリアや範囲選択関連UIの表示/非表示を行います。
 * @param {CustomEvent} event - 'editmodechange' イベントオブジェクト ({ detail: { newMode, oldMode } })。
 * @private
 */
function handleEditModeChange(event) {
    // sceneRef がなければ処理中断
    if (!sceneRef) return;

    const { newMode, oldMode } = event.detail;
    console.log(`[SelectionState] モード変更検知: ${oldMode} -> ${newMode}`);

    // --- クリック選択のクリア判定 ---
    // XML編集モード以外では、クリック選択は解除する
    if (newMode !== EditMode.XML_EDIT) {
        clearSelection(); // 内部で selectedBlocks を空にし、ハイライト解除
    }

    // --- 範囲選択関連の表示/非表示判定 ---
    if (newMode === EditMode.RANGE_SELECT) {
        // 範囲選択モードになった場合
        // 既存の範囲選択ボックスがなければ、原点に 1x1x1 で初期化
        if (!currentSelectionRangeBox) {
            const initialBox = _tempBox.setFromCenterAndSize(_initialBoxCenter, _initialBoxSize);
            setSelectionRange(initialBox, sceneRef); // 内部でボックスとギズモを表示
            console.log("[SelectionState] 範囲選択モード開始。初期選択ボックスとギズモを表示。");
        } else {
            // 既に範囲があれば、ボックスとギズモを再表示
            updateGizmos(sceneRef, currentSelectionRangeBox);
            showSelectionBox(sceneRef, currentSelectionRangeBox);
            console.log("[SelectionState] 範囲選択モード再開。既存の選択ボックスとギズモを表示。");
        }
        // クリップボードにデータがあれば、ペーストプレビューも表示/更新
        if (hasClipboard()) {
            const currentCenter = currentSelectionRangeBox ? currentSelectionRangeBox.getCenter(_center).round() : _initialBoxCenter;
            updatePastePreview(sceneRef, getClipboardData(), currentCenter);
        }

    } else {
        // 範囲選択モードから抜けた場合
        if (oldMode === EditMode.RANGE_SELECT) {
            // ボックス、ギズモ、プレビューを非表示にする
            hideGizmos();
            hideSelectionBox();
            clearPastePreview(sceneRef);
            console.log("[SelectionState] 範囲選択モード終了。選択ボックス、ギズモ、プレビューを非表示。");
            // クリップボードの内容は維持する (ユーザー仕様)
        }
    }
}

/**
 * クリップボード状態変更イベントのハンドラ。
 * ペーストプレビューの表示を更新またはクリアします。
 * @param {CustomEvent} event - 'clipboardstatechange' イベント ({ detail: { hasData: boolean } })。
 * @private
 */
function handleClipboardStateChange(event) {
    // sceneRef がない、または範囲選択モードでない場合は何もしない
    if (!sceneRef || getCurrentMode() !== EditMode.RANGE_SELECT) {
        return;
    }

    const hasData = event.detail.hasData;
    console.log(`[SelectionState] クリップボード状態変更検知: データあり = ${hasData}`);

    if (hasData) {
        // データが設定/更新された場合、プレビューを表示/更新
        const currentRange = getSelectionRangeBox();
        const currentCenter = currentRange ? currentRange.getCenter(_center).round() : _initialBoxCenter;
        // クリップボード内容と現在の範囲の中心を渡す
        updatePastePreview(sceneRef, getClipboardData(), currentCenter);
    } else {
        // データがクリアされた場合、プレビューをクリア
        clearPastePreview(sceneRef);
    }
}


// --- 公開関数 (クリック選択関連) ---

/**
 * 現在クリックによって選択されている全てのブロックデータを取得します。
 * @returns {BlockData[]} 選択中のBlockDataの配列（シャローコピー）。
 */
export function getSelectedBlocks() {
    return [...selectedBlocks];
}

/**
 * 全てのクリック選択を解除し、関連するハイライトも解除します。
 * 選択状態が実際に変更された場合は 'selectionchanged' イベントを発行します。
 * @returns {boolean} 選択がクリアされた場合は true、元々選択されていなければ false。
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
        // 選択変更イベント発行
        document.dispatchEvent(new CustomEvent('selectionchanged', { detail: { selectedBlocks: [] } }));
        // XML編集モードならUI更新
        if (currentMode === EditMode.XML_EDIT) {
            updateXmlEditUI();
        }
        return true; // クリアされた
    }
    return false; // 元々空だった
}

/**
 * クリック選択ブロックリストを指定されたものに設定し、ハイライトを更新します。
 * （主に範囲選択結果の反映や、将来的な複数ブロック選択機能で使用想定）
 * @param {BlockData[]} newSelectedBlocks - 新しく選択するブロックの配列。
 */
export function setSelectedBlocks(newSelectedBlocks) {
    // この関数は Step 5 で必要になるため、実装は維持
    const currentMode = getCurrentMode();
    const oldSelectionIds = new Set(selectedBlocks.map(b => b.id));
    const newSelectionIds = new Set(newSelectedBlocks.map(b => b.id));
    // IDのセット内容が異なるか比較
    let selectionChanged = oldSelectionIds.size !== newSelectionIds.size ||
                           [...oldSelectionIds].some(id => !newSelectionIds.has(id));

    if (!selectionChanged) return; // 変更がなければ何もしない

    console.log(`[SelectionState] クリック選択を ${newSelectedBlocks.length} 個のブロックに設定します。`);
    clearAllHighlights(selectedBlocks, currentMode); // 既存ハイライト解除
    selectedBlocks = [...newSelectedBlocks];          // 新しい配列で置き換え
    // 新しい選択をハイライト
    selectedBlocks.forEach(blockData => {
        const meshToHighlight = (currentMode === EditMode.XML_EDIT) ? blockData.foregroundMesh : blockData.mesh;
        highlightMesh(meshToHighlight);
    });
    // 選択変更イベント発行
    document.dispatchEvent(new CustomEvent('selectionchanged', { detail: { selectedBlocks: getSelectedBlocks() } }));
    // XML編集モードならUI更新
    if (currentMode === EditMode.XML_EDIT) {
        updateXmlEditUI();
    }
}

// --- 公開関数 (範囲選択関連) ---

/**
 * 現在の選択範囲を示す Box3 オブジェクトを取得します。
 * 外部で変更されないようにクローンを返します。範囲未設定の場合は null。
 * @returns {THREE.Box3 | null} 選択範囲のBox3（クローン）、またはnull。
 */
export function getSelectionRangeBox() {
    return currentSelectionRangeBox ? currentSelectionRangeBox.clone() : null;
}

/**
 * 選択範囲を指定された Box3 に設定し、関連する表示（ボックス、ギズモ、プレビュー）を更新します。
 * @param {THREE.Box3} box - 設定する新しい選択範囲。空(empty)の場合は警告を出す。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 */
export function setSelectionRange(box, scene) {
    // 引数チェック
    if (!(box instanceof THREE.Box3)) {
        console.error("[SelectionState] setSelectionRange に無効な Box3 が渡されました。"); return;
    }
    if (!scene) {
        console.error("[SelectionState] setSelectionRange: Scene が必要です。"); return;
    }
    // 空のBoxは設定しない
    if(box.isEmpty()){
        console.warn("[SelectionState] setSelectionRange に空の Box3 が渡されたため、処理をスキップします。");
        return;
    }

    // 内部状態を更新 (クローンを保持)
    currentSelectionRangeBox = box.clone();
    console.log("[SelectionState] 選択範囲を更新:", currentSelectionRangeBox.min, currentSelectionRangeBox.max);

    // 関連する表示を更新
    showSelectionBox(scene, currentSelectionRangeBox); // 選択ボックス表示
    updateGizmos(scene, currentSelectionRangeBox);     // 移動・サイズ変更ギズモ表示/位置更新

    // クリップボードにデータがあればペーストプレビューも更新
    if (hasClipboard()) {
        currentSelectionRangeBox.getCenter(_center); // Boxの中心を取得
        updatePastePreview(scene, getClipboardData(), _center.round()); // 整数座標を基準にプレビュー
    }
}

/**
 * 現在の選択範囲をクリアし、関連する表示（ボックス、ギズモ、プレビュー）を非表示にします。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 */
export function clearSelectionRange(scene) {
    // 範囲が存在する場合のみ処理
    if (currentSelectionRangeBox) {
        currentSelectionRangeBox = null; // 内部状態をクリア
        // 関連表示を非表示にする
        hideSelectionBox();
        hideGizmos();
        clearPastePreview(scene); // scene が必要
        console.log("[SelectionState] 選択範囲、ボックス、ギズモ、プレビューをクリアしました。");
    }
}

/**
 * 現在の選択範囲ボックスの中心を維持したまま、サイズ（辺の長さ）を
 * 指定されたキー ('J', 'K', 'L') に応じて入れ替えます。
 * アンドゥ/リドゥは考慮しません。
 * @param {'J'|'K'|'L'} key - 操作キー (J: Y/Z入れ替え, K: X/Z入れ替え, L: X/Y入れ替え)。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 */
export function swapSelectionRangeAxes(key, scene) {
    const currentRange = getSelectionRangeBox();
    if (!currentRange || currentRange.isEmpty()) {
        console.warn("[SelectionState] サイズ入れ替え対象の有効な選択範囲がありません。");
        return;
    }
    if (!scene) { console.error("[SelectionState] swapSelectionRangeAxes: Scene が必要です。"); return; }

    currentRange.getCenter(_center); // 中心は維持
    currentRange.getSize(_size);     // 現在のサイズ

    // キーに応じてサイズ要素を入れ替え
    let newSize = _size.clone();
    switch (key) {
        case 'J': newSize.set(_size.x, _size.z, _size.y); console.log(`[SelectionState] 範囲サイズ入れ替え (J): Y <=> Z`); break;
        case 'K': newSize.set(_size.z, _size.y, _size.x); console.log(`[SelectionState] 範囲サイズ入れ替え (K): X <=> Z`); break;
        case 'L': newSize.set(_size.y, _size.x, _size.z); console.log(`[SelectionState] 範囲サイズ入れ替え (L): X <=> Y`); break;
        default: console.warn(`[SelectionState] swapSelectionRangeAxes: 無効なキー ${key}`); return;
    }

    // サイズが 0 以下にならないように最小値を保証
    const minDim = 1.0;
    newSize.max(new THREE.Vector3(minDim, minDim, minDim));

    // 新しい中心とサイズで Box3 を再作成
    const newBox = _tempBox.setFromCenterAndSize(_center, newSize);

    // 状態と表示を更新
    setSelectionRange(newBox, scene);
}

/**
 * 現在の選択範囲ボックスを指定された方向に1ブロック分移動させます。
 * アンドゥ/リドゥは考慮しません。
 * @param {'up' | 'down' | 'left' | 'right' | string} direction - 移動方向。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 */
export function adjustSelectionRange(direction, scene) {
    const currentRange = getSelectionRangeBox();
    if (!currentRange || currentRange.isEmpty()) { /* Warn */ return; }
    if (!scene) { /* Error */ return; }

    // 移動ベクトルを設定
    switch (direction) {
        case 'up':    _moveVector.set(0, 1, 0); break; // +Y
        case 'down':  _moveVector.set(0, -1, 0); break; // -Y
        case 'left':  _moveVector.set(-1, 0, 0); break; // -X
        case 'right': _moveVector.set(1, 0, 0); break; // +X
        default: console.warn(`[SelectionState] 未知の移動方向: ${direction}`); return;
    }

    // ボックスを移動
    const newBox = currentRange.clone().translate(_moveVector);

    // 状態と表示を更新
    setSelectionRange(newBox, scene);
    console.log(`[SelectionState] 選択範囲を ${direction} へ移動しました。`);
    // TODO (Step 6): アンドゥ履歴登録
}