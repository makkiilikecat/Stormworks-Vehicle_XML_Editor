/**
 * @fileoverview 画面左下の仮想ジョイスティックによるカメラ移動操作を処理します。
 */

import * as THREE from 'three';

// --- モジュール内変数 ---
let appState = null;
let cameraStickElement = null;
let stickHandleElement = null;
let isDraggingStick = false;
let stickPointerId = null;
let stickStartX = 0;
let stickStartY = 0;
let stickCurrentX = 0;
let stickCurrentY = 0;
let stickMaxDistance = 0;
let isStickCurrentlyVisible = true;

// --- 計算用一時変数 ---
const _forwardVector = new THREE.Vector3();
const _rightVector = new THREE.Vector3();
const _moveVector = new THREE.Vector3();

// --- 定数 ---
const MOVE_SPEED_FACTOR = 0.1;

// --- 初期化 ---
export function initializeCameraStick(appStateRef) {
    console.log("[CameraStick] 初期化中...");
    appState = appStateRef;
    cameraStickElement = document.getElementById('camera-stick');
    stickHandleElement = document.getElementById('stick-handle');
    if (!cameraStickElement || !stickHandleElement || !appState?.camera || !appState?.controls) { /* Error */ return; }
    stickMaxDistance = (cameraStickElement.offsetWidth / 2) - (stickHandleElement.offsetWidth / 2);
    if (stickMaxDistance <= 0) stickMaxDistance = 50;
    stickHandleElement.addEventListener('pointerdown', onStickDown);
    document.addEventListener('pointermove', onStickMove);
    document.addEventListener('pointerup', onStickUp);
    document.addEventListener('pointercancel', onStickUp);
    console.log("[CameraStick] 初期化完了。");
}

// --- 公開関数 (状態更新用) ---
export function setStickVisibility(isVisible) {
    isStickCurrentlyVisible = isVisible;
    if (!isVisible && isDraggingStick && stickPointerId !== null) {
        handleStickUp({ pointerId: stickPointerId }); // handleStickUp を直接呼び出すのは避けた方が良いかも
        // 代わりに resetStickState() のような関数を呼ぶ
        resetStickState(); // <<< 状態リセット関数呼び出しに変更
    }
}

// --- イベントハンドラ ---
function onStickDown(event) {
    if (!isStickCurrentlyVisible || isDraggingStick) return;
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    isDraggingStick = true;
    stickPointerId = event.pointerId;
    stickHandleElement.setPointerCapture(stickPointerId);
    stickHandleElement.style.cursor = 'grabbing';
    stickStartX = event.clientX;
    stickStartY = event.clientY;
    stickCurrentX = 0; stickCurrentY = 0;
    console.log("[CameraStick] ドラッグ開始");
    event.preventDefault();
    event.stopPropagation();
}

function onStickMove(event) {
    if (!isDraggingStick || event.pointerId !== stickPointerId) return;
    const deltaX = event.clientX - stickStartX;
    const deltaY = event.clientY - stickStartY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const angle = Math.atan2(deltaY, deltaX);
    const clampedDistance = Math.min(distance, stickMaxDistance);
    stickCurrentX = Math.cos(angle) * clampedDistance;
    stickCurrentY = Math.sin(angle) * clampedDistance;
    stickHandleElement.style.transform = `translate(${stickCurrentX}px, ${stickCurrentY}px)`;
}

function onStickUp(event) { // handleStickUp から onStickUp に名前変更 (イベントハンドラとして)
    if (!isDraggingStick || event.pointerId !== stickPointerId) return;
    resetStickState(); // 状態リセット処理を呼び出す
    console.log("[CameraStick] ドラッグ終了");
}

// ★追加: スティックの状態をリセットする内部関数
function resetStickState() {
    isDraggingStick = false;
    if (stickPointerId !== null && stickHandleElement) {
        try { // releasePointerCapture は失敗することがある
             stickHandleElement.releasePointerCapture(stickPointerId);
        } catch(e) { console.warn("[CameraStick] releasePointerCapture failed:", e.message); }
    }
    stickPointerId = null;
    if (stickHandleElement) {
        stickHandleElement.style.cursor = 'grab';
        stickHandleElement.style.transition = 'transform 0.1s ease-out';
        stickHandleElement.style.transform = 'translate(0px, 0px)';
        setTimeout(() => { if(stickHandleElement) stickHandleElement.style.transition = ''; }, 100);
    }
    stickCurrentX = 0;
    stickCurrentY = 0;
    // OrbitControls は常に有効なので、有効化処理は不要
}


// --- カメラ位置更新 ---
export function updateCameraPosition() {
    if (!appState?.camera || !isStickCurrentlyVisible) return;

    if (Math.abs(stickCurrentX) > 0.1 || Math.abs(stickCurrentY) > 0.1) {
        const moveXNormalized = stickCurrentX / stickMaxDistance;
        const moveYNormalized = stickCurrentY / stickMaxDistance;

        appState.camera.getWorldDirection(_forwardVector);
        // 右ベクトルは up x forward で計算 (これは左ベクトルになる)
        _rightVector.crossVectors(appState.camera.up, _forwardVector).normalize();

        _moveVector.set(0, 0, 0)
            .addScaledVector(_forwardVector, -moveYNormalized * MOVE_SPEED_FACTOR) // 前後 (変更なし)
            // ★修正: 左右移動の係数の符号を反転 (-moveXNormalized にする)
            .addScaledVector(_rightVector, -moveXNormalized * MOVE_SPEED_FACTOR);   // 左右

        appState.camera.position.add(_moveVector);
        if (appState.controls) {
             appState.controls.target.add(_moveVector); // target も一緒に動かす
        }
    }
}