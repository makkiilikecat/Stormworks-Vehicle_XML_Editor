/**
 * @fileoverview Stormworks XML Editor アプリケーションのエントリーポイント。
 * Three.js 環境のセットアップ、主要モジュールの初期化、
 * アニメーションループ (FPS制御含む) の実行、およびカスタムイベントの処理を担当します。
 */

// --- Three.js 本体 ---
import * as THREE from 'three';

// --- セットアップ関連モジュール ---
import { setupSceneEnvironment, handleWindowResize } from './setup/sceneSetup.js';
import { setupOrbitControls } from './setup/controlsSetup.js';
import { setupHelpers } from './setup/helpersSetup.js';

// --- オブジェクト・データ関連モジュール ---
import { createOriginBlockData } from './objects/initialObjects.js';
import { BlockData } from './data/blockData.js'; // BlockData クラス定義

// --- 状態管理モジュール ---
import { setupHistoryManager } from './state/historyManager.js';
import { getCurrentMode, EditMode } from './state/editMode.js';
import { initializeSelectionState } from './interactions/selectionState.js';
// clipboardState は keyboardInputHandler などで初期化・使用される

// --- UI関連モジュール ---
import { initializeAllUI } from './ui/uiInitializer.js'; // UI全体の初期化
import { handleModeChangeUI } from './ui/uiInteractions.js'; // モード変更時のUI更新
import { updateXmlEditUI } from './ui/xmlEditUI.js'; // XML編集パネルの更新
import { initializeInfoDisplay, updateInfoDisplay } from './ui/infoDisplayHandler.js'; // 情報表示の初期化・更新

// --- レンダリング関連モジュール ---
import { setRenderMode } from './rendering/blockRenderer.js'; // レンダリングモード切替

// --- イベント・ハンドラ関連モジュール ---
import { initializeEventListeners, setApplicationState } from './events/eventManager.js';
import { initializeCameraStick, updateCameraPosition } from './interactions/cameraStickHandler.js';

// === グローバルアプリケーション状態 ===
/**
 * アプリケーション全体で共有される主要なオブジェクトや状態を格納するオブジェクト。
 * 各モジュールはこのオブジェクトへの参照を通して必要な情報にアクセスできます。
 * @type {{
 * scene: THREE.Scene | null,
 * camera: THREE.PerspectiveCamera | null,
 * renderer: THREE.WebGLRenderer | null,
 * controls: import('three/addons/controls/OrbitControls.js').OrbitControls | null,
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
/** @type {THREE.Clock} 時間計測用クロック */
const clock = new THREE.Clock();
/** @type {number} FPS表示更新の最終時刻 (ミリ秒) */
let lastFpsUpdateTime = 0;
/** @type {number} FPS表示更新間隔 (ミリ秒) */
const fpsUpdateInterval = 500;
/** @type {number} 目標フレーム間隔 (ミリ秒、0は無制限) */
let targetFrameInterval = 0;
/** @type {number} 前フレームの描画時刻 (ミリ秒) */
let lastFrameTime = 0;
/** @type {HTMLElement | null} FPS表示用DOM要素への参照 */
let fpsDisplayElement = null;
// =======================

/**
 * アプリケーションの初期化処理。
 * 必要なモジュールをセットアップし、イベントリスナーを設定し、アニメーションループを開始します。
 */
function init() {
    console.log("[Main] アプリケーションの初期化を開始します...");

    // --- 1. Three.js 環境設定 (シーン, カメラ, レンダラー, ライト) ---
    const sceneEnv = setupSceneEnvironment();
    if (!sceneEnv || !sceneEnv.scene || !sceneEnv.camera || !sceneEnv.renderer) {
         console.error("[Main] シーン環境の初期化に失敗しました。処理を中断します。");
         return; // scene等がないと以降の処理ができない
    }
    appState.scene = sceneEnv.scene;
    appState.camera = sceneEnv.camera;
    appState.renderer = sceneEnv.renderer;
    appState.canvas = sceneEnv.renderer.domElement;

    // --- 2. カメラコントロール設定 (OrbitControls) ---
    appState.controls = setupOrbitControls(appState.camera, appState.renderer.domElement);

    // --- 3. ヘルパー設定 (グリッド線, 軸) ---
    setupHelpers(appState.scene);

    // --- 4. 初期オブジェクト生成 (原点ブロック) ---
    const originBlockData = createOriginBlockData(appState.scene);
    appState.loadedBlocks.push(originBlockData);

    // --- 5. 状態管理モジュール初期化 ---
    setupHistoryManager(appState.scene, appState.loadedBlocks); // アンドゥ/リドゥ履歴
    initializeSelectionState(appState.scene); // 選択状態管理 (範囲選択ボックス含む)
    // clipboardState は自身で初期化

    // --- 6. UIモジュール初期化 ---
    initializeAllUI(appState);        // ボタン、パネルなどのUI要素とイベントリスナー
    initializeCameraStick(appState);  // カメラ移動スティック
    initializeInfoDisplay();      // 左上情報表示エリア

    // --- 7. イベントリスナー設定 ---
    setApplicationState(appState);      // 他のモジュールがappStateを参照できるように設定
    initializeEventListeners();       // DOMイベント (ファイル選択など)
    setupCustomEventListeners();    // アプリケーション内カスタムイベント (モード変更、履歴変更など)

    // --- 8. 初期UI状態設定 ---
    handleModeChangeUI(getCurrentMode()); // 現在のモードに合わせてUIを初期表示
    updateInfoDisplay(appState.loadedBlocks); // 初期ブロック情報で情報表示を更新

    // --- 9. ウィンドウリサイズへの対応 ---
    window.addEventListener('resize', () => handleWindowResize(appState.camera, appState.renderer));

    // --- 10. アニメーションループ開始 ---
    animate();

    console.log("[Main] アプリケーションの初期化が完了しました。");
}

/**
 * アニメーションループ。毎フレーム呼び出され、シーンの更新とレンダリングを行います。
 * FPS制御ロジックも含まれます。
 * @param {DOMHighResTimeStamp} currentTime - requestAnimationFrameから渡される高精度タイムスタンプ。
 */
function animate(currentTime) {
    // 次のフレームでの animate 呼び出しを予約
    requestAnimationFrame(animate);

    // --- FPS制限ロジック ---
    if (targetFrameInterval > 0) { // targetFrameIntervalが0より大きい場合のみ制限
        const elapsed = currentTime - lastFrameTime;
        // 前フレームからの経過時間が目標間隔より短い場合は、このフレームの処理をスキップ
        if (elapsed < targetFrameInterval) {
            return;
        }
        // 描画タイミングを調整して、目標FPSに近づける (剰余を使ってズレを補正)
        lastFrameTime = currentTime - (elapsed % targetFrameInterval);
    } else {
         // FPS制限がない場合は、単純に最終フレーム時間を更新
         lastFrameTime = currentTime;
    }

    // --- FPSカウンター計算・表示 ---
    const delta = clock.getDelta(); // 実際のフレーム間時間(秒)を取得
    // 一定間隔でFPS表示を更新 (負荷軽減のため毎フレームは更新しない)
    if (fpsDisplayElement && currentTime - lastFpsUpdateTime > fpsUpdateInterval) {
        const currentFps = delta > 0 ? (1.0 / delta) : 0; // FPS計算 (0除算回避)
        fpsDisplayElement.textContent = `FPS: ${Math.round(currentFps)}`; // 表示更新
        lastFpsUpdateTime = currentTime; // 最終更新時刻を記録
    }

    // --- 各コンポーネントの更新 ---
    updateCameraPosition();      // カメラ移動スティックによる位置更新
    appState.controls?.update(); // OrbitControlsの更新 (慣性などを処理)

    // --- レンダリング ---
    if (appState.renderer && appState.scene && appState.camera) {
        appState.renderer.render(appState.scene, appState.camera); // シーンを描画
    }
}

/**
 * アプリケーション内で発行されるカスタムイベントに対するリスナーを設定します。
 * モジュール間の連携を行います。
 */
function setupCustomEventListeners() {
    console.log("[Main] カスタムイベントリスナーを設定します...");

    // --- 編集モード変更イベント ('editmodechange') ---
    document.addEventListener('editmodechange', (event) => {
        const { newMode } = event.detail;
        console.log(`[Main][Event] 'editmodechange' 受信 - 新モード: ${newMode}`);
        // 1. レンダリングモードを切り替え
        setRenderMode(newMode, appState.loadedBlocks, appState.scene);
        // 2. モードに応じたUI表示状態を更新
        handleModeChangeUI(newMode);
        // 3. XML編集モードならパネル内容を更新 (選択状態に依存するため)
        if (newMode === EditMode.XML_EDIT) {
            updateXmlEditUI();
        }
    });

    // --- 選択状態変更イベント ('selectionchanged') ---
    // (主にXML編集モードでのブロッククリック選択時に発行される)
    document.addEventListener('selectionchanged', () => {
        console.log("[Main][Event] 'selectionchanged' 受信");
        // XML編集モードの場合のみ、パネル表示を更新
        if (getCurrentMode() === EditMode.XML_EDIT) {
            updateXmlEditUI();
        }
    });

    // --- アンドゥ/リドゥ実行後イベント ('historyundone', 'historyredone') ---
    // ブロック構成が変わるので共通ハンドラを呼ぶ
    document.addEventListener('historyundone', handleBlocksChanged);
    document.addEventListener('historyredone', handleBlocksChanged);

    // --- ブロック変形完了イベント ('blocktransformupdated') ---
    // ブロック構成は変わらないが、プロパティ(座標/回転)が変わるので共通ハンドラを呼ぶ
    document.addEventListener('blocktransformupdated', handleBlocksChanged);

    // --- ブロック構成変更汎用イベント ('blocksChanged') ---
    // (ファイル読み込み、カット、ペーストなど、ブロックリストが変更された場合に発行される想定)
    document.addEventListener('blocksChanged', handleBlocksChanged);

    console.log("[Main] カスタムイベントリスナーの設定完了。");
}

/**
 * ブロック構成が変化する可能性のあるイベント (アンドゥ/リドゥ、カット、ペースト、変形完了など) の共通ハンドラ。
 * 主に情報表示エリアを更新します。
 * @param {CustomEvent} [event] - イベントオブジェクト (デバッグ用にイベントタイプなどを参照可能)。
 * @private
 */
function handleBlocksChanged(event) {
    const eventType = event?.type || 'unknown'; // どのイベントで呼ばれたかログに出力
    console.log(`[Main] ブロック構成変更イベント (${eventType}) を処理します。情報表示などを更新。`);

    // 1. 情報表示エリアの内容を更新
    updateInfoDisplay(appState.loadedBlocks); // 第2引数は不要になった

    // 2. XML編集モードであれば、表示されている情報（座標/回転）も最新化
    if (getCurrentMode() === EditMode.XML_EDIT) {
        updateXmlEditUI();
    }
    // 3. その他、ブロック構成変更時に更新が必要なUIがあればここに追加
}

/**
 * FPS制限モードを設定する関数 (uiInteractionsから呼ばれる)。
 * @param {number} mode - 0: Unlimited, 1: 60 FPS, 2: 30 FPS。
 */
export function setFpsLimitMode(mode) {
    switch (mode) {
        case 0: targetFrameInterval = 0; break;             // 無制限
        case 1: targetFrameInterval = 1000 / 60; break;     // 60 FPS
        case 2: targetFrameInterval = 1000 / 30; break;     // 30 FPS
        default: targetFrameInterval = 0;                 // 不明な場合は無制限
    }
    lastFrameTime = performance.now(); // 制限変更時にタイミングをリセット
    console.log(`[Main] FPS制限間隔を ${targetFrameInterval.toFixed(2)} ms に設定しました。`);
}


// --- アプリケーション開始 ---
init(); // アプリケーション初期化関数を実行