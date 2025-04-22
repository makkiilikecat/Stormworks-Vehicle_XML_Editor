/**
 * @fileoverview Stormworks XML Editor アプリケーションのエントリーポイント。
 * Three.js 環境のセットアップ、主要モジュールの初期化、
 * アニメーションループ (FPS制御含む) の実行を担当します。
 */

// --- 各種モジュールのインポート ---
import * as THREE from 'three';
import { setupSceneEnvironment, handleWindowResize } from './setup/sceneSetup.js';
import { setupOrbitControls } from './setup/controlsSetup.js';
import { setupHelpers } from './setup/helpersSetup.js';
import { createOriginBlockData } from './objects/initialObjects.js';
import { setupHistoryManager } from './state/historyManager.js';
// ★ 修正: getCurrentMode もインポートしておく (初期UI設定用)
import { getCurrentMode, EditMode } from './state/editMode.js';
import { initializeEventListeners, setApplicationState } from './events/eventManager.js';
import { setRenderMode } from './rendering/blockRenderer.js';
// ★ 修正: uiInitializer と、そこから呼ばれないUI関連関数をインポート
import { initializeAllUI } from './ui/uiInitializer.js';
import { handleModeChangeUI } from './ui/uiInteractions.js'; // <<< モード変更時のUI更新関数
import { updateXmlEditUI } from './ui/xmlEditUI.js'; // <<< selectionchanged で使う
import { initializeCameraStick, updateCameraPosition } from './interactions/cameraStickHandler.js';
import { initializeSelectionState } from './interactions/selectionState.js';
// import { clearSelection } from './interactions/selectionState.js'; // historyハンドラで使う

// === グローバルアプリケーション状態 ===
/**
 * アプリケーション全体で共有される主要なオブジェクトや状態を格納するオブジェクト。
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
    selectedFile: null,
    canvas: null,
};
// ==================================


// === FPS制御用変数 ===
const clock = new THREE.Clock();
let lastFpsUpdateTime = 0;
const fpsUpdateInterval = 500;
let targetFrameInterval = 0;
let lastFrameTime = 0;
let fpsDisplayElement = null;

/**
 * アプリケーションの初期化処理。
 */
function init() {
    console.log("[Main] アプリケーションの初期化を開始します...");

    // 1. Three.js 環境設定
    const sceneEnv = setupSceneEnvironment();
    appState.scene = sceneEnv.scene; appState.camera = sceneEnv.camera; appState.renderer = sceneEnv.renderer; appState.canvas = sceneEnv.renderer.domElement;
    // 2. カメラコントロール設定
    appState.controls = setupOrbitControls(appState.camera, appState.renderer.domElement);
    // 3. ヘルパー設定
    setupHelpers(appState.scene);
    // 4. 初期オブジェクト生成
    const originBlockData = createOriginBlockData(appState.scene);
    appState.loadedBlocks.push(originBlockData);
    // 5. 状態管理モジュール初期化
    setupHistoryManager(appState.scene, appState.loadedBlocks);
    initializeSelectionState(appState.scene); // ★ 呼び出し位置変更
    // initializeClipboardState(); // clipboardState内で自己初期化
    // 6. UIモジュール初期化
    initializeAllUI(appState); // ★ UI初期化を統括
    initializeCameraStick(appState); // スティック初期化
    // 7. イベントリスナー設定
    setApplicationState(appState);
    initializeEventListeners(); // DOMイベント
    setupCustomEventListeners(); // アプリ内カスタムイベント
    // 8. FPS表示要素取得
    fpsDisplayElement = document.getElementById('fps-display');
    // 9. 初期UI状態設定
    handleModeChangeUI(getCurrentMode()); // ★ 初期モード反映

    // 10. アニメーションループ開始
    animate();

    console.log("[Main] アプリケーションの初期化が完了しました。");
}

/** アニメーションループ */
function animate(currentTime) {
    requestAnimationFrame(animate);

    // FPS制限
    if (targetFrameInterval > 0) {
        const elapsed = currentTime - lastFrameTime;
        if (elapsed < targetFrameInterval) return;
        lastFrameTime = currentTime - (elapsed % targetFrameInterval);
    }

    // FPS計算・表示
    const delta = clock.getDelta();
    if (fpsDisplayElement && currentTime - lastFpsUpdateTime > fpsUpdateInterval) {
        const currentFps = delta > 0 ? (1.0 / delta) : 0;
        fpsDisplayElement.textContent = `FPS: ${Math.round(currentFps)}`;
        lastFpsUpdateTime = currentTime;
    }

    // 各コンポーネントの更新
    updateCameraPosition();
    appState.controls?.update();

    // レンダリング
    if (appState.renderer && appState.scene && appState.camera) {
        appState.renderer.render(appState.scene, appState.camera);
    }
}

/**
 * カスタムイベントリスナーを設定します。
 */
function setupCustomEventListeners() {
    console.log("[Main] カスタムイベントリスナーを設定します...");

    // 編集モード変更イベント
    document.addEventListener('editmodechange', (event) => {
        const { newMode } = event.detail;
        console.log(`[Main][Event] 'editmodechange' 受信 - 新モード: ${newMode}`);
        // 1. レンダリングモード更新
        setRenderMode(newMode, appState.loadedBlocks, appState.scene);
        // 2. UI要素の状態更新 (表示/非表示、アクティブ状態など)
        handleModeChangeUI(newMode); // uiInteractions モジュールの関数を呼び出す
        // 3. XML編集パネルの内容更新 (モードがXML_EDITの場合)
        if (newMode === EditMode.XML_EDIT) updateXmlEditUI();
    });

    // 選択状態変更イベント
    document.addEventListener('selectionchanged', () => {
        console.log("[Main][Event] 'selectionchanged' 受信");
        if (getCurrentMode() === EditMode.XML_EDIT) updateXmlEditUI();
        // TODO: 範囲選択モードでの情報表示更新など
    });

    // アンドゥ/リドゥ実行後イベント
    document.addEventListener('historyundone', handleHistoryChangeForUI);
    document.addEventListener('historyredone', handleHistoryChangeForUI);
    // ブロック変形完了イベント
    document.addEventListener('blocktransformupdated', handleHistoryChangeForUI);
    // ブロック変更イベント (カット/ペーストなど)
    document.addEventListener('blocksChanged', () => {
         console.log("[Main][Event] 'blocksChanged' 受信");
         // TODO: 必要なら情報表示更新など
         // updateInfoDisplay();
     });
    // クリップボード状態変更イベント (ギズモ表示制御は selectionState で行う)
    document.addEventListener('clipboardstatechange', (event) => {
        console.log(`[Main][Event] 'clipboardstatechange' 受信 - データあり: ${event.detail.hasData}`);
        // TODO: ペーストボタンの有効/無効制御など
    });

    console.log("[Main] カスタムイベントリスナーの設定完了。");
}

/** 履歴変更/変形完了時のUI更新ハンドラ */
function handleHistoryChangeForUI(event) {
     console.log(`[Main] 履歴変更/変形完了 (${event.type}) を処理します。`);
     if (getCurrentMode() === EditMode.XML_EDIT) updateXmlEditUI();
     // TODO: 必要なら情報表示更新
 }

/** FPS制限モードを設定する関数 (外部から呼ばれる) */
export function setFpsLimitMode(mode) {
    switch (mode) {
        case 0: targetFrameInterval = 0; break;
        case 1: targetFrameInterval = 1000 / 60; break;
        case 2: targetFrameInterval = 1000 / 30; break;
        default: targetFrameInterval = 0;
    }
    lastFrameTime = performance.now();
    console.log(`[Main] FPS Limit interval set to: ${targetFrameInterval.toFixed(2)} ms`);
}

// --- アプリケーション開始 ---
init();