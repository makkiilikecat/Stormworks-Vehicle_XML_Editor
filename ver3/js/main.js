/**
 * @fileoverview アプリケーションのエントリーポイント。Three.js環境のセットアップ、
 * 主要モジュールの初期化、アニメーションループの実行を担当。
 */

import * as THREE from 'three';
import { setupSceneEnvironment, handleWindowResize } from './setup/sceneSetup.js';
import { setupOrbitControls } from './setup/controlsSetup.js';
import { setupHelpers } from './setup/helpersSetup.js';
import { createOriginBlockData } from './objects/initialObjects.js';
import { setupHistoryManager } from './state/historyManager.js';
import { updateModeIndicator } from './ui/modeIndicator.js';
import { setupInventoryUI, updatePlacementIndicator } from './ui/inventoryUI.js';
import { getCurrentMode } from './state/editMode.js';
// --- リファクタリング: eventManager をインポート ---
import { initializeEventListeners, setApplicationState } from './events/eventManager.js';
// -----------------------------------------

// === グローバルアプリケーション状態 ===
// 各モジュールからアクセスする必要がある主要なオブジェクトをまとめる
const appState = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    loadedBlocks: [], // 読み込んだ/配置したブロックデータ
    selectedFile: null, // 最後に選択されたファイル
    canvas: null,       // Canvas要素への参照
    // isDraggingTransform: false, // ドラッグ状態は mouseInteractionHandler 内で管理
};
// ==================================


/**
 * アプリケーションの初期化処理。
 * Three.js環境、ヘルパー、初期オブジェクト、状態管理、UI、イベントリスナーを設定。
 */
function init() {
    console.log("Initializing application...");

    // --- Three.js 環境設定 ---
    const sceneEnv = setupSceneEnvironment();
    appState.scene = sceneEnv.scene;
    appState.camera = sceneEnv.camera;
    appState.renderer = sceneEnv.renderer;
    appState.canvas = sceneEnv.renderer.domElement; // Canvas参照を状態に追加

    // --- カメラコントロール設定 ---
    appState.controls = setupOrbitControls(appState.camera, appState.renderer.domElement);

    // --- ヘルパー設定 ---
    setupHelpers(appState.scene);

    // --- 初期オブジェクト生成とデータ設定 ---
    const originBlockData = createOriginBlockData(appState.scene);
    appState.loadedBlocks.push(originBlockData); // 初期ブロックデータをセット

    // --- 状態管理モジュール初期化 ---
    setupHistoryManager(appState.scene, appState.loadedBlocks); // 履歴管理初期化

    // --- UIモジュール初期化 ---
    setupInventoryUI();
    updateModeIndicator(getCurrentMode()); // 初期モード表示
    updatePlacementIndicator(); // 初期配置ブロック表示

    // --- イベントリスナー設定 ---
    setApplicationState(appState); // eventManagerに状態オブジェクトへの参照を渡す
    initializeEventListeners();    // eventManagerでリスナーを設定

    // --- アニメーションループ開始 ---
    animate();

    console.log("Application initialized successfully.");
}

/**
 * アニメーションループ (フレームごとに実行)。
 * カメラコントロールの更新とシーンのレンダリングを行う。
 */
function animate() {
    // 次のフレームでの実行を要求
    requestAnimationFrame(animate);

    // カメラコントロールを更新 (慣性など)
    appState.controls.update();

    // シーンを描画
    appState.renderer.render(appState.scene, appState.camera);
}

// --- アプリケーション開始 ---
init();