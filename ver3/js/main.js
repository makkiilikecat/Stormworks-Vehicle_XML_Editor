/**
 * @fileoverview Stormworks XML Editor アプリケーションのエントリーポイント。
 * Three.js 環境のセットアップ、主要モジュールの初期化、
 * アニメーションループの実行を担当します。
 * 各種イベントの処理は eventManager および handlers/ 以下のモジュールに委譲します。
 */

// --- Three.js 本体とアドオン ---
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- セットアップ関連モジュール ---
import { setupSceneEnvironment, handleWindowResize } from './setup/sceneSetup.js';
import { setupOrbitControls } from './setup/controlsSetup.js';
import { setupHelpers } from './setup/helpersSetup.js';

// --- オブジェクト・データ関連モジュール ---
import { createOriginBlockData } from './objects/initialObjects.js';
import { BlockData } from './data/blockData.js';

// --- 状態管理モジュール ---
import { setupHistoryManager } from './state/historyManager.js';
import { getCurrentMode, EditMode } from './state/editMode.js';
import { initializeSelectionState } from './interactions/selectionState.js';

// --- UI関連モジュール ---
import { updateModeIndicator } from './ui/modeIndicator.js';
import { setupInventoryUI, updatePlacementIndicator } from './ui/inventoryUI.js';
import { updateXmlEditUI, hideXmlEditPanel, showXmlEditPanel } from './ui/xmlEditUI.js';

// --- レンダリング関連モジュール ---
import { setRenderMode, clearBlocks, renderBlocks } from './rendering/blockRenderer.js';

// --- イベント・ハンドラ関連モジュール ---
import { initializeEventListeners, setApplicationState } from './events/eventManager.js';

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


/**
 * アプリケーションの初期化処理。
 */
function init() {
    console.log("[Main] アプリケーションの初期化を開始します...");

    // 1. Three.js 環境設定
    const sceneEnv = setupSceneEnvironment();
    appState.scene = sceneEnv.scene;
    appState.camera = sceneEnv.camera;
    appState.renderer = sceneEnv.renderer;
    appState.canvas = sceneEnv.renderer.domElement;

    // 2. カメラコントロール設定
    appState.controls = setupOrbitControls(appState.camera, appState.renderer.domElement);

    // 3. ヘルパー設定
    setupHelpers(appState.scene);

    // 4. 初期オブジェクト生成
    const originBlockData = createOriginBlockData(appState.scene);
    appState.loadedBlocks.push(originBlockData);

    // 5. 状態管理モジュール初期化
    setupHistoryManager(appState.scene, appState.loadedBlocks);
    // ★修正: initializeSelectionState に appState.scene を渡す
    initializeSelectionState(appState.scene);

    // 6. UIモジュール初期化
    setupInventoryUI();
    updateModeIndicator(getCurrentMode());
    updatePlacementIndicator();
    hideXmlEditPanel();

    // 7. イベントリスナー設定
    setApplicationState(appState);
    initializeEventListeners();
    setupCustomEventListeners();

    // 8. ウィンドウリサイズへの対応
    window.addEventListener('resize', () => handleWindowResize(appState.camera, appState.renderer));

    // 9. アニメーションループ開始
    animate();

    console.log("[Main] アプリケーションの初期化が完了しました。");
}

/**
 * アニメーションループ。
 */
function animate() {
    requestAnimationFrame(animate);
    appState.controls?.update();
    if (appState.renderer && appState.scene && appState.camera) {
        appState.renderer.render(appState.scene, appState.camera);
    }
}

/**
 * カスタムイベントリスナーを設定します。
 */
function setupCustomEventListeners() {
    console.log("[Main] カスタムイベントリスナーを設定します...");

    // 編集モード変更時
    document.addEventListener('editmodechange', (event) => {
        const { newMode } = event.detail; // oldMode も使える
        console.log(`[Main][Event] 'editmodechange' 受信 - 新モード: ${newMode}`);
        setRenderMode(newMode, appState.loadedBlocks, appState.scene);
        if (newMode === EditMode.XML_EDIT) {
            showXmlEditPanel();
        } else {
            hideXmlEditPanel();
        }
    });

    // 選択状態変更時
    document.addEventListener('selectionchanged', () => {
        console.log("[Main][Event] 'selectionchanged' 受信");
        if (getCurrentMode() === EditMode.XML_EDIT) {
            updateXmlEditUI();
        }
        // TODO (Step 5): 範囲選択モードの場合、選択状態変更時に何かする必要があるか？
        // (現状は selectionState 内でハイライトは完結)
    });

    // アンドゥ/リドゥ実行後
    document.addEventListener('historyundone', handleHistoryChangeForUI);
    document.addEventListener('historyredone', handleHistoryChangeForUI);

    // ブロック変形完了後
    document.addEventListener('blocktransformupdated', handleHistoryChangeForUI);

    console.log("[Main] カスタムイベントリスナーの設定完了。");
}

/**
 * 履歴変更/変形完了時のUI更新ハンドラ。
 * @param {CustomEvent} event - イベントオブジェクト。
 * @private
 */
function handleHistoryChangeForUI(event) {
    console.log(`[Main] 履歴変更/変形完了 (${event.type}) を処理します。`);
    if (getCurrentMode() === EditMode.XML_EDIT) {
        updateXmlEditUI(); // XML編集UIを更新
    }
    // 必要に応じて他のUI更新
}

// --- アプリケーション開始 ---
init();