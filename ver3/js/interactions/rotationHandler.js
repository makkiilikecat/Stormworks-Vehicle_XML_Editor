/**
 * @fileoverview ブロックの回転および反転操作に関するロジックを提供します。
 * 個別ブロックの行列操作と、複数ブロックのグループ操作（中心基準）を扱います。
 */

import * as THREE from 'three';
// --- 依存関係: アンドゥ履歴登録のため historyManager をインポート ---
import { addAction } from '../state/historyManager.js';
// --- 依存関係: メッシュ更新時にオフセット情報を参照するため blockDefinitions をインポート ---
import { getBlockDefinition } from '../data/blockDefinitions.js';

// =============================================================================
// --- 定数定義 ---
// =============================================================================

/** 90度をラジアンで表現 */
const DEG90 = Math.PI / 2;

// =============================================================================
// --- 事前計算された変換行列 ---
// =============================================================================
// これらはローカル座標系での操作を表す基本的な行列です。

/** Jキー: ピッチ (X軸周り -90度回転) */
const rotJMatrix = new THREE.Matrix4().makeRotationX(-DEG90);
/** Kキー: ヨー (Y軸周り -90度回転) */
const rotKMatrix = new THREE.Matrix4().makeRotationY(-DEG90);
/** Lキー: ロール (Z軸周り -90度回転) */
const rotLMatrix = new THREE.Matrix4().makeRotationZ(-DEG90);

/** Uキー: 左右反転 (X軸ミラー, ローカルX座標を-1倍) */
const flipUMatrix = new THREE.Matrix4().makeScale(-1, 1, 1);
/** Iキー: 上下反転 (Y軸ミラー, ローカルY座標を-1倍) */
const flipIMatrix = new THREE.Matrix4().makeScale(1, -1, 1);
/** Oキー: 前後反転 (Z軸ミラー, ローカルZ座標を-1倍) */
const flipOMatrix = new THREE.Matrix4().makeScale(1, 1, -1);

// =============================================================================
// --- 計算用一時変数 (メモリ確保削減のため) ---
// =============================================================================
// 関数内で繰り返し使われるVector3やMatrix4はここで宣言しておくと効率が良いです。
const _center = new THREE.Vector3();
const _inverseCenter = new THREE.Vector3();
const _transformMatrix = new THREE.Matrix4();
const _translateToOrigin = new THREE.Matrix4();
const _rotateOrFlip = new THREE.Matrix4();
const _translateBack = new THREE.Matrix4();
const _newPos = new THREE.Vector3();
const _newMatrix = new THREE.Matrix4();
const _tPos = new THREE.Matrix4();
const _tOff = new THREE.Matrix4();

// =============================================================================
// --- 個別ブロック操作関数 ---
// =============================================================================

/**
 * 指定された行列に、ローカル座標系での回転を適用します (指定キーに対応)。
 * この関数は行列を直接変更します。
 * @param {THREE.Matrix4} currentMatrix - 現在の向きを表す行列 (これが変更されます)。
 * @param {'J' | 'K' | 'L'} key - 回転キー ('J', 'K', 'L')。
 */
export function applyRotation(currentMatrix, key) {
    let rotationMatrix;
    switch (key) {
        case 'J': rotationMatrix = rotJMatrix; break;
        case 'K': rotationMatrix = rotKMatrix; break;
        case 'L': rotationMatrix = rotLMatrix; break;
        default:
            console.warn(`applyRotation: 無効なキー ${key}`);
            return; // 不明なキーは無視
    }
    // 現在の行列にローカル回転を左から乗算 (current = rotation * current)
    // これにより、オブジェクト自身の軸周りに回転します。
    currentMatrix.premultiply(rotationMatrix);
}

/**
 * 指定された行列に、ローカル座標系での反転（ミラー）を適用します (指定キーに対応)。
 * この関数は行列を直接変更します。
 * @param {THREE.Matrix4} currentMatrix - 現在の向きを表す行列 (これが変更されます)。
 * @param {'U' | 'I' | 'O'} key - 反転キー ('U', 'I', 'O')。
 */
export function applyFlip(currentMatrix, key) {
    let flipMatrix;
    switch (key) {
        case 'U': flipMatrix = flipUMatrix; break;
        case 'I': flipMatrix = flipIMatrix; break;
        case 'O': flipMatrix = flipOMatrix; break;
        default:
             console.warn(`applyFlip: 無効なキー ${key}`);
            return; // 不明なキーは無視
    }
    // 現在の行列にローカル反転(スケーリング)を左から乗算
    currentMatrix.premultiply(flipMatrix);
}

// =============================================================================
// --- グループ操作関数 (Stage 4.3で追加) ---
// =============================================================================

/**
 * 指定されたブロック群全体を、そのグループの中心周りに回転または反転させます。
 * 各ブロックの位置と回転行列の両方が更新され、操作はアンドゥ履歴に登録されます。
 *
 * @param {BlockData[]} blocksToTransform - 操作対象のBlockDataオブジェクトの配列。
 * @param {'J'|'K'|'L'|'U'|'I'|'O'} key - 実行する操作（回転または反転）を示すキー。
 * @param {object} appState - アプリケーションの状態オブジェクト (現状未使用だが将来的な拡張のため)。
 * @returns {boolean} 操作が正常に実行された場合は true、対象がない場合は false。
 */
export function transformGroup(blocksToTransform, key, appState) {
    // 操作対象ブロックがない場合は何もしない
    if (!blocksToTransform || blocksToTransform.length === 0) {
        console.log("transformGroup: No blocks selected.");
        return false;
    }

    // --- 1. グループの中心座標を計算 ---
    _center.set(0, 0, 0); // 中心座標ベクトルをリセット
    blocksToTransform.forEach(block => _center.add(block.position)); // 全ブロックの位置を加算
    _center.divideScalar(blocksToTransform.length); // ブロック数で割って平均（中心）を求める
    // 中心を原点に移動させるための逆ベクトル
    _inverseCenter.copy(_center).negate();
    console.log("Group center:", _center);

    // --- 2. 操作に応じた基本変換行列を取得 ---
    let operationMatrixSource; // J/K/L/U/I/Oに応じた回転または反転行列
    switch (key) {
        case 'J': operationMatrixSource = rotJMatrix; break;
        case 'K': operationMatrixSource = rotKMatrix; break;
        case 'L': operationMatrixSource = rotLMatrix; break;
        case 'U': operationMatrixSource = flipUMatrix; break;
        case 'I': operationMatrixSource = flipIMatrix; break;
        case 'O': operationMatrixSource = flipOMatrix; break;
        default:
            console.warn(`transformGroup: 無効なキー ${key}`);
            return false; // 未知のキーの場合は終了
    }
    _rotateOrFlip.copy(operationMatrixSource); // 計算用変数にコピー

    // --- 3. グループ全体に適用する最終的な変換行列を計算 ---
    //    (オブジェクトを原点中心に回転/反転させるのと同じ計算)
    //    FinalTransform = Translate(center) * RotateOrFlip * Translate(-center)
    _translateToOrigin.makeTranslation(_inverseCenter.x, _inverseCenter.y, _inverseCenter.z);
    _translateBack.makeTranslation(_center.x, _center.y, _center.z);
    _transformMatrix
        .copy(_translateBack)      // 最後に中心位置に戻す
        .multiply(_rotateOrFlip)   // 中心周りで回転/反転
        .multiply(_translateToOrigin); // 最初に中心を原点へ移動

    // --- 4. アンドゥ履歴用の情報を準備 ---
    const transformations = []; // 各ブロックの変更前後の状態を格納
    blocksToTransform.forEach(block => {
        transformations.push({
            blockId: block.id,
            oldPosition: block.position.clone(), // 変更前の位置をコピー
            oldMatrix: block.rotationMatrix.clone(), // 変更前の行列をコピー
            newPosition: null, // 適用後に設定
            newMatrix: null    // 適用後に設定
        });
    });

    // --- 5. 各ブロックに変換を適用 ---
    blocksToTransform.forEach((block, index) => {
        // a) 新しい位置を計算: newPos = FinalTransform * oldPos
        //    BlockDataのpositionを直接変更
        block.position.applyMatrix4(_transformMatrix);
        block.position.round(); // 整数座標に丸める

        // b) 新しい回転行列を計算: newRot = RotateOrFlip * oldRot
        //    BlockDataのrotationMatrixを直接変更
        block.rotationMatrix.premultiply(_rotateOrFlip); // ローカル回転/反転を適用

        // c) 履歴情報に適用後の状態を記録
        transformations[index].newPosition = block.position.clone();
        transformations[index].newMatrix = block.rotationMatrix.clone();

        // d) 対応する3Dメッシュも更新 (存在すれば)
        if (block.mesh) {
             // メッシュのワールド行列を再計算して直接設定
             const definition = getBlockDefinition(block.definitionId);
             const offset = definition.offset || [0,0,0];
             _tPos.makeTranslation(block.position.x, block.position.y, block.position.z);
             _tOff.makeTranslation(offset[0], offset[1], offset[2]);
             block.mesh.matrix.copy(_tPos).multiply(block.rotationMatrix).multiply(_tOff);
             block.mesh.matrixWorldNeedsUpdate = true;
        }
         if (block.foregroundMesh) { // 前景キューブも更新 (オフセットなし)
             _tPos.makeTranslation(block.position.x, block.position.y, block.position.z);
             block.foregroundMesh.matrix.copy(_tPos).multiply(block.rotationMatrix);
             block.foregroundMesh.matrixWorldNeedsUpdate = true;
         }
    });

    // --- 6. アンドゥ履歴にグループ操作として登録 ---
    addAction({
        type: 'TRANSFORM_GROUP', // 新しいアクションタイプ
        transformations: transformations // 位置と行列の変更情報を含む配列
    });

    console.log(`${blocksToTransform.length} blocks transformed (group) with key: ${key}`);
    return true; // 成功
}