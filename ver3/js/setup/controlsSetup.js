import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * OrbitControls（視点操作）をセットアップします。
 * @param {THREE.Camera} camera - 操作対象のカメラ。
 * @param {HTMLElement} domElement - イベントリスナーを設定するDOM要素 (通常はレンダラーのCanvas)。
 * @returns {OrbitControls} セットアップされたOrbitControlsインスタンス。
 */
export function setupOrbitControls(camera, domElement) {
    const controls = new OrbitControls(camera, domElement);

    // --- 操作設定 ---
    controls.enableDamping = true; // 慣性を有効にする (滑らかな動き)
    controls.dampingFactor = 0.1;  // 慣性の強さ (小さいほど滑らか)
    controls.screenSpacePanning = false; // パン操作を地面基準にする (Trueだとスクリーン基準)
    controls.maxPolarAngle = Math.PI / 2; // 真下からの視点を制限 (地面の下に行かないように)
    controls.minDistance = 1;      // 最小ズーム距離
    controls.maxDistance = 500;    // 最大ズーム距離

    // --- マウスボタン割り当て ---
    controls.mouseButtons = {
        LEFT: null,                 // 左ドラッグは選択などに使うため、カメラ操作を無効化
        MIDDLE: THREE.MOUSE.PAN,    // 中（ホイール）ドラッグで視点移動 (パン)
        RIGHT: THREE.MOUSE.ROTATE   // 右ドラッグで視点回転 (オービット)
    };
    // ホイールでのズームはデフォルトで有効

    return controls;
}