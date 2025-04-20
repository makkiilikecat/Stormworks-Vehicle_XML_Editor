// src/models/MatrixUtils.js
import * as THREE from 'three';
import { MIN_THICKNESS } from '../app/Constants.js'; // ★ MIN_THICKNESS をインポート

const translation = new THREE.Matrix4();
const _vec = new THREE.Vector3();

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

/**
 * ★ 新規: 行列から指定された軸の基底ベクトル（列）を取得します。
 * @param {THREE.Matrix4} matrix - 対象の行列
 * @param {number} axisIndex - 0: X軸, 1: Y軸, 2: Z軸
 * @param {THREE.Vector3} targetVector - 結果を格納するベクトル (省略可能)
 * @returns {THREE.Vector3} 基底ベクトル
 */
export function getBasisVector(matrix, axisIndex, targetVector = new THREE.Vector3()) {
    const te = matrix.elements;
    const offset = axisIndex * 4;
    return targetVector.set(te[offset + 0], te[offset + 1], te[offset + 2]);
}

/**
 * ★ 新規: 行列の指定された軸の基底ベクトル（列）を設定します（要素は整数化）。
 * @param {THREE.Matrix4} matrix - 対象の行列 (変更されます)
 * @param {number} axisIndex - 0: X軸, 1: Y軸, 2: Z軸
 * @param {THREE.Vector3} vector - 設定するベクトル
 */
export function setBasisVector(matrix, axisIndex, vector) {
    const te = matrix.elements;
    const offset = axisIndex * 4;
    // 要素を整数に丸めて設定
    te[offset + 0] = Math.round(vector.x);
    te[offset + 1] = Math.round(vector.y);
    te[offset + 2] = Math.round(vector.z);
}

/**
 * ★ 修正: 行列の回転・スケール・せん断部分の要素を整数に丸め、
 * さらに各基底ベクトルの長さが MIN_THICKNESS 未満にならないようにクランプします。
 * (サンプルからの移植・統合)
 * @param {THREE.Matrix4} matrix - 対象の行列 (変更されます)
 */
export function roundMatrixElements(matrix) {
    const te = matrix.elements;

    // 1. 要素を整数に丸める
    te[0] = Math.round(te[0]); te[1] = Math.round(te[1]); te[2] = Math.round(te[2]);
    te[4] = Math.round(te[4]); te[5] = Math.round(te[5]); te[6] = Math.round(te[6]);
    te[8] = Math.round(te[8]); te[9] = Math.round(te[9]); te[10] = Math.round(te[10]);
    te[3] = 0; te[7] = 0; te[11] = 0; // アフィン変換維持 (位置部分は変えない)

    // 2. 丸めた後、各基底ベクトルの長さをチェックし、必要なら MIN_THICKNESS にクランプ
    for (let i = 0; i < 3; i++) {
        const basis = getBasisVector(matrix, i, _vec);
        const lengthSq = basis.lengthSq();

        if (lengthSq < MIN_THICKNESS * MIN_THICKNESS) {
            if (lengthSq > 1e-9) { // ほぼゼロでなければ方向を維持
                basis.setLength(MIN_THICKNESS);
            } else { // ゼロベクトルになった場合
                basis.set(0,0,0).setComponent(i, MIN_THICKNESS); // 軸方向に最小厚み
            }
            setBasisVector(matrix, i, basis); // クランプしたベクトルを書き戻す(整数とは限らない)
        }
    }
    // 再度整数化するかは要検討 (Stormworksが最終的に整数のみなら必要？)
    // → 整数化を setBasisVector に任せる現状維持
}