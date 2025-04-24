/**
 * @fileoverview UI要素の基本的なインタラクション（トグル表示、モード切替、各種ボタン操作など）を管理します。
 * main.js から初期化され、各UI要素にイベントリスナーを設定します。
 * ペイントモード実装に伴い、上ツールバー、左ツールバー（ペイント用）の構成に対応しました。
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
// import { setCurrentPaintTool, setCurrentColor } from '../state/paintState.js'; // ★ 将来的に paintState からインポート

// --- モジュール内変数 ---

/** @type {object | null} アプリケーション状態オブジェクトへの参照 */
let appState = null;
/** @type {boolean} インベントリパネルが表示されているか */
let inventoryVisible = false;
/** @type {boolean} XML編集パネルが格納されているか */
let xmlPanelCollapsed = false;
/** @type {boolean} カメラ移動スティックが表示されているか */
let stickVisible = true;
/** @type {number} 現在のFPS制限モード (0: Unlimited, 1: 60fps, 2: 30fps) */
let currentFpsLimitMode = 0;
/** @type {boolean} RGBスライダーが表示されているか */
let rgbSlidersVisible = false;

// --- DOM要素キャッシュ (初期化時に設定) ---
// 各ツールバーとパネル
let topToolbar = null, leftToolbar = null, rightToolbar = null, bottomToolbar = null;
let inventoryPanel = null, inventoryOverlay = null, xmlEditPanel = null, toggleXmlPanelButton = null;
// 上ツールバー要素
let modeButtons = null, toggleStickButton = null;
// 左ツールバー要素 (ペイント)
let paintToolButtons = null, colorPaletteContainer = null, colorSwatches = null;
let toggleRgbSlidersButton = null, rgbSlidersContainer = null;
let sliderR = null, sliderG = null, sliderB = null, valueR = null, valueG = null, valueB = null, colorPreview = null;
// 右ツールバー要素
let copyButton = null, cutButton = null, pasteButton = null, clearClipboardButton = null;
let undoButton = null, redoButton = null;
const symmetryButtons = { x: null, y: null, z: null };
let loadButtonLabel = null, fileInputMain = null, saveButton = null, fullscreenButton = null;
// 下ツールバー要素
let toggleInventoryButton = null;
// その他UI要素
let cameraStick = null, batterySaveButton = null;
const dpadButtons = { up: null, down: null, left: null, right: null };


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
 * @private
 */
function toggleStickVisibility() {
     stickVisible = !stickVisible;
     // CSSクラスで表示/非表示を制御
     cameraStick?.classList.toggle('hidden', !stickVisible);
     // ボタンのアクティブ状態を切り替え
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
     // CSSクラスで格納/展開状態を制御
     xmlEditPanel?.classList.toggle('collapsed', xmlPanelCollapsed);
     console.log(`[UI] XMLパネル ${xmlPanelCollapsed ? '格納' : '展開'}`);
 }

/**
 * インベントリパネルの表示/非表示を切り替えます。
 * @param {boolean | null} [forceState=null] - 強制的に設定する状態 (true:表示, false:非表示)。nullならトグル。
 * @private
 */
function toggleInventory(forceState = null) {
    const shouldBeVisible = forceState !== null ? forceState : !inventoryVisible;
    // 現在の状態と同じなら何もしない
    if (shouldBeVisible === inventoryVisible) return;

    // CSSクラスで表示/非表示、関連要素の状態を制御
    inventoryPanel?.classList.toggle('visible', shouldBeVisible);
    inventoryOverlay?.classList.toggle('visible', shouldBeVisible);
    bottomToolbar?.classList.toggle('lowered', shouldBeVisible);
    inventoryVisible = shouldBeVisible;
    console.log(`[UI] インベントリ表示: ${inventoryVisible}`);

    // インベントリ表示中はカメラコントロールを無効化 (スティック操作中などを考慮する必要があるかも)
    if (appState?.controls) {
         const isStickDragging = false; // TODO: スティックドラッグ状態を取得する手段が必要
         appState.controls.enabled = !inventoryVisible && !isStickDragging;
    }
}

/**
 * FPS制限モードを順次切り替え (∞ -> 60 -> 30 -> ∞)、UI表示と状態を更新します。
 * @private
 */
function cycleFpsLimit() {
    currentFpsLimitMode = (currentFpsLimitMode + 1) % 3; // 0, 1, 2 のサイクル
    let buttonText = '∞';
    let buttonClass = 'fps-unlimited';
    let buttonActive = false;

    // モードに応じてボタンの表示を設定
    switch (currentFpsLimitMode) {
        case 1: buttonText = '60'; buttonClass = 'fps-60'; buttonActive = true; break;
        case 2: buttonText = '30'; buttonClass = 'fps-30'; buttonActive = true; break;
    }
    // main.js の関数を呼び出して実際の制限を設定
    setFpsLimitMode(currentFpsLimitMode);
    // ボタンのテキストとCSSクラスを更新
    if (batterySaveButton) {
        batterySaveButton.textContent = buttonText;
        // クラス名を一度リセットしてから新しいクラスを設定
        batterySaveButton.className = 'toolbar-button'; // 基本クラスのみに
        batterySaveButton.classList.add(buttonClass); // モード別クラス追加
        batterySaveButton.classList.toggle('active', buttonActive); // アクティブ状態設定
    }
    console.log(`[UI] FPS Limit cycled to mode: ${currentFpsLimitMode} (${buttonText} FPS)`);
}


/**
 * RGBスライダーコンテナの表示/非表示を切り替えます。
 * @private
 */
function toggleRgbSliders() {
    rgbSlidersVisible = !rgbSlidersVisible;
    if (rgbSlidersContainer) {
        rgbSlidersContainer.style.display = rgbSlidersVisible ? 'flex' : 'none';
    }
    // 展開ボタンのアクティブ状態を更新
    toggleRgbSlidersButton?.classList.toggle('active', rgbSlidersVisible);
    console.log(`[UI] RGBスライダー表示: ${rgbSlidersVisible}`);
}

/**
 * RGBスライダーの値に基づいて色プレビューと状態を更新します。
 * @private
 */
function updateColorFromSliders() {
    // 必要なDOM要素がなければ処理中断
    if (!sliderR || !sliderG || !sliderB || !valueR || !valueG || !valueB || !colorPreview) return;

    // スライダーからRGB値を取得
    const r = parseInt(sliderR.value, 10);
    const g = parseInt(sliderG.value, 10);
    const b = parseInt(sliderB.value, 10);

    // 値表示を更新
    valueR.textContent = r;
    valueG.textContent = g;
    valueB.textContent = b;

    // 16進数カラーコードを生成し、プレビュー要素の背景色を設定
    const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    colorPreview.style.backgroundColor = hexColor;

    // ★仮実装: 選択された色をアプリケーションの状態に設定 (将来的に paintState.js へ)
    console.log(`[UI] Slider Color Selected: ${hexColor.toUpperCase()}`);
    // setCurrentColor(hexColor.toUpperCase()); // paintState の関数を呼び出す想定

    // スライダー操作時はカラーパレットの選択を解除する
    colorSwatches?.forEach(sw => sw.classList.remove('active'));
}

/**
 * 指定された16進数カラーコードでRGBスライダーとプレビュー表示を更新します。
 * @param {string} hexColor - "#RRGGBB" 形式のカラーコード。
 * @private
 */
function updateSlidersFromColor(hexColor) {
    // 必要なDOM要素と有効なカラーコードがなければ処理中断
    if (!sliderR || !sliderG || !sliderB || !valueR || !valueG || !valueB || !colorPreview || !hexColor || !hexColor.startsWith('#') || hexColor.length !== 7) {
        console.warn("[UI] スライダー更新のための要素または色コードが無効です:", hexColor);
        return;
    }
    try {
        // 16進数コードからRGB値をパース
        const r = parseInt(hexColor.substring(1, 3), 16);
        const g = parseInt(hexColor.substring(3, 5), 16);
        const b = parseInt(hexColor.substring(5, 7), 16);

        // スライダーの位置と値表示を更新
        sliderR.value = r; valueR.textContent = r;
        sliderG.value = g; valueG.textContent = g;
        sliderB.value = b; valueB.textContent = b;

        // 色プレビューを更新
        colorPreview.style.backgroundColor = hexColor;
    } catch (e) {
        console.error("[UI] スライダー更新のための色コードパースエラー:", hexColor, e);
    }
}


/**
 * 編集モード変更時にUI要素（モードボタン、関連パネル表示など）の状態を更新します。
 * @param {EditMode} newMode - 新しい編集モード。
 */
export function handleModeChangeUI(newMode) {
    console.log(`[UI] モード変更UI更新 -> ${newMode}`);

    // --- モードボタンのアクティブ状態更新 ---
    // 上ツールバー内のモードボタンについて、data-mode が新しいモードと一致するかで active クラスを設定
    modeButtons?.forEach(button => {
        button.classList.toggle('active', button.dataset.mode === newMode);
    });

    // --- 左上モードインジケータのテキスト更新 ---
    updateModeIndicator(newMode);

    // --- XML編集パネルの表示制御 ---
    const isXmlEditVisible = (newMode === EditMode.XML_EDIT);
    if (xmlEditPanel) xmlEditPanel.style.display = isXmlEditVisible ? 'block' : 'none';
    // XML編集モードになった際にパネルが格納されていたら展開する
    if (isXmlEditVisible && xmlPanelCollapsed) {
        toggleXmlPanel(); // 格納状態をトグルして展開
    }

    // --- 範囲選択モード専用UIの表示制御 ---
    const isRangeSelectVisible = (newMode === EditMode.RANGE_SELECT);
    // '.range-only' クラスを持つ要素の表示/非表示を切り替え
    document.querySelectorAll('.range-only').forEach(el => {
        el.style.display = isRangeSelectVisible ? (el.tagName === 'HR' ? 'block' : 'flex') : 'none';
    });
    // 十字キーの表示/非表示を切り替え
    const rangeDpad = document.getElementById('range-adjust-dpad');
    if (rangeDpad) rangeDpad.style.display = isRangeSelectVisible ? 'grid' : 'none';

    // --- ペイントモード専用UIの表示制御 (左ツールバー) ---
    const isPaintVisible = (newMode === EditMode.PAINT);
    if (leftToolbar) leftToolbar.style.display = isPaintVisible ? 'flex' : 'none';
    // ペイントモードでなければRGBスライダーも隠す
    if (!isPaintVisible && rgbSlidersVisible) {
        toggleRgbSliders();
    }
}


/**
 * アンドゥ/リドゥボタンの有効/無効状態を更新します。
 * @param {boolean} canUndo - アンドゥ可能か。
 * @param {boolean} canRedo - リドゥ可能か。
 * @private
 */
function updateUndoRedoButtons(canUndo, canRedo) {
    // disabled 属性とスタイル (opacity, cursor) を更新
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
 * @param {object} appStateRefParam - アプリケーション状態オブジェクトへの参照。
 */
export function initializeUIInteractions(appStateRefParam) {
    console.log("[UI] UIインタラクション初期化中...");
    appState = appStateRefParam;

    // --- DOM要素を取得 ---
    // (取得ロジックは前の回答と同じなので省略)
    topToolbar = document.getElementById('top-toolbar');
    modeButtons = topToolbar?.querySelectorAll('.mode-button');
    toggleStickButton = document.getElementById('toggle-stick-button');
    leftToolbar = document.getElementById('left-toolbar');
    paintToolButtons = leftToolbar?.querySelectorAll('.paint-tool-button');
    colorPaletteContainer = document.getElementById('color-palette-container');
    colorSwatches = colorPaletteContainer?.querySelectorAll('.color-swatch');
    toggleRgbSlidersButton = document.getElementById('toggle-rgb-sliders-button');
    rgbSlidersContainer = document.getElementById('rgb-sliders-container');
    sliderR = document.getElementById('slider-r'); valueR = document.getElementById('value-r');
    sliderG = document.getElementById('slider-g'); valueG = document.getElementById('value-g');
    sliderB = document.getElementById('slider-b'); valueB = document.getElementById('value-b');
    colorPreview = document.getElementById('color-preview');
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
    fileInputMain = document.getElementById('file-input-main');
    saveButton = rightToolbar?.querySelector('[data-action="SAVE"]');
    fullscreenButton = rightToolbar?.querySelector('#fullscreen-button');
    bottomToolbar = document.getElementById('bottom-toolbar');
    toggleInventoryButton = document.getElementById('toggle-inventory-button');
    inventoryPanel = document.getElementById('inventory-panel');
    inventoryOverlay = document.getElementById('inventory-overlay');
    xmlEditPanel = document.getElementById('xml-edit-panel');
    toggleXmlPanelButton = document.getElementById('toggle-xml-panel');
    cameraStick = document.getElementById('camera-stick');
    batterySaveButton = document.getElementById('battery-save-button');
    dpadButtons.up = document.getElementById('dpad-up');
    dpadButtons.down = document.getElementById('dpad-down');
    dpadButtons.left = document.getElementById('dpad-left');
    dpadButtons.right = document.getElementById('dpad-right');

    // --- イベントリスナー設定 ---

    // フルスクリーン切替ボタン
    fullscreenButton?.addEventListener('click', toggleFullScreen);
    // スティック表示切替ボタン (上ツールバー)
    toggleStickButton?.addEventListener('click', toggleStickVisibility);
    // XMLパネル開閉ボタン
    toggleXmlPanelButton?.addEventListener('click', toggleXmlPanel);
    // インベントリ開閉ボタンとオーバーレイ
    toggleInventoryButton?.addEventListener('click', () => toggleInventory());
    inventoryOverlay?.addEventListener('click', () => toggleInventory(false));
    // FPS制限切替ボタン
    batterySaveButton?.addEventListener('click', cycleFpsLimit);

    // モード切替ボタン (上ツールバー)
    modeButtons?.forEach(button => {
        button.addEventListener('click', () => {
            const modeToSet = button.dataset.mode; // data-mode属性からモード名取得
            if (modeToSet && Object.values(EditMode).includes(modeToSet)) {
                setEditMode(modeToSet); // editMode.js の状態変更関数を呼び出す
            }
        });
    });

    // ペイントツール選択ボタン (左ツールバー)
    paintToolButtons?.forEach(button => {
        button.addEventListener('click', () => {
            const tool = button.dataset.paintTool; // data-paint-tool属性からツール名取得
            // 他のツールボタンのアクティブ状態を解除
            paintToolButtons.forEach(btn => btn.classList.remove('active'));
            // クリックされたボタンをアクティブにする
            button.classList.add('active');
            console.log(`[UI] Paint Tool Selected: ${tool}`);
            // ★仮実装: 将来的に paintState.js の状態更新関数を呼び出す
            // setCurrentPaintTool(tool);
        });
    });

    // カラーパレットの色ボタン (左ツールバー)
    colorSwatches?.forEach(swatch => {
        swatch.addEventListener('click', () => {
            const color = swatch.dataset.color; // data-color属性から色コード(例: "C2C3C7")取得
            // 他の色ボタンのアクティブ状態を解除
            colorSwatches.forEach(sw => sw.classList.remove('active'));
            // クリックされたボタンをアクティブにする
            swatch.classList.add('active');
            console.log(`[UI] Palette Color Selected: #${color}`);
            // ★仮実装: 将来的に paintState.js の状態更新関数を呼び出す
            // setCurrentColor(`#${color}`);
            // 選択された色でRGBスライダーも更新
            updateSlidersFromColor(`#${color}`);
        });
    });

    // RGBスライダー展開ボタン (左ツールバー)
    toggleRgbSlidersButton?.addEventListener('click', toggleRgbSliders);

    // RGBスライダー操作 (左ツールバー)
    const rgbSliders = [sliderR, sliderG, sliderB];
    rgbSliders.forEach(slider => {
        // 'input' イベントはドラッグ中も連続して発火する
        slider?.addEventListener('input', updateColorFromSliders);
    });

    // ファイル読込 (右ツールバー)
    fileInputMain?.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file && appState) {
            appState.selectedFile = file;
            handleLoadButtonClick(appState); // fileHandlers.js の関数を呼び出す
            event.target.value = null; // 同じファイルを選択できるように値をリセット
        }
    });
    // ファイル保存 (右ツールバー)
    saveButton?.addEventListener('click', () => {
        if (appState) {
            handleSaveButtonClick(appState); // fileHandlers.js の関数を呼び出す
        }
    });

    // クリップボード操作 (右ツールバー)
    copyButton?.addEventListener('click', () => { if(appState) copySelectionToClipboard(appState); });
    cutButton?.addEventListener('click', () => { if(appState) cutSelectionToClipboard(appState); });
    pasteButton?.addEventListener('click', () => { if(appState && hasClipboard()) pasteFromClipboard(appState); });
    clearClipboardButton?.addEventListener('click', () => clearClipboardData());

    // アンドゥ・リドゥ (右ツールバー)
    undoButton?.addEventListener('click', () => undo());
    redoButton?.addEventListener('click', () => redo());

    // 対称編集 (右ツールバー)
    symmetryButtons.x?.addEventListener('click', () => toggleSymmetryAxis('x'));
    symmetryButtons.y?.addEventListener('click', () => toggleSymmetryAxis('y'));
    symmetryButtons.z?.addEventListener('click', () => toggleSymmetryAxis('z'));

    // 十字キー (範囲選択モード時)
    dpadButtons.up?.addEventListener('click', () => { if(appState) adjustSelectionRange('up', appState.scene); });
    dpadButtons.down?.addEventListener('click', () => { if(appState) adjustSelectionRange('down', appState.scene); });
    dpadButtons.left?.addEventListener('click', () => { if(appState) adjustSelectionRange('left', appState.scene); });
    dpadButtons.right?.addEventListener('click', () => { if(appState) adjustSelectionRange('right', appState.scene); });


    // --- アプリケーション内部状態変化イベントのリスナー ---

    // クリップボード状態変化時
    document.addEventListener('clipboardstatechange', (event) => {
        // ペーストボタンの有効/無効を切り替え
        if (pasteButton) {
            const enabled = event.detail.hasData;
            pasteButton.disabled = !enabled;
            pasteButton.style.opacity = enabled ? 1 : 0.5;
            pasteButton.style.cursor = enabled ? 'pointer' : 'not-allowed';
        }
    });
    // 履歴状態変化時
    document.addEventListener('historystatuschange', (event) => {
        // アンドゥ/リドゥボタンの有効/無効を切り替え
        updateUndoRedoButtons(event.detail.canUndo, event.detail.canRedo);
    });
    // 対称編集状態変化時
    document.addEventListener('symmetrystatechange', (event) => {
        // 対称編集ボタンのアクティブ状態を更新
        updateSymmetryButtons(event.detail);
    });


    // --- 初期状態設定 ---
    // スティック表示状態
    cameraStick?.classList.toggle('hidden', !stickVisible);
    toggleStickButton?.classList.toggle('active', stickVisible);
    // XMLパネル格納状態
    xmlEditPanel?.classList.toggle('collapsed', xmlPanelCollapsed);
    // FPS制限ボタン初期表示
    if(batterySaveButton){ batterySaveButton.textContent = '∞'; batterySaveButton.className = 'toolbar-button fps-unlimited'; }
    // ペーストボタン初期状態
    if (pasteButton) { pasteButton.disabled = !hasClipboard(); pasteButton.style.opacity = hasClipboard() ? 1 : 0.5; pasteButton.style.cursor = hasClipboard() ? 'pointer' : 'not-allowed'; }
    // アンドゥ/リドゥボタン初期状態 (両方無効)
    updateUndoRedoButtons(false, false);
    // 対称編集ボタン初期状態
    updateSymmetryButtons({ x: isSymmetryEnabled('x'), y: isSymmetryEnabled('y'), z: isSymmetryEnabled('z') });
    // ペイントツール初期状態 (通常ツールをアクティブに)
    paintToolButtons?.forEach(button => { button.classList.toggle('active', button.dataset.paintTool === 'normal'); });
    // カラーパレット初期状態 (最初の色をアクティブにし、スライダーも同期)
    if (colorSwatches && colorSwatches.length > 0) {
        colorSwatches[0].classList.add('active');
        const initialColor = colorSwatches[0].dataset.color ? `#${colorSwatches[0].dataset.color}` : '#C2C3C7'; // data-colorが見つからなければデフォルト
        updateSlidersFromColor(initialColor);
    }
    // RGBスライダーは初期非表示
    if (rgbSlidersContainer) rgbSlidersContainer.style.display = 'none';
    // 左ツールバー自体は初期非表示 (ペイントモードになったら表示される)
    if (leftToolbar) leftToolbar.style.display = 'none';


    console.log("[UI] UIインタラクション初期化完了。");
}