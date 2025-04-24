/**
 * @fileoverview 右ツールバー (#right-toolbar) のUI要素とインタラクションを管理します。
 * コピー/カット/ペースト、アンドゥ/リドゥ、対称編集、ファイルI/O、フルスクリーンなどを扱います。
 */

// --- 必要なモジュールや関数をインポート ---
import { handleLoadButtonClick, handleSaveButtonClick } from '../handlers/fileHandlers.js';
import { copySelectionToClipboard, cutSelectionToClipboard, pasteFromClipboard } from '../handlers/clipboardHandler.js';
import { clearClipboardData, hasClipboard } from '../state/clipboardState.js';
import { undo, redo } from '../state/historyManager.js';
import { toggleSymmetryAxis, isSymmetryEnabled } from '../state/symmetryState.js';
import { EditMode } from '../state/editMode.js'; // 範囲選択モード表示切替用

// --- モジュール内変数 ---
let appState = null;

// --- DOM要素キャッシュ ---
let rightToolbar = null;
let copyButton = null, cutButton = null, pasteButton = null, clearClipboardButton = null;
let undoButton = null, redoButton = null;
const symmetryButtons = { x: null, y: null, z: null };
let loadButtonLabel = null, fileInputMain = null, saveButton = null;
let fullscreenButton = null;
let rangeOnlyElements = null; // NodeListOf<Element>

/**
 * 右ツールバーの初期化を行います。DOM要素への参照取得とイベントリスナー設定。
 * @param {object} appStateRef - アプリケーション状態オブジェクトへの参照。
 */
export function initializeRightToolbar(appStateRef) {
    console.log("[RightToolbarHandler] 初期化中...");
    appState = appStateRef;

    // --- DOM要素を取得 ---
    rightToolbar = document.getElementById('right-toolbar');
    copyButton = rightToolbar?.querySelector('[data-action="COPY"]');
    cutButton = rightToolbar?.querySelector('[data-action="CUT"]');
    pasteButton = rightToolbar?.querySelector('[data-action="PASTE"]');
    clearClipboardButton = rightToolbar?.querySelector('[data-action="CLEAR_CLIPBOARD"]');
    undoButton = rightToolbar?.querySelector('[data-action="UNDO"]');
    redoButton = rightToolbar?.querySelector('[data-action="REDO"]');
    symmetryButtons.x = rightToolbar?.querySelector('[data-action="SYMMETRY_X"]');
    symmetryButtons.y = rightToolbar?.querySelector('[data-action="SYMMETRY_Y"]');
    symmetryButtons.z = rightToolbar?.querySelector('[data-action="SYMMETRY_Z"]');
    loadButtonLabel = rightToolbar?.querySelector('label[for="file-input-main"]');
    fileInputMain = document.getElementById('file-input-main'); // これは body 直下でも良い
    saveButton = rightToolbar?.querySelector('[data-action="SAVE"]');
    fullscreenButton = rightToolbar?.querySelector('#fullscreen-button');
    rangeOnlyElements = rightToolbar?.querySelectorAll('.range-only'); // 範囲選択モード専用要素

    // --- イベントリスナー設定 ---
    // ファイル操作
    fileInputMain?.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file && appState) {
            appState.selectedFile = file;
            handleLoadButtonClick(appState);
            event.target.value = null; // Reset input
        }
    });
    saveButton?.addEventListener('click', () => { if (appState) handleSaveButtonClick(appState); });

    // クリップボード
    copyButton?.addEventListener('click', () => { if(appState) copySelectionToClipboard(appState); });
    cutButton?.addEventListener('click', () => { if(appState) cutSelectionToClipboard(appState); });
    pasteButton?.addEventListener('click', () => { if(appState && hasClipboard()) pasteFromClipboard(appState); });
    clearClipboardButton?.addEventListener('click', () => clearClipboardData());

    // アンドゥ・リドゥ
    undoButton?.addEventListener('click', () => undo());
    redoButton?.addEventListener('click', () => redo());

    // 対称編集
    symmetryButtons.x?.addEventListener('click', () => toggleSymmetryAxis('x'));
    symmetryButtons.y?.addEventListener('click', () => toggleSymmetryAxis('y'));
    symmetryButtons.z?.addEventListener('click', () => toggleSymmetryAxis('z'));

    // フルスクリーン
    fullscreenButton?.addEventListener('click', toggleFullScreenHandler);

    // アプリケーション内部状態変化イベントのリスナー
    document.addEventListener('clipboardstatechange', handleClipboardStateChange);
    document.addEventListener('historystatuschange', handleHistoryStatusChange);
    document.addEventListener('symmetrystatechange', handleSymmetryStateChange);
    // 編集モード変更による範囲選択UIの表示切替もここで担当
    document.addEventListener('editmodechange', handleEditModeChangeForRangeUI);

    // --- 初期状態設定 ---
    updatePasteButtonState(hasClipboard()); // ペーストボタン初期状態
    updateUndoRedoButtons(false, false);    // アンドゥ/リドゥ初期状態
    updateSymmetryButtonsUI({ x: isSymmetryEnabled('x'), y: isSymmetryEnabled('y'), z: isSymmetryEnabled('z') }); // 対称ボタン初期状態
    updateRangeOnlyVisibility(EditMode.NORMAL); // 範囲選択UIは初期非表示

    console.log("[RightToolbarHandler] 初期化完了。");
}

/** @private フルスクリーン切替処理 */
function toggleFullScreenHandler() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`[UI] フルスクリーンモードエラー: ${err.message} (${err.name})`);
            alert(`フルスクリーンモードにできませんでした。`);
        });
        console.log("[UI] フルスクリーン有効化");
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
            console.log("[UI] フルスクリーン解除");
        }
    }
}

/** @private クリップボード状態変更イベントハンドラ */
function handleClipboardStateChange(event) {
    updatePasteButtonState(event.detail.hasData);
}

/** @private 履歴状態変更イベントハンドラ */
function handleHistoryStatusChange(event) {
    updateUndoRedoButtons(event.detail.canUndo, event.detail.canRedo);
}

/** @private 対称編集状態変更イベントハンドラ */
function handleSymmetryStateChange(event) {
    updateSymmetryButtonsUI(event.detail);
}

/** @private 編集モード変更イベントハンドラ (範囲選択UI用) */
function handleEditModeChangeForRangeUI(event) {
    updateRangeOnlyVisibility(event.detail.newMode);
}

/** @private ペーストボタンの有効/無効状態更新 */
function updatePasteButtonState(enabled) {
    if (pasteButton) {
        pasteButton.disabled = !enabled;
        pasteButton.style.opacity = enabled ? 1 : 0.5;
        pasteButton.style.cursor = enabled ? 'pointer' : 'not-allowed';
    }
     // クリアボタンも連動させる
     if (clearClipboardButton) {
        clearClipboardButton.disabled = !enabled;
        clearClipboardButton.style.opacity = enabled ? 1 : 0.5;
        clearClipboardButton.style.cursor = enabled ? 'pointer' : 'not-allowed';
     }
}

/** @private アンドゥ/リドゥボタンの有効/無効状態更新 */
function updateUndoRedoButtons(canUndo, canRedo) {
    if (undoButton) { undoButton.disabled = !canUndo; undoButton.style.opacity = canUndo ? 1 : 0.4; undoButton.style.cursor = canUndo ? 'pointer' : 'not-allowed'; }
    if (redoButton) { redoButton.disabled = !canRedo; redoButton.style.opacity = canRedo ? 1 : 0.4; redoButton.style.cursor = canRedo ? 'pointer' : 'not-allowed'; }
}

/** @private 対称編集ボタンのアクティブ状態更新 */
function updateSymmetryButtonsUI(symmetryState) {
    if (symmetryButtons.x) symmetryButtons.x.classList.toggle('active', symmetryState.x);
    if (symmetryButtons.y) symmetryButtons.y.classList.toggle('active', symmetryState.y);
    if (symmetryButtons.z) symmetryButtons.z.classList.toggle('active', symmetryState.z);
}

/** @private 範囲選択モード専用UIの表示/非表示更新 */
function updateRangeOnlyVisibility(currentMode) {
    const isRangeSelectVisible = (currentMode === EditMode.RANGE_SELECT);
    rangeOnlyElements?.forEach(el => {
        el.style.display = isRangeSelectVisible ? (el.tagName === 'HR' ? 'block' : 'inline-flex') : 'none'; // ボタンは inline-flex
    });
    // 十字キーの表示切替もここで行う (または別のハンドラで)
    const rangeDpad = document.getElementById('range-adjust-dpad');
    if (rangeDpad) rangeDpad.style.display = isRangeSelectVisible ? 'grid' : 'none';
}