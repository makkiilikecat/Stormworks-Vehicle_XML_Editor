// src/app/App.js
import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import { initializeScene } from '../core/SceneSetup.js';
import { setupHelpers } from '../core/GridHelper.js';
import { initCameraControls, updateCameraControls } from '../core/CameraControls.js';
import { initInputHandler, getIsMouseOverCanvas, getCurrentMouseCoords } from '../controllers/InputHandler.js';
import { initPreviewController, updatePreviewBlock, setPreviewVisible } from '../controllers/PreviewController.js';
import { initializeAppState } from './AppState.js';
import { initBlockTransformController } from '../controllers/BlockTransformController.js';
import { initRaycastService } from '../services/RaycastService.js';
import { initBlockDataManager, addBlock } from '../models/BlockDataManager.js';
import { initViewUpdater } from '../core/ViewUpdater.js';
import { initSelectionController, addHighlightMeshToScene, clearFaceHighlight, highlightHoveredFace } from '../controllers/SelectionController.js'; // addHighlightMeshToScene追加
import { isXmlEditModeActive, isDeleteModeActive } from './AppState.js';


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
            initializeAppState();
            const { scene, camera, renderer } = initializeScene(this.canvas);
            this.scene = scene; this.camera = camera; this.renderer = renderer;

            initRaycastService(this.camera);
            initBlockDataManager(this.scene);
            initViewUpdater();
            setupHelpers(this.scene);
            initCameraControls(this.camera, this.renderer.domElement);

            // --- コントローラー初期化 ---
            initPreviewController(this.scene);
            initSelectionController(); // ★ まず初期化
            addHighlightMeshToScene(this.scene); // ★ ハイライトメッシュをシーンに追加
            initBlockTransformController();
            initInputHandler(this.renderer.domElement);

            this.addInitialBlock();
            window.addEventListener('resize', this.onWindowResize.bind(this));
            this.animate();
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
        TWEEN.update(performance.now());
        updateCameraControls(delta);

        // ★ InputHandlerから最新のマウス座標を取得してPreviewControllerに渡す
        const currentMouse = getCurrentMouseCoords();
        if (getIsMouseOverCanvas()) {
            // プレビュー更新は通常モードでのみ意味がある
            if (!isXmlEditModeActive() && !isDeleteModeActive()) {
                 updatePreviewBlock(currentMouse);
            }
            // XML編集モード中は面ハイライト更新
            if(isXmlEditModeActive()){
                highlightHoveredFace(currentMouse); // SelectionControllerの関数
            }
        } else {
            setPreviewVisible(false);
            clearFaceHighlight(); // Canvas外では面ハイライトも消す
        }

        this.renderer.render(this.scene, this.camera);
    }
}