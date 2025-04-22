/**
 * @fileoverview 新しいUI要素の基本的なインタラクション（トグル表示、モード切替、ファイル操作トリガーなど）を管理します。
 * 主に uiInitializer.js から初期化されます。
 */

// --- 必要なモジュールをインポート ---
import { setFpsLimitMode } from '../main.js'; // mainからFPS設定関数
import { setStickVisibility } from '../interactions/cameraStickHandler.js'; // スティック表示状態連携
import { setEditMode, EditMode } from '../state/editMode.js'; // モード設定関数と定義
import { updateModeIndicator } from './modeIndicator.js'; // モード表示更新
import { handleLoadButtonClick, handleSaveButtonClick } from '../handlers/fileHandlers.js'; // ファイル操作ハンドラ

// --- モジュール内変数 ---
/** @type {object | null} アプリケーション状態への参照 */
let appState = null;
/** @type {boolean} インベントリパネルが表示されているか */
let inventoryVisible = false;
/** @type {boolean} XML編集パネルが格納されているか */
let xmlPanelCollapsed = false;
/** @type {boolean} カメラ移動スティックが表示されているか */
let stickVisible = true; // 初期状態は表示
/** @type {number} 現在のFPS制限モード (0: Unlimited, 1: 60fps, 2: 30fps) */
let currentFpsLimitMode = 0;

// --- DOM要素キャッシュ (initializeUIInteractions で設定) ---
let toggleStickButton = null, cameraStick = null, fullscreenButton = null;
let toggleXmlPanelButton = null, xmlEditPanel = null, toggleInventoryButton = null;
let inventoryPanel = null, inventoryOverlay = null, bottomToolbar = null;
let batterySaveButton = null, modeButtons = null;
let loadButtonLabel = null, fileInputMain = null, saveButton = null;

// --- UI操作関数 ---

/**
 * フルスクリーンモードを切り替えます。
 * @private
 */
function toggleFullScreen() {
    if (!document.fullscreenElement) {
        // フルスクリーンを要求
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`[UI] フルスクリーンモードエラー: ${err.message} (${err.name})`);
            // ユーザーへの通知 (例: alert, または後述のポップアップ)
            alert(`フルスクリーンモードにできませんでした。`);
        });
        console.log("[UI] フルスクリーン有効化");
    } else {
        // フルスクリーンを解除
        if (document.exitFullscreen) {
            document.exitFullscreen();
            console.log("[UI] フルスクリーン解除");
        }
    }
}

/**
 * カメラ移動スティックの表示/非表示を切り替えます。
 * cameraStickHandler にも状態を通知します。
 * @private
 */
function toggleStickVisibility() {
     stickVisible = !stickVisible; // 状態を反転
     // CSSクラスで表示状態を制御
     cameraStick?.classList.toggle('hidden', !stickVisible);
     // ボタンのアクティブ状態を更新
     toggleStickButton?.classList.toggle('active', stickVisible);
     // cameraStickHandler に状態変更を通知
     setStickVisibility(stickVisible);
     console.log(`[UI] カメラ移動スティック表示: ${stickVisible}`);
}

/**
 * XML編集パネルの格納/展開状態を切り替えます。
 * @private
 */
function toggleXmlPanel() {
     xmlPanelCollapsed = !xmlPanelCollapsed; // 状態反転
     // CSSクラスで表示状態を制御
     xmlEditPanel?.classList.toggle('collapsed', xmlPanelCollapsed);
     console.log(`[UI] XMLパネル ${xmlPanelCollapsed ? '格納' : '展開'}`);
 }

/**
 * インベントリパネルの表示/非表示を切り替えます。
 * オーバーレイ、下部ツールバーの位置、カメラコントロールの有効/無効も連動させます。
 * @param {boolean | null} [forceState=null] - 強制的に設定する状態 (true:表示, false:非表示)。nullならトグル。
 * @private
 */
function toggleInventory(forceState = null) {
    const shouldBeVisible = forceState !== null ? forceState : !inventoryVisible;
    // 状態が変わらない場合は何もしない
    if (shouldBeVisible === inventoryVisible) return;

    // 各要素の表示状態をCSSクラスで切り替え
    inventoryPanel?.classList.toggle('visible', shouldBeVisible);
    inventoryOverlay?.classList.toggle('visible', shouldBeVisible);
    bottomToolbar?.classList.toggle('lowered', shouldBeVisible); // 下ツールバーを上下させるクラス
    inventoryVisible = shouldBeVisible; // 状態を更新
    console.log(`[UI] インベントリ表示: ${inventoryVisible}`);

    // カメラコントロールの有効/無効を切り替え
    if (appState?.controls) {
         const isStickDragging = false; // TODO: スティック操作状態を cameraStickHandler から取得する必要あり
         appState.controls.enabled = !inventoryVisible && !isStickDragging;
         // controls.enabled = false にすると視点操作だけでなく、
         // handleCanvasPointerDown の isInputFocused チェックも機能しなくなる可能性があるので注意。
         // より細かく制御するか、isInputFocused の条件を見直す必要があるかも。
         console.log(`[UI] OrbitControls enabled: ${appState.controls.enabled}`);
    }
}

/**
 * FPS制限モードを順次 (∞ -> 60 -> 30 -> ∞) 切り替え、
 * UI表示を更新し、main.jsに通知します。
 * @private
 */
function cycleFpsLimit() {
    currentFpsLimitMode = (currentFpsLimitMode + 1) % 3; // 0, 1, 2 でループ
    let buttonText = '∞';
    let buttonClass = 'fps-unlimited';
    let buttonActive = false; // activeクラスは制限時のみ付与

    // モードに応じて表示テキストとCSSクラスを設定
    switch (currentFpsLimitMode) {
        case 1: // 60 FPS
            buttonText = '60'; buttonClass = 'fps-60'; buttonActive = true; break;
        case 2: // 30 FPS
            buttonText = '30'; buttonClass = 'fps-30'; buttonActive = true; break;
    }

    // main.js のFPS制限設定関数を呼び出す
    setFpsLimitMode(currentFpsLimitMode);

    // ボタンの表示を更新
    if (batterySaveButton) {
        batterySaveButton.textContent = buttonText;
        // className を直接書き換える（既存クラスを維持しつつモードクラスを追加/削除）
        batterySaveButton.className = `toolbar-button ${buttonClass}`; // 基本クラス + モードクラス
        batterySaveButton.classList.toggle('active', buttonActive); // activeクラスをトグル
    }
    console.log(`[UI] FPS Limit cycled to mode: ${currentFpsLimitMode} (${buttonText} FPS)`);
}

// --- モード変更時のUI更新 ---

/**
 * 編集モード変更時に呼び出され、関連するUI要素の状態を一括で更新します。
 * (main.jsのeditmodechangeリスナーから呼び出されます)
 * @param {EditMode} newMode - 新しく設定された編集モード。
 */
export function handleModeChangeUI(newMode) {
    console.log(`[UI] モード変更UI更新 -> ${newMode}`);

    // 1. 左ツールバーのモードボタンのアクティブ状態
    modeButtons?.forEach(button => {
        button.classList.toggle('active', button.dataset.mode === newMode);
    });

    // 2. 画面右上のモードインジケータのテキスト更新
    updateModeIndicator(newMode);

    // 3. XML編集パネルの表示/非表示 と 格納状態リセット
    const isXmlEditVisible = (newMode === EditMode.XML_EDIT);
    if (xmlEditPanel) xmlEditPanel.style.display = isXmlEditVisible ? 'block' : 'none';
    // XML編集モード以外になった場合、もし格納されていたら展開状態に戻す
    if (!isXmlEditVisible && xmlPanelCollapsed) {
        toggleXmlPanel(); // 格納状態をリセット (次回表示時に展開されるように)
    }

    // 4. 範囲選択モード専用UI要素の表示/非表示
    const isRangeSelectVisible = (newMode === EditMode.RANGE_SELECT);
    // 右ツールバー内の range-only クラスを持つ要素
    document.querySelectorAll('.range-only').forEach(el => {
        el.style.display = isRangeSelectVisible ? (el.tagName === 'HR' ? 'block' : 'flex') : 'none';
    });
    // 右下の十字キー
    const rangeDpad = document.getElementById('range-adjust-dpad');
    if (rangeDpad) rangeDpad.style.display = isRangeSelectVisible ? 'grid' : 'none';

    // 5. (オプション) 特定モードでのみ表示する他のUI要素があればここに追加
    // 例: ペイントモード時にカラーパレットを表示するなど
}


// --- 初期化関数 ---

/**
 * このモジュールが扱うUI要素のイベントリスナーを設定します。
 * uiInitializer.js から呼び出されます。
 * @param {object} appStateRef - アプリケーション状態オブジェクトへの参照。
 */
export function initializeUIInteractions(appStateRefParam) {
    console.log("[UI] UIインタラクション初期化中...");
    appState = appStateRefParam; // appStateへの参照を保持

    // --- DOM要素をキャッシュ ---
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
    // ★追加: アンドゥ・リドゥボタン
    const undoButton = document.querySelector('#right-toolbar [data-action="UNDO"]');
    const redoButton = document.querySelector('#right-toolbar [data-action="REDO"]');
    // ★追加: 範囲選択アクションボタン
    const copyButton = document.querySelector('#right-toolbar [data-action="COPY"]');
    const cutButton = document.querySelector('#right-toolbar [data-action="CUT"]');
    const pasteButton = document.querySelector('#right-toolbar [data-action="PASTE"]');
    const clearClipboardButton = document.querySelector('#right-toolbar [data-action="CLEAR_CLIPBOARD"]');
    // ★追加: 十字キーボタン
    const dpadButtons = document.querySelectorAll('#range-adjust-dpad button');


    // --- イベントリスナーを設定 ---
    fullscreenButton?.addEventListener('click', toggleFullScreen);
    toggleStickButton?.addEventListener('click', toggleStickVisibility);
    toggleXmlPanelButton?.addEventListener('click', toggleXmlPanel);
    toggleInventoryButton?.addEventListener('click', () => toggleInventory());
    inventoryOverlay?.addEventListener('click', () => toggleInventory(false));
    batterySaveButton?.addEventListener('click', cycleFpsLimit);

    // モード切替ボタン
    modeButtons?.forEach(button => {
        button.addEventListener('click', () => {
            const modeToSet = button.dataset.mode;
            if (modeToSet && Object.values(EditMode).includes(modeToSet)) {
                setEditMode(modeToSet); // 状態変更をトリガー
            }
        });
    });

    // ファイル読み込み (input要素の変更を監視)
    fileInputMain?.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file && appState) {
            appState.selectedFile = file; // 選択ファイルを状態に保持
            console.log(`[UI] ファイル選択: ${file.name}`);
            handleLoadButtonClick(appState); // 読み込み処理を呼び出し
            event.target.value = null; // 同じファイルを選択できるようにリセット
        }
    });
    // ラベルクリックでinputをトリガーするのはHTMLの標準動作

    // ファイル保存ボタン
    saveButton?.addEventListener('click', () => {
        if (appState) handleSaveButtonClick(appState);
    });

    // TODO: アンドゥ/リドゥボタンにリスナーを設定 (Phase 3.6)
    // undoButton?.addEventListener('click', () => undo());
    // redoButton?.addEventListener('click', () => redo());

    // TODO: 範囲選択アクションボタンにリスナーを設定 (Phase 3.5)
    // copyButton?.addEventListener('click', () => copySelectionToClipboard(appState));
    // cutButton?.addEventListener('click', () => cutSelectionToClipboard(appState));
    // pasteButton?.addEventListener('click', () => pasteFromClipboard(appState));
    // clearClipboardButton?.addEventListener('click', () => clearClipboardData());

    // TODO: 十字キーボタンにリスナーを設定 (Phase 3.5)
    // dpadButtons.forEach(button => button.addEventListener('click', () => handleDpadClick(button.id)));


    // --- UIの初期状態を設定 ---
    cameraStick?.classList.toggle('hidden', !stickVisible);
    toggleStickButton?.classList.toggle('active', stickVisible);
    xmlEditPanel?.classList.toggle('collapsed', xmlPanelCollapsed);
    if(batterySaveButton){ // FPSボタン初期表示
         batterySaveButton.textContent = '∞';
         batterySaveButton.className = 'toolbar-button fps-unlimited';
    }
    // 初期モードに対するUI状態は main.js の init の最後で handleModeChangeUI を呼ぶことで設定される

    console.log("[UI] UIインタラクション初期化完了。");
}