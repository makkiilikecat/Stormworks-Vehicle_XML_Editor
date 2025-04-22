/**
 * @fileoverview ブロックに対する主要な編集アクション（配置、削除）を実装します。
 * アンドゥ・リドゥのための履歴登録もここで行います (単一操作の場合)。
 */

import * as THREE from 'three';
// ★ 修正: 状態や定義をインポート
import { getSelectedBlocks, clearSelection } from './selectionState.js'; // 選択状態取得/クリア
import { BlockData } from '../data/blockData.js';          // ブロックデータクラス
import { getBlockDefinition } from '../data/blockDefinitions.js'; // ブロック定義取得
import { addAction } from '../state/historyManager.js';   // 履歴登録
import { createBlockMesh } from '../rendering/blockRenderer.js'; // メッシュ作成

/**
 * 指定された位置と向きで新しいブロックをワークベンチに配置します。
 * loadedBlocks 配列と 3D シーンの両方を更新します。
 * 複合操作 (ペーストなど) の一部として呼び出される場合は、内部での履歴登録を抑制できます。
 *
 * @param {THREE.Vector3} positionThreeJs - 配置位置 (Three.js 座標系、整数座標が期待される)。
 * @param {THREE.Matrix4} orientationMatrix - 配置向き (Three.js 回転行列)。
 * @param {string} blockDefinitionId - 配置するブロックの種類ID。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この配列が変更されます)。
 * @param {THREE.Scene} scene - 3Dシーンオブジェクト。
 * @param {boolean} [isHistoryAction=false] - 履歴操作または複合操作の一部か。trueの場合、履歴登録しない。
 * @returns {BlockData | null} 配置成功時は新しい BlockData インスタンス、失敗時は null。
 */
export function placeBlock(positionThreeJs, orientationMatrix, blockDefinitionId, loadedBlocks, scene, isHistoryAction = false) {
    // --- 配置位置の重複チェック ---
    // 同じ整数座標にブロックが既に存在するか確認
    const isOccupied = loadedBlocks.some(block => block.position.equals(positionThreeJs));
    if (isOccupied) {
        console.warn(`[BlockActions] 配置しようとした位置 ${positionThreeJs.x},${positionThreeJs.y},${positionThreeJs.z} は既に占有されています。`);
        return null; // 配置失敗
    }

    // --- BlockDataインスタンスの作成 ---
    // 位置を XML 座標系に戻して BlockData コンストラクタに渡す
    const positionXml = {
        x: Math.round(positionThreeJs.x),
        y: Math.round(positionThreeJs.y),
        z: Math.round(-positionThreeJs.z) // Z反転
    };
    // ★ BlockData コンストラクタ呼び出し時に初期 Matrix も渡す
    const newBlock = new BlockData(
        blockDefinitionId,
        positionXml,
        null, // rotationString は Matrix で指定するため不要
        "0",  // デフォルト色
        orientationMatrix // 初期向き Matrix4
    );

    // --- 内部データ配列の更新 ---
    loadedBlocks.push(newBlock);

    // --- 3Dシーンへのメッシュ追加 ---
    const mesh = createBlockMesh(newBlock); // 対応するメッシュを作成
    if (mesh) {
        newBlock.mesh = mesh;           // BlockData にメッシュ参照を保持
        scene.add(mesh);                // シーンに追加
        newBlock.updateMeshMatrix();    // メッシュの位置・向きを BlockData に合わせる
        console.log(`[BlockActions] ブロック配置完了: ID ${newBlock.id}, Def: ${newBlock.definitionId}`);
    } else {
        console.error(`[BlockActions] ブロック ID ${newBlock.id} のメッシュ作成に失敗しました。`);
        // メッシュ作成失敗時のエラー処理 (例: 追加したBlockDataを削除)
        const index = loadedBlocks.findIndex(b => b.id === newBlock.id);
        if (index > -1) loadedBlocks.splice(index, 1);
        return null; // 配置失敗
    }

    // --- アンドゥ履歴の登録 ---
    if (!isHistoryAction) {
        // 履歴には BlockData の基本情報をコピーして保存 (メッシュ参照は含めない)
        const addedBlockDataCopy = {
            id: newBlock.id,
            definitionId: newBlock.definitionId,
            position: newBlock.position.clone(),
            rotationMatrix: newBlock.rotationMatrix.clone(),
            colorIndices: [...newBlock.colorIndices],
            mesh: null, foregroundMesh: null
        };
        addAction({
            type: 'ADD_BLOCK',
            blockData: addedBlockDataCopy
        });
        console.log("[BlockActions] アンドゥ履歴 'ADD_BLOCK' を登録しました。");
    }

    return newBlock; // 配置成功
}


/**
 * 指定されたBlockDataオブジェクトをワークベンチから削除します。
 * loadedBlocks 配列と 3D シーンの両方から削除します。
 * 複合操作 (カットなど) の一部として呼び出される場合は、内部での履歴登録を抑制できます。
 *
 * @param {BlockData} blockDataToDelete - 削除対象のブロックデータ。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (変更対象)。
 * @param {THREE.Scene} scene - 3Dシーンオブジェクト。
 * @param {boolean} [isHistoryAction=false] - 履歴操作または複合操作の一部か。trueの場合、履歴登録しない。
 * @returns {boolean} 削除が成功した場合はtrue。
 */
export function deleteBlock(blockDataToDelete, loadedBlocks, scene, isHistoryAction = false) {
    if (!blockDataToDelete) {
        console.warn("[BlockActions] 削除対象のブロックが指定されていません。");
        return false;
    }

    // --- アンドゥ履歴の登録 ---
    let deletedBlockDataCopy = null;
    if (!isHistoryAction) {
        deletedBlockDataCopy = {
             id: blockDataToDelete.id,
             definitionId: blockDataToDelete.definitionId,
             position: blockDataToDelete.position.clone(),
             rotationMatrix: blockDataToDelete.rotationMatrix.clone(),
             colorIndices: [...blockDataToDelete.colorIndices],
             mesh: null, foregroundMesh: null
         };
        addAction({
            type: 'DELETE_BLOCK',
            blockData: deletedBlockDataCopy
        });
         console.log("[BlockActions] アンドゥ履歴 'DELETE_BLOCK' を登録しました。");
    }

    // --- 内部データ配列から削除 ---
    const index = loadedBlocks.findIndex(block => block.id === blockDataToDelete.id);
    if (index !== -1) {
        loadedBlocks.splice(index, 1); // 配列から削除
    } else {
        console.warn(`[BlockActions] 削除対象のブロック (ID: ${blockDataToDelete.id}) が loadedBlocks 配列内に見つかりません。`);
    }

    // --- 3Dシーンからメッシュを削除 & リソース解放 ---
    const meshToRemove = blockDataToDelete.mesh;
    const fgMeshToRemove = blockDataToDelete.foregroundMesh;

    // 通常メッシュの削除
    if (meshToRemove && meshToRemove.parent) {
        scene.remove(meshToRemove);
        if (meshToRemove.material && typeof meshToRemove.material.dispose === 'function') {
            const matName = meshToRemove.material.name || '';
            // クローンされたマテリアルのみ破棄 (ベースや共有マテリアルは除く)
            if(matName !== 'unknownMaterial' && !matName.includes('Base') && !matName.includes('ghost')) {
                 // console.log(`[BlockActions] Disposing material for mesh ID ${blockDataToDelete.id}`);
                 // meshToRemove.material.dispose(); // メモリリークの可能性があるので一旦コメントアウト解除を検討
            }
        }
        blockDataToDelete.mesh = null;
    }
    // 前景メッシュの削除
    if (fgMeshToRemove && fgMeshToRemove.parent) {
        scene.remove(fgMeshToRemove);
        if (fgMeshToRemove.material && typeof fgMeshToRemove.material.dispose === 'function') {
            // 前景マテリアルはクローンされているはずなので破棄
            fgMeshToRemove.material.dispose();
        }
        blockDataToDelete.foregroundMesh = null;
    }

    // --- 選択状態の解除 ---
    // 削除ブロックが選択されていたら選択解除 (現状は全解除)
    const currentSelection = getSelectedBlocks();
    if (currentSelection.some(b => b.id === blockDataToDelete.id)) {
        console.warn("[BlockActions] 削除されたブロックが選択されていました。選択をクリアします。");
        clearSelection(); // 全選択解除
        // 個別解除が必要な場合は selectionState にメソッド追加が必要
    }

    console.log(`[BlockActions] ブロック削除完了: ID ${blockDataToDelete.id}, Def: ${blockDataToDelete.definitionId}`);
    return true; // 削除成功
}