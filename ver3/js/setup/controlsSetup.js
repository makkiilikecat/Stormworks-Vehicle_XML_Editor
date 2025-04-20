import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * OrbitControls（視点操作）をセットアップします。
 * Y=0が中心の空間での操作に適した設定に変更します。
 * @param {THREE.Camera} camera - 操作対象のカメラ。
 * @param {HTMLElement} domElement - イベントリスナーを設定するDOM要素 (通常はレンダラーのCanvas)。
 * @returns {OrbitControls} セットアップされたOrbitControlsインスタンス。
 */
export function setupOrbitControls(camera, domElement) {
    const controls = new OrbitControls(camera, domElement);

    // --- 操作設定 ---
    controls.enableDamping = true; // 慣性を有効にする
    controls.dampingFactor = 0.1;  // 慣性の強さ

    // --- 修正点 ---
    // パン操作をスクリーン空間基準に変更 (Y方向への移動が可能になる)
    controls.screenSpacePanning = true;
    // 垂直角度の制限を解除 (真上・真下からの視点を許可)
    controls.minPolarAngle = 0; // 真上 (デフォルト)
    controls.maxPolarAngle = Math.PI; // 真下 (制限をπ=180度に設定)
    // ----------------

    // 水平角度の制限は設けない (デフォルト: 無限)
    // controls.minAzimuthAngle = - Infinity;
    // controls.maxAzimuthAngle = Infinity;

    controls.minDistance = 1;      // 最小ズーム距離
    controls.maxDistance = 500;    // 最大ズーム距離 (必要に応じて調整)

    // マウスボタン割り当て (変更なし)
    controls.mouseButtons = {
        LEFT: null,                 // 左ドラッグは選択などに使うため無効化
        MIDDLE: THREE.MOUSE.PAN,    // 中（ホイール）ドラッグで視点移動 (パン)
        RIGHT: THREE.MOUSE.ROTATE   // 右ドラッグで視点回転 (オービット)
    };

    // 注視点は原点(0,0,0)のまま
    // controls.target.set(0, 0, 0);

    return controls;
}