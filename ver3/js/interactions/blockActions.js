/**
 * @fileoverview ブロックに対する主要な編集アクション（配置、削除）を実装します。
 * これらのアクションは、内部のブロックデータ配列 (`loadedBlocks`) と3Dシーンを更新し、
 * 必要に応じてアンドゥ履歴への登録や、ブロック構成変更イベントの発行を行います。
 *
 * 依存関係:
 * - selectionState.js: 選択状態の取得やクリアに使用。
 * - blockData.js: BlockDataクラス定義。
 * - historyManager.js: アンドゥ履歴登録 (`addAction`) に使用。
 * - blockRenderer.js: メッシュ作成 (`createBlockMesh`) に使用。
 * - blockDefinitions.js: ブロック定義情報取得 (`getBlockDefinition`) に使用。
 */

import * as THREE from 'three';
// 選択状態の取得やクリアのために selectionState をインポート
import { getSelectedBlocks, clearSelection } from './selectionState.js';
// ブロックデータのクラス定義をインポート
import { BlockData } from '../data/blockData.js';
// 履歴管理システムのアクション追加関数をインポート
import { addAction } from '../state/historyManager.js';
// ブロックの種類に応じたメッシュを作成する関数をレンダラーからインポート
import { createBlockMesh } from '../rendering/blockRenderer.js';
// メッシュ更新時にオフセット情報を参照するため blockDefinitions をインポート
import { getBlockDefinition } from '../data/blockDefinitions.js';

/**
 * 指定された位置と向きで新しいブロックをワークベンチに配置します。
 * loadedBlocks 配列と 3D シーンの両方を更新します。
 * 履歴登録を制御し、操作完了後に 'blocksChanged' イベントを発行します。
 *
 * @param {THREE.Vector3} positionThreeJs - 配置する位置（Three.js座標系、整数座標であるべき）。
 * @param {THREE.Matrix4} orientationMatrix - 配置する向き（Three.js座標系、回転行列）。
 * @param {string} blockDefinitionId - 配置するブロックの種類ID (例: '01_block')。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この配列が直接変更されます)。
 * @param {THREE.Scene} scene - 3Dシーンオブジェクト (メッシュ追加用)。
 * @param {boolean} [isHistoryAction=false] - この関数がアンドゥ/リドゥ操作によって呼び出されたか、
 * または他の複合操作 (例: ペースト) の一部かを示すフラグ。
 * trueの場合、この関数内ではアンドゥ履歴登録とイベント発行を行いません。
 * @returns {BlockData | null} 配置に成功した場合は新しく作成されたBlockDataインスタンス、失敗した場合はnull。
 */
export function placeBlock(positionThreeJs, orientationMatrix, blockDefinitionId, loadedBlocks, scene, isHistoryAction = false) {
    // --- 1. 配置位置の重複チェック ---
    // 指定された整数座標に既にブロックが存在しないかを確認
    const isOccupied = loadedBlocks.some(block => block.position.equals(positionThreeJs));
    if (isOccupied) {
        // 既にブロックがある場合は警告を出し、配置失敗として null を返す
        console.warn(`[BlockActions] 配置しようとした位置 ${positionThreeJs.x},${positionThreeJs.y},${positionThreeJs.z} は既に占有されています。`);
        return null;
    }

    // --- 2. BlockDataインスタンスの作成 ---
    // コンストラクタはXML座標を期待するため、Three.js座標から変換
    const positionXml = {
        x: Math.round(positionThreeJs.x),
        y: Math.round(positionThreeJs.y),
        z: Math.round(-positionThreeJs.z) // Z座標の符号を反転
    };
    // BlockData オブジェクトを生成
    const newBlock = new BlockData(
        blockDefinitionId,
        positionXml,
        null, // rotationString は使わない
        "0", // colorString (デフォルト)
        orientationMatrix // 初期向きは Matrix4 で指定
    );

    // --- 3. 内部データ配列の更新 ---
    // アプリケーションのメインブロックリストに新しい BlockData を追加
    loadedBlocks.push(newBlock);

    // --- 4. 3Dシーンへのメッシュ追加 ---
    // ブロック定義に基づいて3Dメッシュを作成
    const mesh = createBlockMesh(newBlock);
    // 作成したメッシュへの参照を BlockData に保持
    newBlock.mesh = mesh;
    // シーンにメッシュを追加
    scene.add(mesh);
    // メッシュのワールド行列を BlockData の状態に合わせて更新
    newBlock.updateMeshMatrix();

    console.log(`[BlockActions] ブロック配置完了: ID ${newBlock.id}, Def: ${newBlock.definitionId}`);

    // --- 5. アンドゥ履歴登録とイベント発行 ---
    // 通常の配置操作の場合のみ実行 (Undo/Redo時や複合操作時はスキップ)
    if (!isHistoryAction) {
        // a) アンドゥ用に BlockData の情報をディープコピーして保存
        const addedBlockDataCopy = {
            id: newBlock.id,
            definitionId: newBlock.definitionId,
            position: newBlock.position.clone(),
            rotationMatrix: newBlock.rotationMatrix.clone(),
            colorIndices: [...newBlock.colorIndices],
            mesh: null, foregroundMesh: null // メッシュ参照は含めない
        };
        addAction({ type: 'ADD_BLOCK', blockData: addedBlockDataCopy });
        console.log("[BlockActions] アンドゥ履歴 'ADD_BLOCK' 登録。");

        // b) ブロック構成が変更されたことを通知するイベントを発行
        document.dispatchEvent(new CustomEvent('blocksChanged', { detail: { action: 'place', blockId: newBlock.id } }));
        console.log("[BlockActions] 'blocksChanged' イベント発行 (placeBlock)");
    }

    // 配置した BlockData インスタンスを返す
    return newBlock;
}


/**
 * 指定されたBlockDataオブジェクトをワークベンチから削除します。
 * loadedBlocks 配列と 3D シーンの両方から削除します。
 * 履歴登録を制御し、完了後に 'blocksChanged' イベントを発行します。
 *
 * @param {BlockData} blockDataToDelete - 削除対象のブロックデータ。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この配列が直接変更されます)。
 * @param {THREE.Scene} scene - 3Dシーンオブジェクト (メッシュ削除用)。
 * @param {boolean} [isHistoryAction=false] - この関数がアンドゥ/リドゥ操作によって呼び出されたか、
 * または他の複合操作 (例: カット) の一部かを示すフラグ。
 * trueの場合、この関数内ではアンドゥ履歴登録とイベント発行を行いません。
 * @returns {boolean} 削除が成功した場合はtrue、失敗した場合はfalse。
 */
export function deleteBlock(blockDataToDelete, loadedBlocks, scene, isHistoryAction = false) {
    // 削除対象が有効かチェック
    if (!blockDataToDelete) {
        console.warn("[BlockActions] 削除対象のブロックが指定されていません。");
        return false;
    }

    // --- 1. アンドゥ履歴の登録 (通常の削除操作の場合のみ) ---
    let deletedBlockDataCopy = null; // アンドゥ用に削除情報を保持
    if (!isHistoryAction) {
        // 削除するブロックの情報をディープコピーして保存
        deletedBlockDataCopy = {
             id: blockDataToDelete.id,
             definitionId: blockDataToDelete.definitionId,
             position: blockDataToDelete.position.clone(),
             rotationMatrix: blockDataToDelete.rotationMatrix.clone(),
             colorIndices: [...blockDataToDelete.colorIndices],
             mesh: null, foregroundMesh: null // メッシュ参照は不要
         };
        addAction({ type: 'DELETE_BLOCK', blockData: deletedBlockDataCopy });
        console.log("[BlockActions] アンドゥ履歴 'DELETE_BLOCK' 登録。");
    }

    // --- 2. 内部データ配列から削除 ---
    const index = loadedBlocks.findIndex(block => block.id === blockDataToDelete.id);
    if (index !== -1) {
        loadedBlocks.splice(index, 1); // spliceで元の配列から削除
    } else {
        console.warn(`[BlockActions] 削除対象のブロック (ID: ${blockDataToDelete.id}) が loadedBlocks 配列内に見つかりません。`);
        // 見つからなくても、シーンからのメッシュ削除は試みる
    }

    // --- 3. 3Dシーンからメッシュを削除 & リソース解放 ---
    const meshToRemove = blockDataToDelete.mesh;
    const fgMeshToRemove = blockDataToDelete.foregroundMesh;

    // 通常メッシュの削除
    if (meshToRemove && meshToRemove.parent) {
        scene.remove(meshToRemove);
        // クローンされたマテリアルのみ破棄 (共有マテリアルは破棄しない)
        if (meshToRemove.material && typeof meshToRemove.material.dispose === 'function') {
            const matName = meshToRemove.material.name || '';
            if(matName !== 'unknownMaterial' && !matName.includes('Base')) {
                 // meshToRemove.material.dispose(); // 再利用されるケースも考慮し一旦保留
            }
        }
        blockDataToDelete.mesh = null; // 参照をクリア
    }
    // 前景メッシュの削除 (XML編集モードで使用)
    if (fgMeshToRemove && fgMeshToRemove.parent) {
        scene.remove(fgMeshToRemove);
        if (fgMeshToRemove.material && typeof fgMeshToRemove.material.dispose === 'function') {
            fgMeshToRemove.material.dispose(); // 前景はクローンされているはずなので破棄
        }
        blockDataToDelete.foregroundMesh = null; // 参照をクリア
    }

    // --- 4. 選択状態の更新 ---
    // 削除したブロックが選択されていた場合、意図しない動作を防ぐために選択を解除する
    const currentSelection = getSelectedBlocks();
    if (currentSelection.some(b => b.id === blockDataToDelete.id)) {
        console.warn("[BlockActions] 削除されたブロックが選択されていました。選択状態をクリアします。");
        // TODO: より洗練された方法 (選択リストから該当IDのみ削除) を selectionState に実装する
        clearSelection(); // 現状は全選択解除で対応
    }

    console.log(`[BlockActions] ブロック削除完了: ID ${blockDataToDelete.id}, Def: ${blockDataToDelete.definitionId}`);

    // --- 5. イベント発行 (通常の削除操作の場合のみ) ---
    if (!isHistoryAction) {
        document.dispatchEvent(new CustomEvent('blocksChanged', { detail: { action: 'delete', blockId: blockDataToDelete.id } }));
        console.log("[BlockActions] 'blocksChanged' イベント発行 (deleteBlock)");
    }

    return true; // 削除成功
}