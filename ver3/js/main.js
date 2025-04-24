/**
 * @fileoverview Stormworks XML Editor アプリケーションのエントリーポイント (起点)。
 * このファイルが最初に実行され、アプリケーション全体の初期化、
 * 3Dシーンのセットアップ、アニメーションループの管理、
 * モジュール間の連携のためのカスタムイベント処理を行います。
 */


//webpackが認識するため
import * as THREE from 'three'; // Three.js をインポート
import '../css/style.css'; // CSSファイルをインポート

// --- セットアップ関連モジュール ---
// シーン、カメラ、レンダラー、ライトなどの基本的な3D環境を設定
import { setupSceneEnvironment, handleWindowResize } from './setup/sceneSetup.js';
// カメラ操作 (OrbitControls) を設定
import { setupOrbitControls } from './setup/controlsSetup.js';
// 補助的な表示要素 (グリッド、軸) を設定
import { setupHelpers } from './setup/helpersSetup.js';

// --- オブジェクト・データ関連モジュール ---
// アプリケーション開始時に表示する原点ブロックのデータを生成
import { createOriginBlockData } from './objects/initialObjects.js';
// ブロックデータの構造を定義するクラス (直接は使わないが依存関係として)
import { BlockData } from './data/blockData.js';

// --- 状態管理モジュール ---
// アンドゥ/リドゥ機能の初期化
import { setupHistoryManager } from './state/historyManager.js';
// 現在の編集モード (通常、削除、XML編集など) を管理
import { getCurrentMode, EditMode } from './state/editMode.js';
// ブロック選択状態 (単一/複数/範囲) の初期化
import { initializeSelectionState } from './interactions/selectionState.js';

// --- UI関連モジュール ---
// 全てのUI要素 (ボタン、パネルなど) の初期設定を行う
import { initializeAllUI } from './ui/uiInitializer.js';
// 編集モード変更時にUI表示 (ボタンの有効/無効など) を更新
import { handleModeChangeUI } from './ui/uiInteractions.js';
// XML編集パネルの表示/非表示を制御
import { showXmlEditPanel, hideXmlEditPanel } from './ui/xmlEditPanelVisibility.js';
// XML編集パネルの内容 (プロパティリスト) を更新
import { updateXmlEditUI } from './ui/xmlEditPanelContent.js';
// 左上の情報表示エリア (ブロック数、質量など) の初期化と更新
import { initializeInfoDisplay, updateInfoDisplay } from './ui/infoDisplayHandler.js';

// --- レンダリング関連モジュール ---
// 編集モードに応じてブロックの表示方法 (通常/ゴースト+前景) を切り替え
import { setRenderMode } from './rendering/blockRenderer.js';
// ブロック配置時のプレビュー表示を非表示にするため
import { hidePreviewBlock } from './rendering/previewBlock.js';

// --- イベント・ハンドラ関連モジュール ---
// DOMイベント (マウス、キーボード、ファイル選択など) のリスナーを設定
import { initializeEventListeners, setApplicationState } from './events/eventManager.js';
// 画面左下の仮想スティックによるカメラ移動処理を初期化・実行
import { initializeCameraStick, updateCameraPosition } from './interactions/cameraStickHandler.js';


// === グローバルアプリケーション状態 ===
/**
 * アプリケーション全体で共有される状態オブジェクト。
 * 各モジュールはこのオブジェクトを通じて他のモジュールの状態や
 * Three.js の主要オブジェクト (scene, camera など) にアクセスします。
 * @type {{
 * scene: THREE.Scene | null,               // 3Dシーンオブジェクト
 * camera: THREE.PerspectiveCamera | null,  // カメラオブジェクト
 * renderer: THREE.WebGLRenderer | null,    // レンダラーオブジェクト
 * controls: import('three/addons/controls/OrbitControls.js').OrbitControls | null, // カメラコントローラー
 * loadedBlocks: BlockData[],              // 現在ロードされているブロックデータの配列
 * selectedFile: File | null,              // 最後に読み込んだファイルオブジェクト
 * canvas: HTMLCanvasElement | null        // レンダリング対象のCanvas要素
 * }}
 */
const appState = {
    scene: null, camera: null, renderer: null, controls: null,
    loadedBlocks: [], selectedFile: null, canvas: null,
};
// ==================================

// === FPS制御用変数 ===
const clock = new THREE.Clock(); // Three.js の時間計測用
let lastFpsUpdateTime = 0;       // FPS表示を最後に更新した時刻
const fpsUpdateInterval = 500;   // FPS表示の更新間隔 (ミリ秒)
let targetFrameInterval = 0;     // 目標フレームレートを実現するためのフレーム間隔 (ミリ秒、0は無制限)
let lastFrameTime = 0;           // 前回のフレーム描画時刻
let fpsDisplayElement = null;    // FPS表示用のHTML要素
// =======================

/**
 * アプリケーション全体の初期化を実行するメイン関数。
 */
function init() {
    console.log("[Main] アプリケーション初期化 開始");

    // 1. Three.js 環境設定 (シーン、カメラ、レンダラー等)
    const sceneEnv = setupSceneEnvironment();
    if (!sceneEnv?.scene) { console.error("[Main] シーン環境初期化失敗。処理中断。"); return; }
    appState.scene = sceneEnv.scene;
    appState.camera = sceneEnv.camera;
    appState.renderer = sceneEnv.renderer;
    appState.canvas = sceneEnv.renderer.domElement;

    // 2. カメラ操作 (OrbitControls) 設定
    appState.controls = setupOrbitControls(appState.camera, appState.renderer.domElement);

    // 3. 補助表示 (グリッド、軸) 設定
    setupHelpers(appState.scene);

    // 4. 初期ブロック (原点ブロック) 生成
    const originBlockData = createOriginBlockData(appState.scene);
    appState.loadedBlocks.push(originBlockData);

    // 5. 状態管理モジュールの初期化
    setupHistoryManager(appState.scene, appState.loadedBlocks); // Undo/Redo
    initializeSelectionState(appState.scene);                   // 選択状態

    // 6. UI関連モジュールの初期化
    initializeAllUI(appState);        // 全UI要素 (uiInitializer経由)
    initializeCameraStick(appState);  // カメラ移動スティック
    initializeInfoDisplay();          // 左上情報表示
    fpsDisplayElement = document.getElementById('fps-display'); // FPS表示要素取得

    // 7. イベントリスナー設定
    setApplicationState(appState);      // 他モジュールからappStateにアクセス可能にする
    initializeEventListeners();       // DOMイベントリスナー初期化
    setupCustomEventListeners();    // アプリケーション内カスタムイベントリスナー設定

    // 8. UIの初期表示状態を設定
    handleModeChangeUI(getCurrentMode()); // 現在のモードに基づきUI更新
    updateInfoDisplay(appState.loadedBlocks); // 初期ブロック情報で左上情報更新

    // 9. ウィンドウリサイズ時の処理を設定
    window.addEventListener('resize', () => handleWindowResize(appState.camera, appState.renderer));

    // 10. アニメーションループ開始
    animate();

    console.log("[Main] アプリケーション初期化 完了");
}

/**
 * メインのアニメーションループ。毎フレーム呼び出される。
 * @param {DOMHighResTimeStamp} currentTime - requestAnimationFrame から渡されるタイムスタンプ。
 */
function animate(currentTime) {
    requestAnimationFrame(animate); // 次のフレームを予約

    // --- FPS制限 ---
    if (targetFrameInterval > 0) {
        const elapsed = currentTime - lastFrameTime;
        if (elapsed < targetFrameInterval) return; // 経過時間が短ければ描画スキップ
        lastFrameTime = currentTime - (elapsed % targetFrameInterval); // 次の描画タイミングを調整
    } else {
        lastFrameTime = currentTime;
    }

    // --- FPS表示更新 ---
    const delta = clock.getDelta(); // 経過時間を取得
    if (fpsDisplayElement && currentTime - lastFpsUpdateTime > fpsUpdateInterval) {
        const currentFps = delta > 0 ? (1.0 / delta) : 0;
        fpsDisplayElement.textContent = `FPS: ${Math.round(currentFps)}`;
        lastFpsUpdateTime = currentTime;
    }

    // --- フレームごとの更新処理 ---
    updateCameraPosition();      // スティックによるカメラ移動
    appState.controls?.update(); // OrbitControls の更新 (慣性など)

    // --- レンダリング実行 ---
    if (appState.renderer && appState.scene && appState.camera) {
        appState.renderer.render(appState.scene, appState.camera);
    }
}

/**
 * アプリケーション内カスタムイベントのリスナーを設定する。
 * これにより、異なるモジュール間で状態の変更を通知し合い、連携する。
 */
function setupCustomEventListeners() {
    console.log("[Main] カスタムイベントリスナー設定 開始");

    // --- 編集モード変更 ('editmodechange') ---
    document.addEventListener('editmodechange', (event) => {
        const { newMode } = event.detail; // イベントデータから新しいモードを取得
        console.log(`[Main][Event] 'editmodechange' 受信 - 新モード: ${newMode}`);
        // 1. ブロックのレンダリング方法を切り替え
        setRenderMode(newMode, appState.loadedBlocks, appState.scene);
        // 2. UI (ボタンのアクティブ状態など) を更新
        handleModeChangeUI(newMode);
        // 3. XML編集モードの場合はパネルを表示、それ以外は非表示
        if (newMode === EditMode.XML_EDIT) {
            showXmlEditPanel(); // XML編集パネル表示 (内容更新も含む)
        } else {
            hideXmlEditPanel(); // XML編集パネル非表示
        }
        // 4. 通常モード以外になったら、配置プレビューを非表示にする
        if (newMode !== EditMode.NORMAL) {
            hidePreviewBlock(appState.scene);
        }
    });

    // --- 選択状態変更 ('selectionchanged') ---
    document.addEventListener('selectionchanged', () => {
        console.log("[Main][Event] 'selectionchanged' 受信");
        // XML編集モードの時のみ、パネルの内容を選択状態に合わせて更新
        if (getCurrentMode() === EditMode.XML_EDIT) {
            updateXmlEditUI();
        }
    });

    // --- 履歴操作完了 ('historyundone', 'historyredone') ---
    // ブロック構成やプロパティが変わるため、共通ハンドラを呼び出す
    document.addEventListener('historyundone', handleBlocksChanged);
    document.addEventListener('historyredone', handleBlocksChanged);

    // --- ブロック変形完了 ('blocktransformupdated') ---
    // プロパティが変わるため、共通ハンドラを呼び出す
    document.addEventListener('blocktransformupdated', handleBlocksChanged);

    // --- ブロックリスト変更汎用 ('blocksChanged') ---
    // ファイルロード、ペースト、削除などでブロックリスト自体が変わった場合に発行される
    document.addEventListener('blocksChanged', handleBlocksChanged);

    console.log("[Main] カスタムイベントリスナー設定 完了");
}

/**
 * ブロック構成やプロパティが変更された可能性のあるイベントの共通処理。
 * 主にUI表示の更新を行う。
 * @param {CustomEvent} [event] - 発生したイベントオブジェクト。
 * @private
 */
function handleBlocksChanged(event) {
    const eventType = event?.type || 'unknown';
    console.log(`[Main] ブロック変更系イベント (${eventType}) を処理。UI更新実行。`);

    // 1. 左上情報表示 (ブロック数、質量など) を更新
    updateInfoDisplay(appState.loadedBlocks);

    // 2. XML編集モードであれば、パネルの内容 (値) も最新化
    if (getCurrentMode() === EditMode.XML_EDIT) {
        updateXmlEditUI();
    }
    // (必要なら他のUI更新処理も追加)
}

/**
 * FPS制限モードを設定する (uiInteractions から呼び出される)。
 * @param {number} mode - 0: Unlimited, 1: 60 FPS, 2: 30 FPS。
 */
export function setFpsLimitMode(mode) {
    // (変更なし)
    switch (mode) { case 0: targetFrameInterval = 0; break; case 1: targetFrameInterval = 1000 / 60; break; case 2: targetFrameInterval = 1000 / 30; break; default: targetFrameInterval = 0; }
    lastFrameTime = performance.now(); console.log(`[Main] FPS制限間隔: ${targetFrameInterval.toFixed(2)} ms`);
}


// --- アプリケーションの実行開始 ---
init();