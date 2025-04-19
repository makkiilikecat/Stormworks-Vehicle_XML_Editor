// src/models/MatrixUtils.js
import * as THREE from 'three';

const translation = new THREE.Matrix4();

/**
 * 位置ベクトルと姿勢行列からワールド行列を合成します。
 * @param {THREE.Vector3} position - ワールド座標の位置
 * @param {THREE.Matrix4} orientation - 姿勢（回転・スケール）行列 (位置は(0,0,0)想定)
 * @param {THREE.Matrix4} targetMatrix - 結果を格納する行列 (省略可能)
 * @returns {THREE.Matrix4} 合成されたワールド行列
 */
export function composeWorldMatrix(position, orientation, targetMatrix = new THREE.Matrix4()) {
    translation.makeTranslation(position.x, position.y, position.z);
    return targetMatrix.multiplyMatrices(translation, orientation);
}

/**
 * ワールド行列を位置ベクトルと姿勢行列に分解します。
 * @param {THREE.Matrix4} worldMatrix - 分解するワールド行列
 * @returns {{position: THREE.Vector3, orientation: THREE.Matrix4, quaternion: THREE.Quaternion, scale: THREE.Vector3}}
 */
export function decomposeWorldMatrix(worldMatrix) {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    worldMatrix.decompose(position, quaternion, scale);
    const orientation = new THREE.Matrix4().compose(new THREE.Vector3(), quaternion, scale); // 位置0で再合成
    return { position, orientation, quaternion, scale };
}

/**
 * 行列の左上3x3要素をカンマ区切りのr属性文字列に変換します。
 * @param {THREE.Matrix4} matrix - 変換元の姿勢行列など
 * @returns {string} "r11,r12,r13,r21,r22,r23,r31,r32,r33" 形式の文字列
 */
export function matrixToRotationString(matrix) {
    const te = matrix.elements;
    // Stormworks は整数のみ？ 要確認。一旦そのまま出力。
    return [
        te[0], te[1], te[2],
        te[4], te[5], te[6],
        te[8], te[9], te[10]
    ].join(',');
}

/**
 * r属性文字列を行列(Matrix4)の左上3x3要素に設定します。
 * @param {string} rotationString - "r11,r12,..." 形式の文字列
 * @param {THREE.Matrix4} targetMatrix - 結果を格納する行列 (省略可能)
 * @returns {THREE.Matrix4} 設定された行列
 */
export function rotationStringToMatrix(rotationString, targetMatrix = new THREE.Matrix4()) {
    const values = rotationString.split(',').map(Number);
    if (values.length !== 9 || values.some(isNaN)) {
        console.error("Invalid rotation string:", rotationString);
        return targetMatrix.identity(); // エラー時は単位行列
    }
    targetMatrix.set(
        values[0], values[1], values[2], 0,
        values[3], values[4], values[5], 0,
        values[6], values[7], values[8], 0,
        0, 0, 0, 1
    );
    return targetMatrix;
}