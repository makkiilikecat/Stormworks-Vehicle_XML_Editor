/**
 * @fileoverview Stormworks Vehicle Editor アプリケーションのエントリーポイント。
 * Three.js 環境のセットアップ、主要モジュールの初期化、
 * UI要素の基本的な接続、およびアニメーションループ (FPS制御含む) の実行を担当します。
 *
 * 主要な依存関係:
 * - 各種 setup/ モジュール: Three.js環境の初期化
 * - 各種 state/ モジュール: アプリケーション状態の管理
 * - 各種 interactions/ モジュール: ユーザー操作に応じたコアロジック
 * - 各種 handlers/ モジュール: イベント処理とロジックの振り分け
 * - 各種 ui/ モジュール: UI要素の制御・更新
 * - 各種 rendering/ モジュール: 3D描画関連
 */

// --- Three.js 本体 ---
import * as THREE from 'three';

// --- セットアップ関連 ---
import { setupSceneEnvironment, handleWindowResize } from './setup/sceneSetup.js';
import { setupOrbitControls } from './setup/controlsSetup.js';
import { setupHelpers } from './setup/helpersSetup.js';

// --- オブジェクト・データ ---
import { createOriginBlockData } from './objects/initialObjects.js';
import { BlockData } from './data/blockData.js'; // BlockDataクラス (型情報として)

// --- 状態管理 ---
import { setupHistoryManager } from './state/historyManager.js';
import { getCurrentMode, EditMode } from './state/editMode.js'; // EditMode Enum も使用
import { initializeSelectionState } from './interactions/selectionState.js';

// --- UI関連 ---
import { updateModeIndicator } from './ui/modeIndicator.js';
// import { setupInventoryUI, updatePlacementIndicator } from './ui/inventoryUI.js'; // 古いUI用のため削除
import { updateXmlEditUI, hideXmlEditPanel, showXmlEditPanel } from './ui/xmlEditUI.js';
import { initializeUIInteractions } from './ui/uiInteractions.js'; // 新UIのトグル等

// --- レンダリング関連 ---
import { setRenderMode, clearBlocks, renderBlocks } from './rendering/blockRenderer.js';

// --- イベント・ハンドラ関連 ---
import { initializeEventListeners, setApplicationState } from './events/eventManager.js';
import { initializeKeyboardInput } from './handlers/keyboardInputHandler.js'; // キーボード処理
import { initializeCameraStick, updateCameraPosition } from './interactions/cameraStickHandler.js'; // カメラ移動スティック

// === グローバルアプリケーション状態 ===
/**
 * アプリケーション全体で共有される主要なオブジェクトや状態を格納するオブジェクト。
 * 各モジュールはこのオブジェクトへの参照を通して必要な情報にアクセスします。
 * @type {{
 * scene: THREE.Scene | null,
 * camera: THREE.PerspectiveCamera | null,
 * renderer: THREE.WebGLRenderer | null,
 * controls: import('three/addons/controls/OrbitControls.js').OrbitControls | null, // 型定義をインポート
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
/** @type {number} FPS表示更新の最終時刻 */
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
 * 各モジュールの初期化、イベントリスナーの設定、アニメーションループの開始を行う。
 */
function init() {
    console.log("[Main] アプリケーションの初期化を開始します...");

    // 1. Three.js 環境設定 (シーン, カメラ, レンダラー)
    const sceneEnv = setupSceneEnvironment();
    appState.scene = sceneEnv.scene;
    appState.camera = sceneEnv.camera;
    appState.renderer = sceneEnv.renderer;
    appState.canvas = sceneEnv.renderer.domElement;

    // 2. カメラコントロール設定 (OrbitControls)
    appState.controls = setupOrbitControls(appState.camera, appState.renderer.domElement);

    // 3. ヘルパー設定 (グリッド, 軸)
    setupHelpers(appState.scene);

    // 4. 初期オブジェクト生成 (原点ブロック)
    const originBlockData = createOriginBlockData(appState.scene);
    appState.loadedBlocks.push(originBlockData);

    // 5. 状態管理モジュール初期化
    setupHistoryManager(appState.scene, appState.loadedBlocks); // アンドゥ/リドゥ
    initializeSelectionState(appState.scene);                // 選択状態管理 (範囲選択含む)
    // initializeClipboardState(); // クリップボード状態 (clipboardState.js内で自動初期化される)

    // 6. UIモジュール初期化
    initializeUIInteractions(appState);      // ボタン等の基本的なUI操作
    initializeCameraStick(appState);         // カメラ移動スティック
    fpsDisplayElement = document.getElementById('fps-display'); // FPS表示要素取得

    // 7. イベントリスナー設定
    setApplicationState(appState);         // 他モジュールが appState を参照できるように
    initializeEventListeners();            // DOMイベントリスナー (ファイル, マウス基本)
    initializeKeyboardInput(appState);     // キーボードイベントリスナー
    setupCustomEventListeners();           // アプリ内カスタムイベントリスナー

    // 8. ウィンドウリサイズへの対応
    window.addEventListener('resize', () => handleWindowResize(appState.camera, appState.renderer));

    // 9. 初期表示更新
    updateModeIndicator(getCurrentMode()); // モード表示
    // updatePlacementIndicator(); // 配置ブロック表示 (新しいUIでの実装待ち)
    hideXmlEditPanel();              // XMLパネル初期非表示

    // 10. アニメーションループ開始
    animate();

    console.log("[Main] アプリケーションの初期化が完了しました。");
}

/**
 * アニメーションループ。毎フレーム呼び出され、FPS制御、状態更新、描画を行う。
 * @param {DOMHighResTimeStamp} currentTime - requestAnimationFrameから渡される高精度タイムスタンプ。
 */
function animate(currentTime) {
    requestAnimationFrame(animate); // 次フレーム描画を予約

    // --- FPS制限ロジック ---
    if (targetFrameInterval > 0) { // 制限が有効な場合
        const elapsed = currentTime - lastFrameTime; // 前回からの経過時間
        if (elapsed < targetFrameInterval) { // 目標間隔未満なら
            return; // このフレームは描画スキップ
        }
        // 描画する場合、次の基準時刻を更新 (遅延を考慮)
        lastFrameTime = currentTime - (elapsed % targetFrameInterval);
    } else {
         lastFrameTime = currentTime; // 無制限の場合は単純に現在時刻を記録
    }

    // --- FPS計算・表示ロジック ---
    const delta = clock.getDelta(); // 前フレームからの経過時間(秒)
    if (fpsDisplayElement && currentTime - lastFpsUpdateTime > fpsUpdateInterval) { // 一定間隔で更新
        const currentFps = delta > 0 ? (1.0 / delta) : 0;
        fpsDisplayElement.textContent = `FPS: ${Math.round(currentFps)}`;
        lastFpsUpdateTime = currentTime;
    }

    // --- 状態更新 ---
    updateCameraPosition();     // カメラ移動スティックによる位置更新
    appState.controls?.update(); // OrbitControls更新 (マウス/タッチ操作と慣性)

    // --- レンダリング ---
    if (appState.renderer && appState.scene && appState.camera) {
        appState.renderer.render(appState.scene, appState.camera);
    }
}

/**
 * アプリケーション内で発行されるカスタムイベントに対するリスナーを設定します。
 * モジュール間の疎結合な連携を実現します。
 */
function setupCustomEventListeners() {
    console.log("[Main] カスタムイベントリスナーを設定します...");

    // --- 編集モード変更イベント ('editmodechange' from editMode.js) ---
    document.addEventListener('editmodechange', (event) => {
        const { newMode } = event.detail;
        console.log(`[Main][Event] 'editmodechange' 受信 - 新モード: ${newMode}`);

        // 1. レンダリングモード切り替え
        setRenderMode(newMode, appState.loadedBlocks, appState.scene);

        // 2. UI要素の表示状態切り替え
        const xmlEditPanelElement = document.getElementById('xml-edit-panel');
        if (xmlEditPanelElement) xmlEditPanelElement.style.display = (newMode === EditMode.XML_EDIT) ? 'block' : 'none';

        document.querySelectorAll('.range-only').forEach(el => {
            el.style.display = (newMode === EditMode.RANGE_SELECT) ? (el.tagName === 'HR' ? 'block' : 'flex') : 'none';
        });
        const rangeDpad = document.getElementById('range-adjust-dpad');
        if (rangeDpad) rangeDpad.style.display = (newMode === EditMode.RANGE_SELECT) ? 'grid' : 'none';

        // 3. ツールバーボタンのアクティブ状態更新
        document.querySelectorAll('#left-toolbar .mode-button').forEach(button => {
             button.classList.toggle('active', button.dataset.mode === newMode);
         });

        // 4. モードインジケータ更新
         updateModeIndicator(newMode);
    });

    // --- 選択状態変更イベント ('selectionchanged' from selectionState.js) ---
    document.addEventListener('selectionchanged', (event) => {
        // const { selectedBlocks } = event.detail; // 選択されたブロックリスト
        console.log("[Main][Event] 'selectionchanged' 受信");
        // XML編集モードの場合のみ、パネルを更新
        if (getCurrentMode() === EditMode.XML_EDIT) {
            updateXmlEditUI();
        }
        // TODO: 必要なら他のUI（例：情報表示パネルの選択数表示）も更新
    });

    // --- アンドゥ/リドゥ実行後イベント ('historyundone'/'historyredone' from historyManager.js) ---
    document.addEventListener('historyundone', handleHistoryChangeForUI);
    document.addEventListener('historyredone', handleHistoryChangeForUI);

    // --- ブロック変形完了イベント ('blocktransformupdated' from ??? historyActions?) ---
    // dragTransformHandler.js で発行していたが、historyActions.js 側で処理後に発行する方が一貫性があるかも
    document.addEventListener('blocktransformupdated', handleHistoryChangeForUI);

    // --- ブロック変更イベント ('blocksChanged' from clipboardHandler.js など) ---
    document.addEventListener('blocksChanged', () => {
         console.log("[Main][Event] 'blocksChanged' 受信");
         // 必要ならシーンを再描画 (historyManager が担当しない場合)
         // renderBlocks(appState.scene, appState.loadedBlocks);
         // 必要なら情報表示（質量、コスト、サイズなど）を更新
         // updateInfoDisplay(); // (未実装)
     });

    console.log("[Main] カスタムイベントリスナーの設定完了。");
}

/**
 * 履歴変更やブロック変形完了時に呼び出され、関連するUIを更新する共通ハンドラ。
 * @param {CustomEvent} event - イベントオブジェクト。
 * @private
 */
function handleHistoryChangeForUI(event) {
    console.log(`[Main] 履歴変更/変形完了 (${event.type}) を処理します。`);
    // 選択状態はクリアしない方がアンドゥ/リドゥの挙動として自然な場合が多い
    // clearSelection();
    if (getCurrentMode() === EditMode.XML_EDIT) {
        updateXmlEditUI(); // XML編集UIは選択状態に依存するため更新
    }
    // 必要に応じて他のUI更新
}

/**
 * ★追加: FPS制限モードを設定する関数 (uiInteractions.js から呼ばれる)。
 * @param {number} mode - 0: Unlimited, 1: 60 FPS, 2: 30 FPS。
 */
export function setFpsLimitMode(mode) {
    switch (mode) {
        case 0: targetFrameInterval = 0; break;        // 無制限
        case 1: targetFrameInterval = 1000 / 60; break; // 60 FPS (~16.67ms)
        case 2: targetFrameInterval = 1000 / 30; break; // 30 FPS (~33.33ms)
        default: targetFrameInterval = 0;               // デフォルトは無制限
    }
    lastFrameTime = performance.now(); // 制限変更時にタイミングリセット
    const limitFps = targetFrameInterval > 0 ? (1000 / targetFrameInterval).toFixed(0) : 'Unlimited';
    console.log(`[Main] FPS Limit interval set to: ${targetFrameInterval.toFixed(2)} ms (${limitFps} FPS)`);
}


// --- アプリケーション開始 ---
init();