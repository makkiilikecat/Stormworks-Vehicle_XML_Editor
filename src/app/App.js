// src/app/App.js
import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import { initializeScene } from '../core/SceneSetup.js';
import { setupHelpers } from '../core/GridHelper.js';
import { initCameraControls, updateCameraControls } from '../core/CameraControls.js';
import { initInputHandler, getIsMouseOverCanvas } from '../controllers/InputHandler.js';
import { initPreviewController, updatePreviewBlock, setPreviewVisible } from '../controllers/PreviewController.js';
import { initializeAppState } from './AppState.js';
import { initSelectionController } from '../controllers/SelectionController.js';
import { initBlockTransformController } from '../controllers/BlockTransformController.js';
import { initRaycastService } from '../services/RaycastService.js';
import { initBlockDataManager, addBlock } from '../models/BlockDataManager.js';
import { initViewUpdater } from '../core/ViewUpdater.js';
import { getPreviewPosition } from '../controllers/PreviewController.js'; // InputHandlerへのmouse渡し用だったが不要に

export class App {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) throw new Error(`Canvas element #${canvasId} not found.`);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();
        // this.placedBlocks = []; // DataManagerが管理
    }

    init() {
        try {
            initializeAppState(); // 1. アプリ状態初期化

            const { scene, camera, renderer } = initializeScene(this.canvas); // 2. Scene準備
            this.scene = scene;
            this.camera = camera;
            this.renderer = renderer;

            initRaycastService(this.camera);       // 3. Raycastサービス初期化 (カメラ依存)
            initBlockDataManager(this.scene);      // 4. データマネージャ初期化 (シーン依存)
            initViewUpdater();                     // 5. ビューアップデーター初期化 (DataManagerイベント依存)

            setupHelpers(this.scene);              // 6. ヘルパー設定
            initCameraControls(this.camera, this.renderer.domElement); // 7. カメラ操作初期化

            // 8. 各機能コントローラー初期化 (依存関係注入)
            initPreviewController(this.scene); // シーンのみ依存
            initSelectionController();         // AppState, DataManager(内部で利用)
            initBlockTransformController();    // AppState, DataManager(内部で利用)
            initInputHandler(this.renderer.domElement); // DOMのみ依存

            this.addInitialBlock(); // 9. 初期ブロック追加

            window.addEventListener('resize', this.onWindowResize.bind(this)); // 10. リサイズ対応
            this.animate(); // 11. アニメーションループ開始

            console.log("Application initialized successfully.");

        } catch (error) {
            console.error("Error during application initialization:", error);
            // UIにエラー表示などの処理
            const errorDiv = document.createElement('div');
            errorDiv.textContent = `Initialization Error: ${error.message}`;
            // ... (エラー表示スタイル設定) ...
            document.body.prepend(errorDiv);
            if(this.canvas) this.canvas.style.display = 'none';
        }
    }

    addInitialBlock() {
        const initialPosition = new THREE.Vector3(0, 0, 0);
        const initialOrientation = new THREE.Matrix4(); // 単位行列
        // DataManager経由で追加
        addBlock({ position: initialPosition, orientation: initialOrientation });
    }

    onWindowResize() {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        const delta = this.clock.getDelta();
        TWEEN.update(performance.now()); // アニメーション更新

        updateCameraControls(delta); // カメラ更新

        // プレビュー更新 (InputHandlerからマウス座標を受け取る必要がなくなった)
        // InputHandler内で管理されている mouse 座標を使う必要がある
        // → InputHandlerからmouse座標を取得する関数を作るか、
        //   PreviewControllerが自分でmouseイベントをlistenするか？
        // → InputHandlerがanimateで呼ばれる関数を持つ形にする？
        // 現状 InputHandler.mouse は更新されているので、それを参照する形で一旦実装
        // ただし、InputHandlerからmouseをexportする必要がある
        if (getIsMouseOverCanvas()) { // マウスがCanvas上にあるか
             // InputHandlerからmouse座標を取得 or InputHandlerに更新を依頼
             // 例: import { getCurrentMouseCoords } from './controllers/InputHandler.js';
             // updatePreviewBlock(getCurrentMouseCoords());
             // 今回は InputHandler.mouse が更新されている前提で PreviewController 内で mouse を使う (InputHandler の mouse を export する修正が必要)
             // → animateループから直接 InputHandler.mouse を渡すのが依存が少ないか
             // App.js に mouse state を持たせる？ -> やりすぎ
             // InputHandler に update 関数を追加する？
             // → 一番シンプルなのは InputHandler.mouse を export して PreviewController で import する。
             // InputHandler.js: export const mouse = new THREE.Vector2(); を追加
             // PreviewController.js: import { mouse } from './InputHandler.js'; として updatePreviewBlock(mouse) に変更
             // → この修正を適用して PreviewController を修正

             // ★ InputHandlerから最新のマウス座標を取得してPreviewControllerに渡す
             const currentMouse = InputHandler_getCurrentMouseCoords(); // 仮の関数名
             updatePreviewBlock(currentMouse);
        } else {
            setPreviewVisible(false);
        }


        this.renderer.render(this.scene, this.camera);
    }
}

// InputHandlerからマウス座標を取得するための仮関数（実際にはInputHandlerを修正）
import { mouse as currentMouseCoords } from '../controllers/InputHandler.js'; // InputHandlerでmouseをexportする必要あり
function InputHandler_getCurrentMouseCoords(){
    return currentMouseCoords;
}