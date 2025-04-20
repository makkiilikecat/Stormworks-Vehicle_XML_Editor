// src/app/App.js
import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import { initializeScene } from '../core/SceneSetup.js';
import { setupHelpers } from '../core/GridHelper.js';
import { initCameraControls, updateCameraControls } from '../core/CameraControls.js';
import { initInputHandler, getIsMouseOverCanvas, getCurrentMouseCoords } from '../controllers/InputHandler.js';
import { initPreviewController, updatePreviewBlock, setPreviewVisible } from '../controllers/PreviewController.js';
import { initializeAppState, isXmlEditModeActive, isDeleteModeActive } from './AppState.js';
import { initSelectionController, highlightHoveredFace, clearFaceHighlight } from '../controllers/SelectionController.js';
import { initBlockTransformController } from '../controllers/BlockTransformController.js';
import { initRaycastService } from '../services/RaycastService.js';
import { initBlockDataManager, addBlock } from '../models/BlockDataManager.js';
import { initViewUpdater } from '../core/ViewUpdater.js';


export class App {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) throw new Error(`Canvas element #${canvasId} not found.`);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();
        // BlockDataManager がデータを管理するため、ここに placedBlocks は不要
    }

    init() {
        try {
            initializeAppState(); // 1. アプリ状態初期化

            const { scene, camera, renderer } = initializeScene(this.canvas); // 2. Scene準備
            this.scene = scene;
            this.camera = camera;
            this.renderer = renderer;

            initRaycastService(this.camera);       // 3. Raycastサービス初期化
            initBlockDataManager(this.scene);      // 4. データマネージャ初期化
            initViewUpdater();                     // 5. ビューアップデーター初期化

            setupHelpers(this.scene);              // 6. ヘルパー設定
            initCameraControls(this.camera, this.renderer.domElement); // 7. カメラ操作初期化

            // 8. 各機能コントローラー初期化
            initPreviewController(this.scene);
            initSelectionController();         // SelectionController初期化
            // ★ 削除: addHighlightMeshToScene(this.scene); // ハイライト用メッシュは不要になった
            initBlockTransformController();
            initInputHandler(this.renderer.domElement);

            this.addInitialBlock(); // 9. 初期ブロック追加

            window.addEventListener('resize', this.onWindowResize.bind(this)); // 10. リサイズ対応
            this.animate(); // 11. アニメーションループ開始

            console.log("Application initialized successfully.");

        } catch (error) {
            console.error("Error during application initialization:", error);
            const errorDiv = document.createElement('div');
            errorDiv.textContent = `Initialization Error: ${error.message}`;
            errorDiv.style.color = 'red'; errorDiv.style.padding = '10px';
            document.body.prepend(errorDiv);
            if(this.canvas) this.canvas.style.display = 'none';
        }
    }

    addInitialBlock() {
        const initialPosition = new THREE.Vector3(0, 0, 0);
        const initialOrientation = new THREE.Matrix4(); // 単位行列
        addBlock({ position: initialPosition, orientation: initialOrientation }); // DataManager経由で追加
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

        const currentMouse = getCurrentMouseCoords(); // InputHandlerからマウス座標取得

        if (getIsMouseOverCanvas()) { // マウスがCanvas上にあるか
            // 通常モードならプレビュー更新
            if (!isXmlEditModeActive() && !isDeleteModeActive()) {
                 updatePreviewBlock(currentMouse);
            } else {
                 setPreviewVisible(false); // 通常モード以外はプレビュー非表示
            }
            // XML編集モードなら面ハイライト更新
            if(isXmlEditModeActive()){
                highlightHoveredFace(currentMouse);
            } else {
                 clearFaceHighlight(); // XML編集モード以外は面ハイライト解除
            }
        } else { // マウスがCanvas外
            setPreviewVisible(false);
            clearFaceHighlight();
        }

        this.renderer.render(this.scene, this.camera);
    }
}