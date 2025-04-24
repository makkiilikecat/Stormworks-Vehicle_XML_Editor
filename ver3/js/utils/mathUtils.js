/**
 * @fileoverview 算術演算、ベクトル・行列操作などのユーティリティ関数を提供します。
 * 【主な変更点】
 * - `getTAttributeMatrix` の switch 文をユーザー指定の値に修正。
 */
import * as THREE from 'three';

export const BLOCK_SIZE = 1.0;
export const MIN_THICKNESS = 0.001;
export const MIN_VOLUME_THRESHOLD = 1e-4; // 体積チェック用

/**
 * 行列から指定された軸の基底ベクトルを取得します (列ベクトル)。
 * @param {THREE.Matrix4} matrix
 * @param {number} axisIndex - 0:X, 1:Y, 2:Z
 * @param {THREE.Vector3} [targetVector=new THREE.Vector3()]
 * @returns {THREE.Vector3}
 */
export function getBasisVector(matrix, axisIndex, targetVector = new THREE.Vector3()) {
    // (変更なし)
    const te = matrix.elements;
    const offset = axisIndex * 4;
    return targetVector.set(te[offset + 0], te[offset + 1], te[offset + 2]);
}

/**
 * 行列の指定された軸の基底ベクトルを設定します (列ベクトル)。
 * @param {THREE.Matrix4} matrix - 変更される行列
 * @param {number} axisIndex - 0:X, 1:Y, 2:Z
 * @param {THREE.Vector3} vector
 */
export function setBasisVector(matrix, axisIndex, vector) {
    // (変更なし)
    const te = matrix.elements;
    const offset = axisIndex * 4;
    te[offset + 0] = vector.x; te[offset + 1] = vector.y; te[offset + 2] = vector.z;
    te[3] = 0; te[7] = 0; te[11] = 0; te[15] = 1;
}

/**
 * 行列の回転・スケール・せん断部分の要素を整数に丸め、
 * さらに各基底ベクトルの長さが MIN_THICKNESS 未満にならないようにクランプします。
 * @param {THREE.Matrix4} matrix - 変更される行列
 */
export function roundAndClampMatrix(matrix) {
    // (変更なし)
    const te = matrix.elements;
    const _vec = new THREE.Vector3();
    te[0] = Math.round(te[0]); te[1] = Math.round(te[1]); te[2] = Math.round(te[2]);
    te[4] = Math.round(te[4]); te[5] = Math.round(te[5]); te[6] = Math.round(te[6]);
    te[8] = Math.round(te[8]); te[9] = Math.round(te[9]); te[10] = Math.round(te[10]);
    te[3] = 0; te[7] = 0; te[11] = 0; te[15] = 1;
    for (let i = 0; i < 3; i++) {
        const basis = getBasisVector(matrix, i, _vec);
        const lengthSq = basis.lengthSq();
        if (lengthSq < MIN_THICKNESS * MIN_THICKNESS) {
            if (lengthSq > 1e-9) basis.setLength(MIN_THICKNESS);
            else basis.set(0, 0, 0).setComponent(i, MIN_THICKNESS);
            setBasisVector(matrix, i, basis);
        }
    }
}

/**
 * ワールド空間の法線からローカル軸情報 {axisIndex, sign} を取得 (サンプルHTMLから移植)。
 * @param {THREE.Vector3} worldNormal
 * @param {THREE.Matrix4} objectMatrix
 * @returns {{axisIndex: number, sign: number}}
 */
export function getLocalAxisInfoFromWorldNormal(worldNormal, objectMatrix) {
    // (変更なし)
    const localNormal = worldNormal.clone();
    const _quat = new THREE.Quaternion(); const _vec = new THREE.Vector3();
    objectMatrix.decompose(new THREE.Vector3(), _quat, new THREE.Vector3());
    const invQuat = _quat.invert();
    localNormal.applyQuaternion(invQuat).normalize();
    let maxDot = -1, axisIndex = 0, sign = 1;
    for (let i = 0; i < 3; i++) {
        _vec.set(0, 0, 0).setComponent(i, 1);
        const dot = localNormal.dot(_vec);
        const absDot = Math.abs(dot);
        if (absDot > maxDot) { maxDot = absDot; axisIndex = i; sign = Math.sign(dot) || 1; }
    }
    return { axisIndex, sign };
}

/**
 * 指定されたローカル軸情報に基づいて、面のワールド中心座標を計算 (サンプルHTMLから移植)。
 * @param {THREE.Matrix4} objectMatrix
 * @param {{axisIndex: number, sign: number}} axisInfo
 * @returns {THREE.Vector3}
 */
export function getFaceCenterWorld(objectMatrix, axisInfo) {
     // (変更なし)
    const localCenter = new THREE.Vector3();
    const _basisVec = new THREE.Vector3();
    const basis = getBasisVector(objectMatrix, axisInfo.axisIndex, _basisVec);
    const thickness = Math.max(basis.length(), MIN_THICKNESS);
    localCenter.setComponent(axisInfo.axisIndex, axisInfo.sign * thickness / 2);
    return localCenter.applyMatrix4(objectMatrix);
}

/**
 * ★修正: t属性値 (0-7) に対応する変換行列 (スケールによる反転) を返します。
 * ユーザー指定の定義に基づいて修正。
 * @param {number} tValue - t属性値 (0-7)。
 * @returns {THREE.Matrix4} 対応する変換行列。無効な値の場合は単位行列。
 */
export function getTAttributeMatrix(tValue) {
    const matrix = new THREE.Matrix4(); // 単位行列として初期化
    switch (tValue) {
        case 0: matrix.makeScale( 1,  1,  1); break; // {+X,+Y,+Z}
        case 1: matrix.makeScale(-1,  1,  1); break; // {-X,+Y,+Z}
        case 2: matrix.makeScale( 1, -1,  1); break; // {+X,-Y,+Z} - ユーザー定義
        case 3: matrix.makeScale(-1, -1,  1); break; // {-X,-Y,+Z} - ユーザー定義
        case 4: matrix.makeScale( 1,  1, -1); break; // {+X,+Y,-Z} - ユーザー定義
        case 5: matrix.makeScale(-1,  1, -1); break; // {-X,+Y,-Z} - ユーザー定義
        case 6: matrix.makeScale( 1, -1, -1); break; // {+X,-Y,-Z} - ユーザー定義
        case 7: matrix.makeScale(-1, -1, -1); break; // {-X,-Y,-Z} - ユーザー定義
        default:
            console.warn(`[mathUtils] 無効なt属性値 ${tValue} が指定されました。単位行列を使用します。`);
            matrix.makeScale(1, 1, 1); // 安全のため単位行列
            break;
    }
    return matrix;
}