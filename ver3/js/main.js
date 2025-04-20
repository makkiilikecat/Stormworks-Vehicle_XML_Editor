import * as THREE from 'three';
import { setupSceneEnvironment, handleWindowResize } from './setup/sceneSetup.js';
import { setupOrbitControls } from './setup/controlsSetup.js';
import { setupHelpers } from './setup/helpersSetup.js';
import { createOriginBlock } from './objects/initialObjects.js';

// --- グローバル変数 ---
let scene, camera, renderer, controls;
let originBlock; // 原点ブロックへの参照 (将来使う可能性あり)

/**
 * アプリケーションの初期化処理
 */
function init() {
    // シーン、カメラ、レンダラーをセットアップ
    const sceneEnv = setupSceneEnvironment();
    scene = sceneEnv.scene;
    camera = sceneEnv.camera;
    renderer = sceneEnv.renderer;

    // 視点操作コントロールをセットアップ
    controls = setupOrbitControls(camera, renderer.domElement);

    // グリッドと軸ヘルパーをセットアップ
    setupHelpers(scene);

    // 原点ブロックを作成してシーンに追加
    originBlock = createOriginBlock(scene);

    // ウィンドウリサイズイベントに対応
    window.addEventListener('resize', () => handleWindowResize(camera, renderer));

    // アニメーションループを開始
    animate();
}

/**
 * アニメーションループ (フレームごとに実行)
 */
function animate() {
    // 次のフレームでのアニメーション実行を要求
    requestAnimationFrame(animate);

    // カメラコントロールを更新 (慣性などを適用)
    controls.update();

    // シーンを描画
    renderer.render(scene, camera);
}

// --- アプリケーション開始 ---
init();