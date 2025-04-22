/**
 * @fileoverview ブロックの回転および反転操作に関するロジックを提供します。
 * 個別ブロックの行列操作と、複数ブロックのグループ操作（中心基準）を扱います。
 * クリップボード操作で利用するため、基本変換行列をエクスポートします。
 */

import * as THREE from 'three';
// 状態管理: アンドゥ履歴登録のため
import { addAction } from '../state/historyManager.js';
// データ: ブロック定義情報（オフセット取得のため）
import { getBlockDefinition } from '../data/blockDefinitions.js';

// =============================================================================
// --- 定数定義 ---
// =============================================================================
const DEG90 = Math.PI / 2; // 90度 (ラジアン)

// =============================================================================
// --- 事前計算された基本変換行列 (エクスポート) ---
// これらはローカル座標系での回転・反転を表します。
// =============================================================================
/** Jキー: ローカルX軸周り -90度回転 (Pitch Down) */
export const rotJMatrix = new THREE.Matrix4().makeRotationX(-DEG90);
/** Kキー: ローカルY軸周り -90度回転 (Yaw Left) */
export const rotKMatrix = new THREE.Matrix4().makeRotationY(-DEG90);
/** Lキー: ローカルZ軸周り -90度回転 (Roll Left) */
export const rotLMatrix = new THREE.Matrix4().makeRotationZ(-DEG90);
/** Uキー: ローカルX軸ミラー (左右反転) */
export const flipUMatrix = new THREE.Matrix4().makeScale(-1, 1, 1);
/** Iキー: ローカルY軸ミラー (上下反転) */
export const flipIMatrix = new THREE.Matrix4().makeScale(1, -1, 1);
/** Oキー: ローカルZ軸ミラー (前後反転) */
export const flipOMatrix = new THREE.Matrix4().makeScale(1, 1, -1);

// =============================================================================
// --- 計算用一時変数 (メモリ確保削減) ---
// =============================================================================
const _center = new THREE.Vector3();           // グループ中心座標
const _inverseCenter = new THREE.Vector3();    // 中心を原点に移動させるベクトル
const _transformMatrix = new THREE.Matrix4();  // グループ全体の変換行列
const _translateToOrigin = new THREE.Matrix4();// 原点への移動行列
const _rotateOrFlip = new THREE.Matrix4();     // 操作(回転/反転)行列
const _translateBack = new THREE.Matrix4();    // 元の位置に戻す移動行列
const _tPos = new THREE.Matrix4();             // 位置設定用一時行列
const _tOff = new THREE.Matrix4();             // オフセット用一時行列

// =============================================================================
// --- 個別ブロック操作関数 ---
// =============================================================================

/**
 * 指定された行列 (通常は BlockData.rotationMatrix) に、
 * ローカル座標系での回転を適用します (指定キーに対応)。
 * 行列は直接変更されます。
 * @param {THREE.Matrix4} currentMatrix - 変更される回転行列。
 * @param {'J' | 'K' | 'L'} key - 回転キー。
 */
export function applyRotation(currentMatrix, key) {
    let rotationMatrix;
    switch (key) {
        case 'J': rotationMatrix = rotJMatrix; break;
        case 'K': rotationMatrix = rotKMatrix; break;
        case 'L': rotationMatrix = rotLMatrix; break;
        default:
             console.warn(`[RotationHandler] applyRotation: 無効なキー ${key}`);
             return;
    }
    // currentMatrix = rotationMatrix * currentMatrix (ローカル回転)
    currentMatrix.premultiply(rotationMatrix);
}

/**
 * 指定された行列 (通常は BlockData.rotationMatrix) に、
 * ローカル座標系での反転（ミラー）を適用します (指定キーに対応)。
 * 行列は直接変更されます。
 * @param {THREE.Matrix4} currentMatrix - 変更される回転行列。
 * @param {'U' | 'I' | 'O'} key - 反転キー。
 */
export function applyFlip(currentMatrix, key) {
    let flipMatrix;
    switch (key) {
        case 'U': flipMatrix = flipUMatrix; break;
        case 'I': flipMatrix = flipIMatrix; break;
        case 'O': flipMatrix = flipOMatrix; break;
        default:
             console.warn(`[RotationHandler] applyFlip: 無効なキー ${key}`);
             return;
    }
    // currentMatrix = flipMatrix * currentMatrix (ローカル反転)
    currentMatrix.premultiply(flipMatrix);
}

// =============================================================================
// --- グループ操作関数 (選択中のBlockData用) ---
// =============================================================================

/**
 * 指定されたブロック群全体 (BlockData配列) を、そのグループの中心周りに
 * 回転または反転させます。
 * 各ブロックの位置 (`position`) と向き (`rotationMatrix`) の両方が更新され、
 * 操作はアンドゥ履歴に登録されます。
 * @param {BlockData[]} blocksToTransform - 操作対象のBlockData配列。
 * @param {'J'|'K'|'L'|'U'|'I'|'O'} key - 操作キー。
 * @param {object} appState - アプリケーション状態 (現状未使用)。
 * @returns {boolean} 操作が成功した場合は true、対象がない場合は false。
 */
export function transformGroup(blocksToTransform, key, appState) {
    // 操作対象ブロックがない場合は何もしない
    if (!blocksToTransform || blocksToTransform.length === 0) {
        console.log("[RotationHandler] transformGroup: 対象ブロックがありません。");
        return false;
    }

    // 1. グループの中心座標を計算
    _center.set(0, 0, 0); // 中心座標ベクトルをリセット
    blocksToTransform.forEach(block => _center.add(block.position)); // 全ブロックの位置を加算
    _center.divideScalar(blocksToTransform.length); // ブロック数で割って平均（中心）を求める
    _inverseCenter.copy(_center).negate(); // 中心を原点に移動させるための逆ベクトル
    // console.log("[RotationHandler] Group center:", _center);

    // 2. 操作に応じた基本変換行列を取得
    let operationMatrixSource; // J/K/L/U/I/Oに応じた回転または反転行列
    switch (key) {
        case 'J': operationMatrixSource = rotJMatrix; break;
        case 'K': operationMatrixSource = rotKMatrix; break;
        case 'L': operationMatrixSource = rotLMatrix; break;
        case 'U': operationMatrixSource = flipUMatrix; break;
        case 'I': operationMatrixSource = flipIMatrix; break;
        case 'O': operationMatrixSource = flipOMatrix; break;
        default:
            console.warn(`[RotationHandler] transformGroup: 無効なキー ${key}`);
            return false; // 未知のキーの場合は終了
    }
    _rotateOrFlip.copy(operationMatrixSource); // 計算用変数にコピー

    // 3. グループ全体に適用する最終的な変換行列を計算
    //    FinalTransform = Translate(center) * RotateOrFlip * Translate(-center)
    _translateToOrigin.makeTranslation(_inverseCenter.x, _inverseCenter.y, _inverseCenter.z);
    _translateBack.makeTranslation(_center.x, _center.y, _center.z);
    _transformMatrix
        .copy(_translateBack)      // 最後に中心位置に戻す
        .multiply(_rotateOrFlip)   // 中心周りで回転/反転
        .multiply(_translateToOrigin); // 最初に中心を原点へ移動

    // 4. アンドゥ履歴用の情報を準備
    const transformations = []; // 各ブロックの変更前後の状態を格納
    blocksToTransform.forEach(block => {
        // ワールド行列 (位置*回転) を保存する方がアンドゥ/リドゥが確実
        const oldWorldMatrix = new THREE.Matrix4();
        oldWorldMatrix.copy(_tPos.makeTranslation(block.position.x, block.position.y, block.position.z)).multiply(block.rotationMatrix);
        transformations.push({
            blockId: block.id,
            // oldPosition: block.position.clone(), // 使わない
            // oldMatrix: block.rotationMatrix.clone(), // 使わない
            oldWorldMatrix: oldWorldMatrix, // 変更前のワールド行列を保存
            newWorldMatrix: null            // 適用後に設定
        });
    });

    // 5. 各ブロックに変換を適用
    blocksToTransform.forEach((block, index) => {
        // a) 新しい位置を計算: newPos = FinalTransform * oldPos
        block.position.applyMatrix4(_transformMatrix);
        block.position.round(); // 整数座標に丸める

        // b) 新しい回転行列を計算: newRot = RotateOrFlip * oldRot
        block.rotationMatrix.premultiply(_rotateOrFlip); // ローカル回転/反転を適用

        // c) 履歴情報に適用後のワールド行列を記録
        const newWorldMatrix = new THREE.Matrix4();
        newWorldMatrix.copy(_tPos.makeTranslation(block.position.x, block.position.y, block.position.z)).multiply(block.rotationMatrix);
        transformations[index].newWorldMatrix = newWorldMatrix;

        // d) 対応する3Dメッシュも更新 (即時反映のため)
        block.updateMeshMatrix(); // BlockData内のメソッドを呼び出す
    });

    // 6. アンドゥ履歴にグループ操作として登録
    addAction({
        type: 'TRANSFORM_GROUP', // アクションタイプ
        transformations: transformations // 位置と行列の変更情報を含む配列
    });

    console.log(`[RotationHandler] ${blocksToTransform.length} 個のブロックをグループ ${key} で変形しました。`);
    return true; // 成功
}