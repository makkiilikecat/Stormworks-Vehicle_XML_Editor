// src/controllers/BlockTransformController.js
import * as THREE from 'three';
import { getSelectedBlockId, isXmlEditModeActive } from '../app/AppState.js';
import { X_AXIS, Y_AXIS, Z_AXIS, ROTATION_ANGLE, STRETCH_SENSITIVITY, SHEAR_SENSITIVITY, MIN_THICKNESS, MIN_VOLUME_THRESHOLD } from '../app/Constants.js';
import { getBlockById, updateBlockTransform } from '../models/BlockDataManager.js';
// MatrixUtils ヘルパーをインポート
import { getBasisVector, setBasisVector, roundMatrixElements } from '../models/MatrixUtils.js';

const rotationMatrix = new THREE.Matrix4(); // JKL回転用

// --- 計算用ヘルパー変数 ---
const _mat = new THREE.Matrix4();
const _vec = new THREE.Vector3();
const _vec2 = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(); // 分解用
const _invMatrix = new THREE.Matrix4();

// ★ 感度パラメータ (これらの値は操作感をみて調整してください)

/**
 * BlockTransformControllerを初期化します。
 */
export function initBlockTransformController() {
    console.log("BlockTransformController initialized.");
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
        default: return false; // JKL以外は無視
    }

    console.log(`Rotating block ${selectedId} around ${keyCode}`);
    rotateBlock(blockData, axis, angle); // 回転実行
    return true; // 回転が実行された
}

/**
 * 選択されたブロックの姿勢を更新します (アニメーションなし)。
 * @param {object} blockData - 回転させるブロックのデータ
 * @param {THREE.Vector3} axis - 回転軸 (ワールド)
 * @param {number} angle - 回転角度 (ラジアン)
 */
function rotateBlock(blockData, axis, angle) {
    // 回転行列を作成
    rotationMatrix.makeRotationAxis(axis, angle);
    // 現在の姿勢に左から乗算 (ワールド基準回転)
    const newOrientation = blockData.orientation.clone(); // 必ずクローンしてから変更
    newOrientation.premultiply(rotationMatrix);
    // roundMatrixElements(newOrientation); // 回転後は整数化不要？ スケール/せん断時に行う

    // DataManager に更新を依頼 (ViewUpdaterがメッシュ更新を担当)
    updateBlockTransform(blockData.id, blockData.position, newOrientation);
}

/**
 * 面を押し引き(Stretch)してブロックを変形します。
 * @param {string} blockId - 対象ブロックID
 * @param {THREE.Vector3} faceNormalWorld - 操作面のワールド法線ベクトル
 * @param {number} dragAmount - 法線方向へのドラッグ量 (ワールド単位、面の外向きが正)
 */
export function stretchBlock(blockId, faceNormalWorld, dragAmount) {
    const blockData = getBlockById(blockId);
    if (!blockData) return;

    const orientation = blockData.orientation.clone(); // 現在の姿勢をコピーして変更する

    // ワールド法線をオブジェクトのローカル座標系での主軸に変換・特定
    _invMatrix.copy(orientation).invert();
    const localNormal = faceNormalWorld.clone().applyMatrix4(_invMatrix).normalize();
    let axisIndex = 0; // 0:X, 1:Y, 2:Z
    let maxDot = -1;
    for (let i = 0; i < 3; i++) {
        // ローカル座標での軸ベクトルとの内積の絶対値で判断
        _vec.set(0, 0, 0).setComponent(i, 1); // ローカル軸ベクトル
        const dot = Math.abs(localNormal.dot(_vec));
        if (dot > maxDot) {
            maxDot = dot;
            axisIndex = i;
        }
    }

    // 対応する基底ベクトルを取得
    const basisVector = getBasisVector(orientation, axisIndex, _vec);
    const currentLength = basisVector.length();

    // ドラッグ量から新しい目標の長さを計算し、整数化 (最低1)
    const newLength = Math.max(1, Math.round(currentLength + dragAmount * STRETCH_SENSITIVITY));

    // 長さが変化した場合のみ更新
    if (Math.abs(newLength - currentLength) >= 0.5) { // 整数比較のため閾値0.5
        basisVector.normalize().multiplyScalar(newLength); // 新しい長さに
        setBasisVector(orientation, axisIndex, basisVector); // 行列に設定 (内部で整数化)
        // roundMatrixElements(orientation); // 他の要素も整数化？ 必要なら有効化

        updateBlockTransform(blockId, blockData.position, orientation); // DataManagerに更新依頼
    }
}


/**
 * 面をずらして(Shear)ブロックを変形します。
 * @param {string} blockId - 対象ブロックID
 * @param {THREE.Vector3} faceNormalWorld - 操作面のワールド法線ベクトル
 * @param {THREE.Vector3} dragVectorLocal - 面に平行なローカル座標系でのドラッグベクトル
 */
export function shearBlock(blockId, faceNormalWorld, dragVectorLocal) {
    const blockData = getBlockById(blockId);
    if (!blockData) return;

    const orientation = blockData.orientation.clone(); // 現在の姿勢をコピーして変更する

    // ワールド法線をローカル主軸に変換・特定 (stretchBlockと同様)
    _invMatrix.copy(orientation).invert();
    const localNormal = faceNormalWorld.clone().applyMatrix4(_invMatrix).normalize();
    let normalAxisIndex = 0;
    let maxDot = -1;
    for (let i = 0; i < 3; i++) {
        _vec.set(0, 0, 0).setComponent(i, 1);
        const dot = Math.abs(localNormal.dot(_vec));
        if (dot > maxDot) { maxDot = dot; normalAxisIndex = i; }
    }

    // 法線以外の2軸 (ずれ方向の軸) を特定
    const otherAxes = [0, 1, 2].filter(i => i !== normalAxisIndex);
    const axis1Index = otherAxes[0];
    const axis2Index = otherAxes[1];

    // ローカルドラッグベクトルと感度から整数ずれ量を計算
    const shearAmount1 = Math.round(dragVectorLocal.getComponent(axis1Index) * SHEAR_SENSITIVITY);
    const shearAmount2 = Math.round(dragVectorLocal.getComponent(axis2Index) * SHEAR_SENSITIVITY);

    // ずれがある場合のみ更新
    if (Math.abs(shearAmount1) > 1e-4 || Math.abs(shearAmount2) > 1e-4) {
        // 対応する基底ベクトルを取得
        const normalBasis = getBasisVector(orientation, normalAxisIndex, _vec);
        const basis1 = getBasisVector(orientation, axis1Index, new THREE.Vector3());
        const basis2 = getBasisVector(orientation, axis2Index, new THREE.Vector3());

        // 法線基底ベクトルに、他の基底ベクトル*整数ずれ量を加算 (せん断変形)
        normalBasis.addScaledVector(basis1, shearAmount1);
        normalBasis.addScaledVector(basis2, shearAmount2);

        // 新しい法線基底ベクトルを設定 (内部で整数化)
        setBasisVector(orientation, normalAxisIndex, normalBasis);
        // roundMatrixElements(orientation); // 他の要素も整数化

        updateBlockTransform(blockId, blockData.position, orientation); // DataManagerに更新依頼
    }
}

/**
 * ★ 修正: サンプルのロジックに基づき、面の押し引き(Stretch)を適用します。
 * リアルタイム表示用の非整数行列と、確定用の整数化・クランプ済み行列を計算します。
 * @param {string} blockId
 * @param {THREE.Matrix4} initialMatrix - ドラッグ開始時の行列
 * @param {THREE.Vector3} faceNormalWorld
 * @param {number} dragAmount - 法線方向のワールド空間でのドラッグ量
 * @returns {{realtimeMatrix: THREE.Matrix4, ghostMatrix: THREE.Matrix4} | null} 計算結果、適用不可ならnull
 */
export function calculateStretch(blockId, initialMatrix, faceNormalWorld, dragAmount) {
    const blockData = getBlockById(blockId); // 最新の位置情報を取得するため？ 不要かも
    if (!blockData) return null;

    const realtimeMatrix = initialMatrix.clone(); // 開始時行列をベースに
    const ghostMatrix = new THREE.Matrix4(); // 確定用

    // 法線に近いローカル軸を特定
    _invMatrix.copy(realtimeMatrix).invert();
    const localNormal = faceNormalWorld.clone().applyMatrix4(_invMatrix).normalize();
    let axisIndex = 0, maxDot = -1;
    for (let i = 0; i < 3; i++) { /* ... (軸特定) ... */ }

    // 基底ベクトルを取得し、新しい長さを計算
    const basisVector = getBasisVector(realtimeMatrix, axisIndex, _vec);
    const currentLength = basisVector.length();
    if (currentLength < 1e-6) return null; // ゼロベクトルは扱えない

    let newLength = currentLength + dragAmount * STRETCH_SENSITIVITY;
    newLength = Math.max(MIN_THICKNESS, newLength); // 最小厚みクランプ

    // リアルタイム用行列を更新 (非整数)
    basisVector.setLength(newLength);
    setBasisVector(realtimeMatrix, axisIndex, basisVector);

    // 確定用(ゴースト)行列を計算 (整数化・クランプ)
    ghostMatrix.copy(realtimeMatrix);
    roundMatrixElements(ghostMatrix); // 丸め＆再クランプ

    // 体積チェック (確定用行列で行う)
    if (Math.abs(ghostMatrix.determinant()) < MIN_VOLUME_THRESHOLD) {
        console.warn("Stretch resulted in near-zero volume. Operation limited.");
        return null; // 適用しない
    }

    return { realtimeMatrix, ghostMatrix };
}

/**
 * ★ 修正: サンプルのロジックに基づき、面のずらし(Shear)を適用します。
 * @param {string} blockId
 * @param {THREE.Matrix4} initialMatrix - ドラッグ開始時の行列
 * @param {THREE.Vector3} dragVectorWorld - カメラ垂直面上のワールド空間でのドラッグベクトル
 * @param {{axisIndex: number, sign: number}} axisInfo - 操作面のローカル軸情報
 * @returns {{realtimeMatrix: THREE.Matrix4, ghostMatrix: THREE.Matrix4} | null} 計算結果、適用不可ならnull
 */
export function calculateShear(blockId, initialMatrix, dragVectorWorld, axisInfo) {
    const blockData = getBlockById(blockId);
    if (!blockData || !axisInfo) return null;

    const realtimeMatrix = initialMatrix.clone(); // 開始時行列をベースに
    const ghostMatrix = new THREE.Matrix4(); // 確定用

    const normalAxisIndex = axisInfo.axisIndex;
    const sign = axisInfo.sign;

    // 対応する基底ベクトルにドラッグベクトルを加算 (感度調整はInputHandlerで行う？)
    // → サンプルの感度はStretchのみだったので、Shearは感度1で試す
    const normalBasis = getBasisVector(realtimeMatrix, normalAxisIndex, _vec);
    normalBasis.addScaledVector(dragVectorWorld, sign); // ワールドベクトルをそのまま適用
    setBasisVector(realtimeMatrix, normalAxisIndex, normalBasis);

    // 確定用(ゴースト)行列を計算
    ghostMatrix.copy(realtimeMatrix);
    roundMatrixElements(ghostMatrix);

    // 体積チェック
    if (Math.abs(ghostMatrix.determinant()) < MIN_VOLUME_THRESHOLD) {
        console.warn("Shear resulted in near-zero volume. Operation limited.");
        return null;
    }

    return { realtimeMatrix, ghostMatrix };
}