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
    const te = matrix.elements;
    const offset = axisIndex * 4;
    te[offset + 0] = vector.x; te[offset + 1] = vector.y; te[offset + 2] = vector.z;
    // アフィン変換形式を維持
    te[3] = 0; te[7] = 0; te[11] = 0; te[15] = 1;
}

/**
 * 行列の回転・スケール・せん断部分の要素を整数に丸め、
 * さらに各基底ベクトルの長さが MIN_THICKNESS 未満にならないようにクランプします。
 * @param {THREE.Matrix4} matrix - 変更される行列
 */
export function roundAndClampMatrix(matrix) {
    const te = matrix.elements;
    const _vec = new THREE.Vector3(); // 計算用一時ベクトル

    // 1. まず要素を整数に丸める
    te[0] = Math.round(te[0]); te[1] = Math.round(te[1]); te[2] = Math.round(te[2]);
    te[4] = Math.round(te[4]); te[5] = Math.round(te[5]); te[6] = Math.round(te[6]);
    te[8] = Math.round(te[8]); te[9] = Math.round(te[9]); te[10] = Math.round(te[10]);
    // te[12], te[13], te[14] (位置) は変更しない
    te[3] = 0; te[7] = 0; te[11] = 0; te[15] = 1;

    // 2. 丸めた後、各基底ベクトルの長さをチェックし、クランプ
    for (let i = 0; i < 3; i++) {
        const basis = getBasisVector(matrix, i, _vec);
        const lengthSq = basis.lengthSq();

        if (lengthSq < MIN_THICKNESS * MIN_THICKNESS) {
            if (lengthSq > 1e-9) {
                basis.setLength(MIN_THICKNESS);
            } else {
                basis.set(0, 0, 0).setComponent(i, MIN_THICKNESS);
            }
            // クランプしたベクトルを行列に書き戻す
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
    // (サンプルHTML内の同名関数と同じ実装)
    const localNormal = worldNormal.clone();
    const _quat = new THREE.Quaternion(); //一時変数
    const _vec = new THREE.Vector3(); //一時変数
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
     // (サンプルHTML内の同名関数と同じ実装)
    const localCenter = new THREE.Vector3();
    const _basisVec = new THREE.Vector3(); //一時変数
    const basis = getBasisVector(objectMatrix, axisInfo.axisIndex, _basisVec);
    const thickness = Math.max(basis.length(), MIN_THICKNESS);
    localCenter.setComponent(axisInfo.axisIndex, axisInfo.sign * thickness / 2);
    return localCenter.applyMatrix4(objectMatrix);
}