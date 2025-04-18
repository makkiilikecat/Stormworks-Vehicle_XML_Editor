import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let camera, controls;
const moveSpeed = 0.05;
const moveState = { forward: 0, backward: 0, left: 0, right: 0 };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const rightVector = new THREE.Vector3();

/**
 * OrbitControlsとWASD移動によるカメラ制御を初期化します。
 * マウス: 右ドラッグ=回転, 中ドラッグ=パン, ホイール=ズーム
 * キーボード: WASD=移動
 * @param {THREE.PerspectiveCamera} cam - 操作対象のカメラ
 * @param {HTMLCanvasElement} domElement - イベントリスナーを設定する要素 (通常はcanvas)
 */
function initCameraControls(cam, domElement) {
    camera = cam;
    controls = new OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.mouseButtons = {
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE
    };
    controls.enableKeys = false;
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
}

function onKeyDown(event) {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';
    if (isInputFocused) return;
    switch (event.code) {
        case 'KeyW': moveState.forward = 1; break;
        case 'KeyS': moveState.backward = 1; break;
        case 'KeyA': moveState.left = 1; break;
        case 'KeyD': moveState.right = 1; break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveState.forward = 0; break;
        case 'KeyS': moveState.backward = 0; break;
        case 'KeyA': moveState.left = 0; break;
        case 'KeyD': moveState.right = 0; break;
    }
}

/**
 * 毎フレーム呼び出され、カメラの位置とOrbitControlsの状態を更新します。
 * @param {number} delta - 前フレームからの経過時間 (秒)
 */
function updateCameraControls(delta) {
    const hasMoved = moveState.forward || moveState.backward || moveState.left || moveState.right;

    if (hasMoved) {
        camera.getWorldDirection(direction);
        rightVector.crossVectors(camera.up, direction).normalize();
        velocity.set(0, 0, 0);

        if (moveState.forward) velocity.add(direction);
        if (moveState.backward) velocity.sub(direction);

        // --- 左右移動の修正 ---
        // Aキー(左移動)で右ベクトルを加算 (以前は減算)
        if (moveState.left) velocity.add(rightVector);
        // Dキー(右移動)で右ベクトルを減算 (以前は加算)
        if (moveState.right) velocity.sub(rightVector);
        // --- 修正ここまで ---

        velocity.normalize().multiplyScalar(moveSpeed * delta * 60);
        camera.position.add(velocity);
        controls.target.add(velocity);
    }

    controls.update(delta);
}

export { initCameraControls, updateCameraControls };