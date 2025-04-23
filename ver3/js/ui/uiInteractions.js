/**
 * @fileoverview 新しいUI要素の基本的なインタラクション（トグル表示、モード切替、各種ボタン操作など）を管理します。
 * main.js から初期化され、各UI要素にイベントリスナーを設定します。
 */

// --- 必要なモジュールや関数をインポート ---
import { setFpsLimitMode } from '../main.js'; // mainからFPS設定関数
import { setStickVisibility } from '../interactions/cameraStickHandler.js'; // スティック表示状態設定
import { setEditMode, EditMode } from '../state/editMode.js';           // モード設定・定義
import { updateModeIndicator } from './modeIndicator.js';               // モード表示更新
import { handleLoadButtonClick, handleSaveButtonClick } from '../handlers/fileHandlers.js'; // ファイル操作
import { adjustSelectionRange } from '../interactions/selectionState.js'; // 範囲選択ボックス移動
import { copySelectionToClipboard, cutSelectionToClipboard, pasteFromClipboard } from '../handlers/clipboardHandler.js'; // クリップボード操作
import { clearClipboardData, hasClipboard } from '../state/clipboardState.js'; // クリップボード状態
import { undo, redo } from '../state/historyManager.js';                 // アンドゥ・リドゥ
import { toggleSymmetryAxis, isSymmetryEnabled } from '../state/symmetryState.js'; // 対称編集状態

// --- モジュール内変数 ---

/** @type {object | null} アプリケーション状態オブジェクトへの参照 (主に controls を使う) */
let appState = null;
/** @type {boolean} インベントリパネルが表示されているか */
let inventoryVisible = false;
/** @type {boolean} XML編集パネルが格納されているか */
let xmlPanelCollapsed = false;
/** @type {boolean} カメラ移動スティックが表示されているか */
let stickVisible = true;
/** @type {number} 現在のFPS制限モード (0: Unlimited, 1: 60fps, 2: 30fps) */
let currentFpsLimitMode = 0;

// --- DOM要素キャッシュ (初期化時に設定) ---
let toggleStickButton = null, cameraStick = null, fullscreenButton = null;
let toggleXmlPanelButton = null, xmlEditPanel = null, toggleInventoryButton = null;
let inventoryPanel = null, inventoryOverlay = null, bottomToolbar = null;
let batterySaveButton = null;
let modeButtons = null; // NodeListOf<Element>
let loadButtonLabel = null, fileInputMain = null, saveButton = null;
let copyButton = null, cutButton = null, pasteButton = null, clearClipboardButton = null;
let undoButton = null, redoButton = null;
const symmetryButtons = {}; // { x: Element | null, y: Element | null, z: Element | null }
const dpadButtons = {}; // { up: Element | null, ... }

// --- UI操作関数 ---

/**
 * フルスクリーンモードを切り替えます。
 * @private
 */
function toggleFullScreen() {
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

/**
 * カメラ移動スティックの表示/非表示を切り替えます。
 * 関連するハンドラにも状態を通知します。
 * @private
 */
function toggleStickVisibility() {
     stickVisible = !stickVisible;
     cameraStick?.classList.toggle('hidden', !stickVisible);
     toggleStickButton?.classList.toggle('active', stickVisible);
     // cameraStickHandler に状態を通知
     setStickVisibility(stickVisible);
     console.log(`[UI] カメラ移動スティック表示: ${stickVisible}`);
}

/**
 * XML編集パネルの格納/展開状態を切り替えます。
 * @private
 */
function toggleXmlPanel() {
     xmlPanelCollapsed = !xmlPanelCollapsed;
     xmlEditPanel?.classList.toggle('collapsed', xmlPanelCollapsed);
     console.log(`[UI] XMLパネル ${xmlPanelCollapsed ? '格納' : '展開'}`);
 }

/**
 * インベントリパネルの表示/非表示を切り替えます。
 * オーバーレイ表示や下部ツールバーの位置調整も連動させます。
 * @param {boolean | null} [forceState=null] - 強制的に設定する状態 (true:表示, false:非表示)。nullならトグル。
 * @private
 */
function toggleInventory(forceState = null) {
    const shouldBeVisible = forceState !== null ? forceState : !inventoryVisible;
    if (shouldBeVisible === inventoryVisible) return; // 状態変化なし

    inventoryPanel?.classList.toggle('visible', shouldBeVisible);
    inventoryOverlay?.classList.toggle('visible', shouldBeVisible);
    bottomToolbar?.classList.toggle('lowered', shouldBeVisible);
    inventoryVisible = shouldBeVisible;
    console.log(`[UI] インベントリ表示: ${inventoryVisible}`);

    // インベントリ表示中はカメラコントロールを無効化
    if (appState?.controls) {
         const isStickDragging = false; // TODO: スティックドラッグ状態の取得
         appState.controls.enabled = !inventoryVisible && !isStickDragging;
    }
}

/**
 * FPS制限モードを順次 (∞ -> 60 -> 30 -> ∞) 切り替え、
 * UI表示と main.js の状態を更新します。
 * @private
 */
function cycleFpsLimit() {
    currentFpsLimitMode = (currentFpsLimitMode + 1) % 3;
    let buttonText = '∞';
    let buttonClass = 'fps-unlimited';
    let buttonActive = false;

    switch (currentFpsLimitMode) {
        case 1: buttonText = '60'; buttonClass = 'fps-60'; buttonActive = true; break;
        case 2: buttonText = '30'; buttonClass = 'fps-30'; buttonActive = true; break;
    }
    setFpsLimitMode(currentFpsLimitMode); // main.js に通知
    if (batterySaveButton) { // ボタン表示更新
        batterySaveButton.textContent = buttonText;
        batterySaveButton.className = `toolbar-button ${buttonClass}`;
        batterySaveButton.classList.toggle('active', buttonActive);
    }
    console.log(`[UI] FPS Limit cycled to mode: ${currentFpsLimitMode} (${buttonText} FPS)`);
}


/**
 * 編集モード変更時にUI要素の状態（アクティブなモードボタン、パネル表示など）を更新します。
 * main.js の editmodechange リスナーから呼び出されます。
 * @param {EditMode} newMode - 新しい編集モード。
 */
export function handleModeChangeUI(newMode) {
    console.log(`[UI] モード変更UI更新 -> ${newMode}`);

    // モードボタンのアクティブ状態更新
    modeButtons?.forEach(button => {
        button.classList.toggle('active', button.dataset.mode === newMode);
    });

    // モードインジケータ更新
    updateModeIndicator(newMode);

    // XML編集パネル表示/非表示 & 展開
    const isXmlEditVisible = (newMode === EditMode.XML_EDIT);
    if (xmlEditPanel) xmlEditPanel.style.display = isXmlEditVisible ? 'block' : 'none';
    if (isXmlEditVisible && xmlPanelCollapsed) { toggleXmlPanel(); } // 開いたら展開

    // 範囲選択モード専用UI表示/非表示
    const isRangeSelectVisible = (newMode === EditMode.RANGE_SELECT);
    document.querySelectorAll('.range-only').forEach(el => {
        el.style.display = isRangeSelectVisible ? (el.tagName === 'HR' ? 'block' : 'flex') : 'none';
    });
    const rangeDpad = document.getElementById('range-adjust-dpad');
    if (rangeDpad) rangeDpad.style.display = isRangeSelectVisible ? 'grid' : 'none';
}


/**
 * アンドゥ/リドゥボタンの有効/無効状態を更新します。
 * historyManager から発行される historystatuschange イベントで呼び出されます。
 * @param {boolean} canUndo - アンドゥ可能か。
 * @param {boolean} canRedo - リドゥ可能か。
 * @private
 */
function updateUndoRedoButtons(canUndo, canRedo) {
    // ボタン要素の disabled 属性と見た目を更新
    if (undoButton) {
        undoButton.disabled = !canUndo;
        undoButton.style.opacity = canUndo ? 1 : 0.4;
        undoButton.style.cursor = canUndo ? 'pointer' : 'not-allowed';
    }
    if (redoButton) {
        redoButton.disabled = !canRedo;
        redoButton.style.opacity = canRedo ? 1 : 0.4;
        redoButton.style.cursor = canRedo ? 'pointer' : 'not-allowed';
    }
}

/**
 * 対称編集ボタンのアクティブ状態を更新します。
 * symmetryState から発行される symmetrystatechange イベントで呼び出されます。
 * @param {object} symmetryState - 現在の対称軸の状態 {x: boolean, y: boolean, z: boolean}。
 * @private
 */
function updateSymmetryButtons(symmetryState) {
    // 各軸ボタンの active クラスを状態に合わせてトグル
    if (symmetryButtons.x) symmetryButtons.x.classList.toggle('active', symmetryState.x);
    if (symmetryButtons.y) symmetryButtons.y.classList.toggle('active', symmetryState.y);
    if (symmetryButtons.z) symmetryButtons.z.classList.toggle('active', symmetryState.z);
}


// --- 初期化関数 ---

/**
 * このモジュールで扱うUI要素への参照取得とイベントリスナー設定を行います。
 * uiInitializer.js から呼び出されます。
 * @param {object} appStateRefParam - アプリケーション状態オブジェクトへの参照。
 */
export function initializeUIInteractions(appStateRefParam) {
    console.log("[UI] UIインタラクション初期化中...");
    appState = appStateRefParam;

    // --- DOM要素を取得 ---
    toggleStickButton = document.getElementById('toggle-stick-button');
    cameraStick = document.getElementById('camera-stick');
    fullscreenButton = document.getElementById('fullscreen-button');
    toggleXmlPanelButton = document.getElementById('toggle-xml-panel');
    xmlEditPanel = document.getElementById('xml-edit-panel');
    toggleInventoryButton = document.getElementById('toggle-inventory-button');
    inventoryPanel = document.getElementById('inventory-panel');
    inventoryOverlay = document.getElementById('inventory-overlay');
    bottomToolbar = document.getElementById('bottom-toolbar');
    batterySaveButton = document.getElementById('battery-save-button');
    modeButtons = document.querySelectorAll('#left-toolbar .mode-button');
    loadButtonLabel = document.querySelector('label[for="file-input-main"]');
    fileInputMain = document.getElementById('file-input-main');
    saveButton = document.querySelector('#right-toolbar [data-action="SAVE"]');
    copyButton = document.querySelector('#right-toolbar [data-action="COPY"]');
    cutButton = document.querySelector('#right-toolbar [data-action="CUT"]');
    pasteButton = document.querySelector('#right-toolbar [data-action="PASTE"]');
    clearClipboardButton = document.querySelector('#right-toolbar [data-action="CLEAR_CLIPBOARD"]');
    undoButton = document.querySelector('#right-toolbar [data-action="UNDO"]');
    redoButton = document.querySelector('#right-toolbar [data-action="REDO"]');
    symmetryButtons.x = document.querySelector('#right-toolbar [data-action="SYMMETRY_X"]');
    symmetryButtons.y = document.querySelector('#right-toolbar [data-action="SYMMETRY_Y"]');
    symmetryButtons.z = document.querySelector('#right-toolbar [data-action="SYMMETRY_Z"]');
    dpadButtons.up = document.getElementById('dpad-up');
    dpadButtons.down = document.getElementById('dpad-down');
    dpadButtons.left = document.getElementById('dpad-left');
    dpadButtons.right = document.getElementById('dpad-right');

    // --- イベントリスナー設定 ---
    // 各ボタンのクリック/変更イベントにそれぞれの処理関数を紐付け
    fullscreenButton?.addEventListener('click', toggleFullScreen);
    toggleStickButton?.addEventListener('click', toggleStickVisibility);
    toggleXmlPanelButton?.addEventListener('click', toggleXmlPanel);
    toggleInventoryButton?.addEventListener('click', () => toggleInventory());
    inventoryOverlay?.addEventListener('click', () => toggleInventory(false));
    batterySaveButton?.addEventListener('click', cycleFpsLimit);

    modeButtons?.forEach(button => {
        button.addEventListener('click', () => {
            const modeToSet = button.dataset.mode;
            if (modeToSet && Object.values(EditMode).includes(modeToSet)) {
                setEditMode(modeToSet); // モード変更をトリガー
            }
        });
    });

    fileInputMain?.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file && appState) {
            appState.selectedFile = file;
            handleLoadButtonClick(appState); // ファイル選択後すぐに読み込み
            event.target.value = null; // 同じファイル選択用リセット
        }
    });
    saveButton?.addEventListener('click', () => { if (appState) handleSaveButtonClick(appState); });

    copyButton?.addEventListener('click', () => { if(appState) copySelectionToClipboard(appState); });
    cutButton?.addEventListener('click', () => { if(appState) cutSelectionToClipboard(appState); });
    pasteButton?.addEventListener('click', () => { if(appState && hasClipboard()) pasteFromClipboard(appState); });
    clearClipboardButton?.addEventListener('click', () => clearClipboardData());
    undoButton?.addEventListener('click', () => undo());
    redoButton?.addEventListener('click', () => redo());

    symmetryButtons.x?.addEventListener('click', () => toggleSymmetryAxis('x'));
    symmetryButtons.y?.addEventListener('click', () => toggleSymmetryAxis('y'));
    symmetryButtons.z?.addEventListener('click', () => toggleSymmetryAxis('z'));

    dpadButtons.up?.addEventListener('click', () => { if(appState) adjustSelectionRange('up', appState.scene); });
    dpadButtons.down?.addEventListener('click', () => { if(appState) adjustSelectionRange('down', appState.scene); });
    dpadButtons.left?.addEventListener('click', () => { if(appState) adjustSelectionRange('left', appState.scene); });
    dpadButtons.right?.addEventListener('click', () => { if(appState) adjustSelectionRange('right', appState.scene); });

    // アプリケーション内部状態変化イベントのリスナー
    document.addEventListener('clipboardstatechange', (event) => {
        if (pasteButton) { // ペーストボタン状態更新
            const enabled = event.detail.hasData;
            pasteButton.disabled = !enabled;
            pasteButton.style.opacity = enabled ? 1 : 0.5;
            pasteButton.style.cursor = enabled ? 'pointer' : 'not-allowed';
        }
    });
    document.addEventListener('historystatuschange', (event) => {
        // アンドゥ/リドゥボタン状態更新
        updateUndoRedoButtons(event.detail.canUndo, event.detail.canRedo);
    });
    document.addEventListener('symmetrystatechange', (event) => {
        // 対称ボタン状態更新
        updateSymmetryButtons(event.detail);
    });

    // --- 初期状態設定 ---
    cameraStick?.classList.toggle('hidden', !stickVisible);
    toggleStickButton?.classList.toggle('active', stickVisible);
    xmlEditPanel?.classList.toggle('collapsed', xmlPanelCollapsed);
    if(batterySaveButton){ batterySaveButton.textContent = '∞'; batterySaveButton.className = 'toolbar-button fps-unlimited'; }
    // ペーストボタン、アンドゥ/リドゥボタンの初期無効化
    if (pasteButton) { pasteButton.disabled = !hasClipboard(); pasteButton.style.opacity = hasClipboard() ? 1 : 0.5; pasteButton.style.cursor = hasClipboard() ? 'pointer' : 'not-allowed'; }
    updateUndoRedoButtons(false, false); // 初期状態は両方不可
    // 対称ボタン初期状態
    updateSymmetryButtons({ x: isSymmetryEnabled('x'), y: isSymmetryEnabled('y'), z: isSymmetryEnabled('z') });

    console.log("[UI] UIインタラクション初期化完了。");
}