/**
 * @fileoverview Stormworks Vehicle Editor アプリケーションのエントリーポイント。
 * Three.js 環境のセットアップ、主要モジュールの初期化、
 * アニメーションループ (FPS制御含む) の実行、カスタムイベントの基本処理を担当します。
 * 各モードの詳細なインタラクションやUI固有の処理は、他のハンドラ/UIモジュールに委譲します。
 */

// --- Three.js 本体と基本的なアドオン ---
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; // OrbitControls は main で保持する

// --- セットアップ関連モジュール ---
import { setupSceneEnvironment, handleWindowResize } from './setup/sceneSetup.js';
import { setupOrbitControls } from './setup/controlsSetup.js';
import { setupHelpers } from './setup/helpersSetup.js';

// --- オブジェクト・データ関連モジュール ---
import { createOriginBlockData } from './objects/initialObjects.js';
import { BlockData } from './data/blockData.js'; // 型情報として必要になる場合がある

// --- 状態管理モジュール ---
import { setupHistoryManager } from './state/historyManager.js';
import { getCurrentMode, EditMode } from './state/editMode.js';
import { initializeSelectionState } from './interactions/selectionState.js'; // クリック/範囲選択状態
// import { initializeClipboardState } from './state/clipboardState.js'; // クリップボードは自己初期化

// --- UI関連モジュール ---
import { updateModeIndicator } from './ui/modeIndicator.js'; // モード表示更新
// import { setupInventoryUI, updatePlacementIndicator } from './ui/inventoryUI.js'; // 古いUIは削除
import { updateXmlEditUI, hideXmlEditPanel, showXmlEditPanel } from './ui/xmlEditUI.js'; // XMLパネル制御
import { initializeAllUI } from './ui/uiInitializer.js'; // ★ UI初期化の統括関数

// --- レンダリング関連モジュール ---
import { setRenderMode, clearBlocks, renderBlocks } from './rendering/blockRenderer.js'; // ブロック描画制御

// --- イベント・インタラクション関連モジュール ---
import { initializeEventListeners, setApplicationState } from './events/eventManager.js'; // DOMイベント管理
import { initializeCameraStick, updateCameraPosition } from './interactions/cameraStickHandler.js'; // カメラ移動スティック

// === グローバルアプリケーション状態 ===
/**
 * アプリケーション全体で共有される主要なオブジェクトや状態を格納するオブジェクト。
 * 各モジュールはこのオブジェクトへの参照を通して必要な情報にアクセスできます。
 * @type {{
 * scene: THREE.Scene | null,
 * camera: THREE.PerspectiveCamera | null,
 * renderer: THREE.WebGLRenderer | null,
 * controls: OrbitControls | null,
 * loadedBlocks: BlockData[],
 * selectedFile: File | null,
 * canvas: HTMLCanvasElement | null
 * }}
 */
const appState = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    loadedBlocks: [],
    selectedFile: null, // ファイル読み込み用
    canvas: null,       // レンダラーのDOM要素
};
// ==================================

// === FPS制御用変数 ===
/** @type {THREE.Clock} 時間計測用 */
const clock = new THREE.Clock();
/** @type {number} FPS表示更新の最終時刻 (ミリ秒) */
let lastFpsUpdateTime = 0;
/** @type {number} FPS表示更新間隔 (ミリ秒) */
const fpsUpdateInterval = 500; // 0.5秒ごとに更新
/** @type {number} 目標フレーム間隔 (ミリ秒、0は無制限) */
let targetFrameInterval = 0;
/** @type {number} 前フレームの描画時刻 (ミリ秒) */
let lastFrameTime = 0;
/** @type {HTMLElement | null} FPS表示用DOM要素への参照 */
let fpsDisplayElement = null;

// ==================================
// --- アプリケーション初期化 ---
// ==================================

/**
 * アプリケーションの初期化処理。各種モジュールをセットアップし、
 * アニメーションループを開始します。
 */
function init() {
    console.log("[Main] アプリケーションの初期化を開始します...");

    // --- 1. Three.js 基本環境設定 ---
    // シーン、カメラ、レンダラーを作成・設定
    try {
        const sceneEnv = setupSceneEnvironment();
        appState.scene = sceneEnv.scene;
        appState.camera = sceneEnv.camera;
        appState.renderer = sceneEnv.renderer;
        appState.canvas = sceneEnv.renderer.domElement; // Canvas参照を保持
    } catch (error) {
        console.error("[Main] Three.js 環境の初期化に失敗しました:", error);
        alert("アプリケーションの初期化に失敗しました。ページをリロードしてください。");
        return; // 初期化中断
    }

    // --- 2. カメラコントロール設定 ---
    appState.controls = setupOrbitControls(appState.camera, appState.renderer.domElement);

    // --- 3. ヘルパー設定 ---
    // グリッド線と軸を表示
    setupHelpers(appState.scene);

    // --- 4. 初期オブジェクト生成 ---
    // 原点に基準となるブロックを配置
    const originBlockData = createOriginBlockData(appState.scene);
    appState.loadedBlocks.push(originBlockData);

    // --- 5. 状態管理モジュール初期化 ---
    setupHistoryManager(appState.scene, appState.loadedBlocks); // アンドゥ/リドゥ
    initializeSelectionState(appState.scene); // 選択状態 (クリック/範囲)
    // initializeClipboardState(); // クリップボード状態 (自己初期化)

    // --- 6. UIモジュール初期化 ---
    // UI要素のイベントリスナー設定や初期表示を行う統括関数を呼び出し
    initializeAllUI(appState);
    // カメラ移動スティックの初期化 (UIとは別管理でもOK)
    initializeCameraStick(appState);
    // FPS表示用要素を取得
    fpsDisplayElement = document.getElementById('fps-display');
    // モードインジケータの初期表示
    updateModeIndicator(getCurrentMode());

    // --- 7. イベントリスナー設定 ---
    // 各モジュールが appState を参照できるように設定
    setApplicationState(appState);
    // DOMイベントリスナー（ファイル、マウス、キーボードなど）を初期化
    initializeEventListeners();
    // アプリ内カスタムイベントリスナーを設定
    setupCustomEventListeners();

    // --- 8. ウィンドウリサイズ対応 ---
    window.addEventListener('resize', () => handleWindowResize(appState.camera, appState.renderer));

    // --- 9. アニメーションループ開始 ---
    animate();

    console.log("[Main] アプリケーションの初期化が完了しました。");
}

// ==================================
// --- アニメーションループ ---
// ==================================

/**
 * アニメーションループ関数。毎フレーム呼び出されます。
 * FPS制御、各種状態更新、レンダリングを行います。
 * @param {DOMHighResTimeStamp} currentTime - requestAnimationFrame から渡される高精度タイムスタンプ。
 */
function animate(currentTime) {
    // 次のフレーム描画を要求
    requestAnimationFrame(animate);

    // --- FPS制限処理 ---
    if (targetFrameInterval > 0) { // 制限が有効な場合
        const elapsed = currentTime - lastFrameTime; // 前回描画からの経過時間
        if (elapsed < targetFrameInterval) { // 経過時間が目標間隔より短い場合
            return; // このフレームは描画をスキップ
        }
        lastFrameTime = currentTime - (elapsed % targetFrameInterval); // 次の基準時刻を計算
    } else {
        lastFrameTime = currentTime; // 制限なしの場合は単純に現在時刻を記録
    }

    // --- FPS計算と表示 (一定間隔で更新) ---
    const delta = clock.getDelta(); // 前フレームからの経過時間(秒)
    if (fpsDisplayElement && currentTime - lastFpsUpdateTime > fpsUpdateInterval) {
        const currentFps = delta > 0 ? (1.0 / delta) : 0;
        fpsDisplayElement.textContent = `FPS: ${Math.round(currentFps)}`;
        lastFpsUpdateTime = currentTime;
    }

    // --- コンポーネント更新 ---
    updateCameraPosition(); // カメラ移動スティックによる位置更新
    appState.controls?.update(); // OrbitControls 更新 (慣性など)

    // --- レンダリング ---
    if (appState.renderer && appState.scene && appState.camera) {
        appState.renderer.render(appState.scene, appState.camera);
    }
}

// ==================================
// --- カスタムイベント処理 ---
// ==================================

/**
 * アプリケーション内で発行されるカスタムイベントに対するリスナーを設定します。
 * モジュール間の疎結合な連携を担います。
 */
function setupCustomEventListeners() {
    console.log("[Main] カスタムイベントリスナーを設定します...");

    // --- 編集モード変更イベント ---
    document.addEventListener('editmodechange', (event) => {
        const { newMode } = event.detail;
        console.log(`[Main][Event] 'editmodechange' 受信 - 新モード: ${newMode}`);

        // 1. ブロックのレンダリングモードを切り替え
        setRenderMode(newMode, appState.loadedBlocks, appState.scene);

        // 2. XML編集パネルの表示/非表示
        const xmlEditPanelElement = document.getElementById('xml-edit-panel');
        if (xmlEditPanelElement) {
            xmlEditPanelElement.style.display = (newMode === EditMode.XML_EDIT) ? 'block' : 'none';
            // 必要なら展開状態も制御 (uiInteractions と連携)
            // if (newMode === EditMode.XML_EDIT && xmlPanelIsCollapsed()) { toggleXmlPanel(); }
        }

        // 3. 範囲選択モード用のUI要素の表示/非表示
        const isRangeMode = (newMode === EditMode.RANGE_SELECT);
        document.querySelectorAll('.range-only').forEach(el => {
            el.style.display = isRangeMode ? (el.tagName === 'HR' ? 'block' : 'flex') : 'none';
        });
        const rangeDpad = document.getElementById('range-adjust-dpad');
        if (rangeDpad) {
            rangeDpad.style.display = isRangeMode ? 'grid' : 'none';
        }

        // 4. 左ツールバーのモードボタンのアクティブ状態を更新
        document.querySelectorAll('#left-toolbar .mode-button').forEach(button => {
             button.classList.toggle('active', button.dataset.mode === newMode);
         });

        // 5. モードインジケータUIを更新
         updateModeIndicator(newMode);
    });

    // --- 選択状態変更イベント ---
    document.addEventListener('selectionchanged', () => {
        // console.log("[Main][Event] 'selectionchanged' 受信"); // ログが多すぎる場合はコメントアウト
        // XML編集モードの場合のみ、パネルの表示を更新
        if (getCurrentMode() === EditMode.XML_EDIT) {
            updateXmlEditUI();
        }
    });

    // --- アンドゥ/リドゥ実行後イベント ---
    // (historyManagerが発行)
    document.addEventListener('historyundone', handleHistoryChangeForUI);
    document.addEventListener('historyredone', handleHistoryChangeForUI);

    // --- ブロック変形完了後イベント ---
    // (dragTransformHandler が発行)
    document.addEventListener('blocktransformupdated', handleHistoryChangeForUI);

    // --- ブロック変更イベント ---
    // (clipboardHandler (カット/ペースト時) などが発行)
    document.addEventListener('blocksChanged', () => {
         console.log("[Main][Event] 'blocksChanged' 受信、シーン再描画と情報表示更新を検討");
         // 必要ならここで明示的に renderBlocks を呼ぶ (現状は historyManager の Undo/Redo 後に呼ばれる)
         // renderBlocks(appState.scene, appState.loadedBlocks);
         // TODO: 左上の情報表示 (質量/コスト/サイズ) を更新する関数を呼ぶ
         // updateInfoDisplay();
     });

    // --- クリップボード状態変更イベント ---
    // (clipboardState が発行)
    // UI要素 (ペーストボタンの活性化など) は selectionState や uiInitializer でリッスンして制御
    document.addEventListener('clipboardstatechange', (event) => {
        const hasData = event.detail.hasData;
        console.log(`[Main][Event] 'clipboardstatechange' 受信 - データあり: ${hasData}`);
        // 必要ならペーストボタンなどの活性状態をここで制御する
        const pasteButton = document.querySelector('#right-toolbar [data-action="PASTE"]');
        if(pasteButton) pasteButton.disabled = !hasData; // 例: データがなければ非活性化
    });


    console.log("[Main] カスタムイベントリスナーの設定完了。");
}

/**
 * 履歴変更やブロック変形完了時に呼び出され、関連するUIを更新するハンドラ。
 * @param {CustomEvent} event - イベントオブジェクト。
 * @private
 */
function handleHistoryChangeForUI(event) {
    console.log(`[Main] 履歴変更/変形完了 (${event.type}) を処理します。`);
    // アンドゥ/リドゥ後は状態が大きく変わる可能性があるため、
    // XML編集モードであればUIを更新する
    if (getCurrentMode() === EditMode.XML_EDIT) {
        updateXmlEditUI();
    }
    // TODO: 左上の情報表示 (質量/コスト/サイズ) を更新する関数を呼ぶ
    // updateInfoDisplay();
}

// ==================================
// --- グローバル関数 (外部モジュールから使用) ---
// ==================================

/**
 * FPS制限モードを設定する関数 (uiInteractionsから呼ばれる)。
 * @param {number} mode - 0: Unlimited, 1: 60 FPS, 2: 30 FPS。
 */
export function setFpsLimitMode(mode) {
    switch (mode) {
        case 0: targetFrameInterval = 0; break;
        case 1: targetFrameInterval = 1000 / 60; break;
        case 2: targetFrameInterval = 1000 / 30; break;
        default: targetFrameInterval = 0;
    }
    lastFrameTime = performance.now(); // 制限変更時にタイミングリセット
    console.log(`[Main] FPS Limit interval set to: ${targetFrameInterval.toFixed(2)} ms`);
}

// --- アプリケーション開始 ---
init();