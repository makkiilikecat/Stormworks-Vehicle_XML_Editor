/**
 * @fileoverview ドラッグによるブロック変形（せん断・伸縮）の計算ロジック。
 */
import * as THREE from 'three';
import { getBasisVector, setBasisVector, roundAndClampMatrix, getLocalAxisInfoFromWorldNormal, getFaceCenterWorld, MIN_VOLUME_THRESHOLD, MIN_THICKNESS } from '../utils/mathUtils.js';
import { dragState } from './dragState.js'; // 状態オブジェクトをインポート

// --- 計算用一時変数 ---
const _vec = new THREE.Vector3();
const _vec2 = new THREE.Vector3();
const _vec3 = new THREE.Vector3();
const raycaster = new THREE.Raycaster(); // Raycasterはここでも使う可能性あり

/**
 * マウス座標からのレイと指定された平面との交点を計算します。
 * @param {THREE.Vector2} mouseCoords - 正規化デバイス座標。
 * @param {THREE.Plane} plane - 交差対象の平面。
 * @param {THREE.Camera} camera - カメラ。
 * @param {THREE.Vector3} target - 結果を格納するベクトル。
 * @returns {THREE.Vector3 | null} 交点座標、交差しない場合は null。
 */
function intersectPlane(mouseCoords, plane, camera, target) {
    raycaster.setFromCamera(mouseCoords, camera);
    return raycaster.ray.intersectPlane(plane, target);
}

/**
 * せん断変形を計算し、dragState.currentTransformedMatrix を更新します。
 * @param {THREE.Camera} camera - カメラ。
 */
export function applyShearTransform(camera) {
    const { faceInfo, dragStartPointOnPlane, currentMouseNDC, initialBlockMatrix, dragPlaneCameraNormal } = dragState;
    if (!faceInfo?.axisInfo || !dragStartPointOnPlane) return;

    // カメラ垂直平面上の現在の交点を計算
    const currentPointOnPlane = intersectPlane(currentMouseNDC, dragPlaneCameraNormal, camera, _vec);
    if (!currentPointOnPlane) return;

    // ドラッグベクトルを計算
    const dragVector = _vec2.copy(currentPointOnPlane).sub(dragStartPointOnPlane);
    // 開始時の行列をコピーして変形を適用
    const matrixToUpdate = dragState.currentTransformedMatrix.copy(initialBlockMatrix);
    const normalAxisIndex = faceInfo.axisInfo.axisIndex;
    const sign = faceInfo.axisInfo.sign;
    const normalBasis = getBasisVector(matrixToUpdate, normalAxisIndex, _vec3);

    // 変形を適用
    normalBasis.addScaledVector(dragVector, sign);
    setBasisVector(matrixToUpdate, normalAxisIndex, normalBasis);

    // 体積チェック (縮退防止)
    if (Math.abs(matrixToUpdate.determinant()) < MIN_VOLUME_THRESHOLD) {
        console.warn("Shear resulted in near-zero volume. Limiting.");
        // 変形を取り消す（開始時の行列に戻す）
        dragState.currentTransformedMatrix.copy(initialBlockMatrix);
    }
    // currentTransformedMatrix は更新された (dragStateオブジェクトのプロパティ)
}

/**
 * 伸縮変形を計算し、dragState.currentTransformedMatrix を更新します。
 * @param {THREE.Camera} camera - カメラ。
 */
export function applyStretchTransform(camera) {
    const { faceInfo, currentMouseNDC, lastMouseNDC } = dragState;
    const STRETCH_SENSITIVITY = 10.0; // 感度
    if (!faceInfo?.axisInfo) return;

    // スクリーンのマウス移動量からワールド空間の移動ベクトルを計算
    const deltaX = currentMouseNDC.x - lastMouseNDC.x;
    const deltaY = currentMouseNDC.y - lastMouseNDC.y;
    const cameraRight = _vec.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const cameraUp = _vec2.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const screenMoveVector = _vec3.set(0,0,0).addScaledVector(cameraRight, deltaX).addScaledVector(cameraUp, deltaY);

    // 移動ベクトルを面の法線方向に射影
    const mouseMoveAlongNormal = screenMoveVector.dot(faceInfo.normal);
    const stretchAmount = mouseMoveAlongNormal * STRETCH_SENSITIVITY;

    // 現在の変形中行列を取得して変更
    const matrixToUpdate = dragState.currentTransformedMatrix; // 直接参照を変更
    const normalAxisIndex = faceInfo.axisInfo.axisIndex;
    const basisVector = getBasisVector(matrixToUpdate, normalAxisIndex, _vec);
    const currentLength = basisVector.length();

    if (currentLength < 1e-6) return; // ほぼゼロベクトルなら処理中断

    // 新しい長さを計算し、最小厚みでクランプ
    let newLength = currentLength + stretchAmount;
    newLength = Math.max(MIN_THICKNESS, newLength);

    // 長さが変化した場合のみ更新
    if (Math.abs(newLength - currentLength) > 1e-6) {
        basisVector.setLength(newLength); // 新しい長さを設定
        setBasisVector(matrixToUpdate, normalAxisIndex, basisVector); // 行列に書き戻す

        // 体積チェック
        if (Math.abs(matrixToUpdate.determinant()) < MIN_VOLUME_THRESHOLD) {
             console.warn("Stretch resulted in near-zero volume. Limiting.");
             // 変形を元に戻す
             basisVector.setLength(currentLength);
             setBasisVector(matrixToUpdate, normalAxisIndex, basisVector);
        }
    }
    // currentTransformedMatrix は直接更新された
}