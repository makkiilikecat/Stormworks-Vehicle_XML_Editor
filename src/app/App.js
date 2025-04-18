// src/app/App.js (新規)
import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import { initializeScene } from '../core/SceneSetup.js';
import { setupHelpers } from '../core/GridHelper.js';
import { initCameraControls, updateCameraControls } from '../core/CameraControls.js';
import { initInputHandler, getIsMouseOverCanvas } from '../controllers/InputHandler.js';
import { initPreviewController, updatePreviewBlock, setPreviewVisible } from '../controllers/PreviewController.js';
import { initPlacementController, placeBlock as placeNewBlock } from '../controllers/PlacementController.js';
import { initializeAppState } from './AppState.js'; // 同じ階層
import { initDeletionController } from '../controllers/DeletionController.js';
import { initSelectionController } from '../controllers/SelectionController.js';
import { initBlockTransformController } from '../controllers/BlockTransformController.js';

export class App {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) throw new Error(`Canvas element #${canvasId} not found.`);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();
        this.placedBlocks = []; // アプリケーションの主データ
    }

    init() {
        initializeAppState(); // アプリ状態初期化

        const { scene, camera, renderer } = initializeScene(this.canvas);
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        setupHelpers(this.scene);
        initCameraControls(this.camera, this.renderer.domElement);

        // 各コントローラーを初期化し、必要な依存関係を渡す
        initPreviewController(this.camera, this.scene);
        initPlacementController(this.scene, this.placedBlocks);
        initDeletionController(this.scene, this.placedBlocks);
        initSelectionController(this.camera, this.placedBlocks); // ★追加
        initBlockTransformController(this.placedBlocks); // ★追加
        initInputHandler(this.renderer.domElement, this.camera, this.scene, this.placedBlocks);

        this.addInitialBlock();

        window.addEventListener('resize', this.onWindowResize.bind(this));
        this.animate(); // アニメーションループ開始
    }

    addInitialBlock() {
        const initialPosition = new THREE.Vector3(0, 0, 0);
        const initialMatrix = new THREE.Matrix4().setPosition(initialPosition);
        placeNewBlock(initialPosition, initialMatrix); // PlacementController の関数を使用
        console.log("Initial block placed.");
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
        updateCameraControls(delta); // カメラ更新

        // プレビュー更新 (メインループで行う)
        if (getIsMouseOverCanvas()) { // isMouseOverCanvas は InputHandler から取得
            updatePreviewBlock(this.placedBlocks);
        } else {
            setPreviewVisible(false);
        }

        this.renderer.render(this.scene, this.camera);
    }
}