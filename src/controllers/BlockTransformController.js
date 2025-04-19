// src/controllers/BlockTransformController.js
import * as THREE from 'three';
import { getSelectedBlockId, isXmlEditModeActive } from '../app/AppState.js';
import { X_AXIS, Y_AXIS, Z_AXIS, ROTATION_ANGLE } from '../app/Constants.js';
import { getBlockById, updateBlockTransform } from '../models/BlockDataManager.js'; // DataManager利用
import { getBasisVector, setBasisVector, roundMatrixElements } from '../models/MatrixUtils.js';

const rotationMatrix = new THREE.Matrix4(); // 計算用
const translationMatrix = new THREE.Matrix4();

// --- 計算用ヘルパー変数 ---
const _vec = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _invMatrix = new THREE.Matrix4();

/**
 * BlockTransformControllerを初期化します。
 */
export function initBlockTransformController() {
    // 特に初期化処理は不要だが、将来的な拡張のために用意
    console.log("BlockTransformController initialized.");
}

/**
 * ★新規: 面を押し引き(Stretch)してブロックを変形します。
 * @param {string} blockId - 対象ブロックID
 * @param {THREE.Vector3} faceNormalWorld - 操作面のワールド法線ベクトル
 * @param {number} dragAmount - 法線方向へのドラッグ量 (正が押し込み、負が引っ張りなど調整必要)
 */
export function stretchBlock(blockId, faceNormalWorld, dragAmount) {
    const blockData = getBlockById(blockId);
    if (!blockData) return;

    const orientation = blockData.orientation;
    orientation.decompose(new THREE.Vector3(), _quat, _scale); // 現在の回転とスケールを取得
    _invMatrix.copy(orientation).invert(); // 向きだけの逆行列

    // ワールド法線をオブジェクトローカル座標系での軸に変換
    const localNormal = faceNormalWorld.clone().applyMatrix4(_invMatrix).normalize();

    // ローカル法線に最も近い軸(X, Y, Z)を特定
    let axisIndex = 0; // 0:X, 1:Y, 2:Z
    let maxDot = -1;
    for (let i = 0; i < 3; i++) {
        const dot = Math.abs(localNormal.getComponent(i));
        if (dot > maxDot) {
            maxDot = dot;
            axisIndex = i;
        }
    }

    // 対応する基底ベクトルを取得
    const basisVector = getBasisVector(orientation, axisIndex, _vec);
    const currentLength = basisVector.length();
    // ★ ドラッグ量から新しい整数スケールを計算 (感度調整が必要)
    // 例: 1ブロック分(0.25m)ドラッグしたら長さが1増える、など
    const sensitivity = 4.0; // 1mドラッグで長さ4増える
    const newLength = Math.max(1, Math.round(currentLength + dragAmount * sensitivity)); // 最低1

    // 基底ベクトルを新しい長さにスケーリング（整数化はsetBasisVectorで行う）
    basisVector.normalize().multiplyScalar(newLength);
    setBasisVector(orientation, axisIndex, basisVector); // 行列に設定 (内部で整数化)
    // roundMatrixElements(orientation); // 念のため全体も整数化

    updateBlockTransform(blockId, blockData.position, orientation); // DataManagerに更新依頼
}

/**
 * ★新規: 面をずらして(Shear)ブロックを変形します。
 * @param {string} blockId - 対象ブロックID
 * @param {THREE.Vector3} faceNormalWorld - 操作面のワールド法線ベクトル
 * @param {THREE.Vector3} dragVectorWorld - 面に平行なワールド空間でのドラッグベクトル
 */
export function shearBlock(blockId, faceNormalWorld, dragVectorWorld) {
    const blockData = getBlockById(blockId);
    if (!blockData) return;

    const orientation = blockData.orientation;
    orientation.decompose(new THREE.Vector3(), _quat, _scale);
    _invMatrix.copy(orientation).invert();

    const localNormal = faceNormalWorld.clone().applyMatrix4(_invMatrix).normalize();
    const localDrag = dragVectorWorld.clone().applyMatrix4(_invMatrix); // ドラッグベクトルもローカルに

    let normalAxisIndex = 0; // 法線が向いている軸
    let maxDot = -1;
    // ... (法線に近い軸を特定するロジック - stretchBlockと同様) ...
     for (let i = 0; i < 3; i++) { /* ... */ }

    // 法線以外の2軸を取得
    const otherAxes = [0, 1, 2].filter(i => i !== normalAxisIndex);
    const axis1Index = otherAxes[0];
    const axis2Index = otherAxes[1];

    // ローカルドラッグベクトルを他の2軸に射影し、整数化
    const shearAmount1 = Math.round(localDrag.getComponent(axis1Index));
    const shearAmount2 = Math.round(localDrag.getComponent(axis2Index));

    // 対応する基底ベクトルを取得
    const normalBasis = getBasisVector(orientation, normalAxisIndex, _vec);
    const basis1 = getBasisVector(orientation, axis1Index, new THREE.Vector3());
    const basis2 = getBasisVector(orientation, axis2Index, new THREE.Vector3());

    // 法線基底ベクトルに、他の基底ベクトル*ずれ量を加算
    normalBasis.addScaledVector(basis1, shearAmount1);
    normalBasis.addScaledVector(basis2, shearAmount2);

    // 新しい法線基底ベクトルを設定 (内部で整数化)
    setBasisVector(orientation, normalAxisIndex, normalBasis);
    // roundMatrixElements(orientation); // 念のため

    updateBlockTransform(blockId, blockData.position, orientation);
}

/**
 * JKLキー入力に基づいて、選択中のブロックを回転させます。
 * @param {string} keyCode - 押されたキーのコード ('KeyJ', 'KeyK', 'KeyL')
 * @returns {boolean} 回転が実行されたかどうか
 */
export function handleRotationInput(keyCode) {
    if (!isXmlEditModeActive()) return false; // XML編集モードでのみ有効
    const selectedId = getSelectedBlockId();
    if (!selectedId) return false; // ブロック未選択

    const blockData = getBlockById(selectedId); // DataManagerからデータ取得
    if (!blockData) return false;

    let axis = null;
    let angle = 0;

    switch (keyCode) {
        case 'KeyJ': axis = X_AXIS; angle = -ROTATION_ANGLE; break; // Pitch
        case 'KeyK': axis = Y_AXIS; angle = ROTATION_ANGLE; break;  // Yaw
        case 'KeyL': axis = Z_AXIS; angle = ROTATION_ANGLE; break;  // Roll
        default: return false;
    }

    console.log(`Rotating block ${selectedId} around ${keyCode}`);

    // 新しい姿勢を計算
    const newOrientation = blockData.orientation.clone(); // 現在の姿勢をコピー
    rotationMatrix.makeRotationAxis(axis, angle);
    newOrientation.premultiply(rotationMatrix); // ワールド基準で回転

    // ★ DataManager に更新を依頼 (ViewUpdaterがメッシュ更新を担当)
    updateBlockTransform(selectedId, blockData.position, newOrientation);

    return true; // 回転実行
}

// メッシュ更新は ViewUpdater が行うため、このコントローラーでは不要になった
// function updateMeshMatrix(blockData) { /* ... */ }