import * as THREE from 'three';
import { getSelectedBlocks, clearSelection } from './selectionHandler.js';
import { BlockData } from '../data/blockData.js';
// アンドゥ履歴追加関数をインポート
import { addAction } from '../state/historyManager.js';

/**
 * ブロックを配置し、履歴に登録します (isHistoryActionがfalseの場合)。
 * @param {THREE.Vector3} positionThreeJs - 配置位置 (Three.js座標系、整数座標)。
 * @param {THREE.Matrix4} orientationMatrix - 配置向き (Three.js座標系、回転行列)。
 * @param {string} blockDefinitionId - ブロック種類ID。
 * @param {BlockData[]} loadedBlocks - ブロックデータ配列 (変更されます)。
 * @param {THREE.Scene} scene - 3Dシーン。
 * @param {boolean} [isHistoryAction=false] - アンドゥ/リドゥ操作による呼び出しかどうか。
 * @returns {BlockData | null} 配置されたBlockData、またはnull。
 */
export function placeBlock(positionThreeJs, orientationMatrix, blockDefinitionId, loadedBlocks, scene, isHistoryAction = false) {
    // 配置先に既にブロックがないか最終確認
    const isOccupied = loadedBlocks.some(block => block.position.equals(positionThreeJs));
    if (isOccupied) {
        console.warn("配置しようとした位置は既に占有されています:", positionThreeJs);
        return null;
    }

    // BlockData生成用に座標をXML座標系に戻す
    const positionXml = {
        x: Math.round(positionThreeJs.x),
        y: Math.round(positionThreeJs.y),
        z: Math.round(-positionThreeJs.z) // Z座標の符号を反転して整数化
    };

    // 新しいBlockDataを作成
    const newBlock = new BlockData(
        blockDefinitionId,
        positionXml,
        null, // rotationString は不要
        "0",  // デフォルトの色
        orientationMatrix // 初期向きとして Matrix4 を渡す
    );

    // 内部データ配列に追加
    loadedBlocks.push(newBlock);

    // 3Dシーンに描画 (ここでは直接メッシュを作成・追加)
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x999999 }).clone(); // 個別マテリアル
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.isBlockMesh = true; // 識別用データ
    mesh.userData.blockId = newBlock.id; // ID紐付け

    // メッシュの位置・向きを設定
    mesh.position.copy(newBlock.position); // Three.js座標系
    mesh.matrix.copy(newBlock.rotationMatrix); // Three.js座標系
    mesh.matrix.setPosition(newBlock.position); // 行列の位置成分も設定
    mesh.matrixAutoUpdate = false; // 手動更新
    mesh.matrixWorldNeedsUpdate = true; // ワールド行列更新フラグ

    scene.add(mesh); // シーンに追加
    newBlock.mesh = mesh; // データとメッシュを紐付け

    console.log(`Block placed: ID ${newBlock.id}, Def: ${newBlock.definitionId} at (Three.js) ${positionThreeJs.x},${positionThreeJs.y},${positionThreeJs.z}`);

    // isHistoryActionがfalseの場合（＝通常操作の場合）のみ履歴に追加
    if (!isHistoryAction) {
        addAction({
            type: 'ADD_BLOCK',
            blockData: newBlock // 配置したブロックのデータを保持
        });
    }

    return newBlock;
}


/**
 * ブロックを削除し、履歴に登録します (isHistoryActionがfalseの場合)。
 * @param {BlockData} blockDataToDelete - 削除対象のブロックデータ。
 * @param {BlockData[]} loadedBlocks - ブロックデータ配列 (変更されます)。
 * @param {THREE.Scene} scene - 3Dシーン。
 * @param {boolean} [isHistoryAction=false] - アンドゥ/リドゥ操作による呼び出しかどうか。
 * @returns {boolean} 削除が成功した場合はtrue。
 */
export function deleteBlock(blockDataToDelete, loadedBlocks, scene, isHistoryAction = false) {
    if (!blockDataToDelete) {
        console.warn("削除対象のブロックが指定されていません。");
        return false;
    }

    // isHistoryActionがfalseの場合（＝通常操作の場合）のみ履歴に追加 (削除前に！)
    if (!isHistoryAction) {
        // 元に戻せるように、削除するブロックデータをコピーして保持
        // mesh参照は含めない（undo時にrenderBlocksで再生成される想定）
        const deletedBlockDataCopy = { ...blockDataToDelete, mesh: null };
         addAction({
            type: 'DELETE_BLOCK',
            blockData: deletedBlockDataCopy // 削除したブロックのデータを保持
        });
    }

    // 1. 内部データ配列から削除
    const index = loadedBlocks.findIndex(block => block.id === blockDataToDelete.id);
    if (index !== -1) {
        loadedBlocks.splice(index, 1); // 配列から削除
    } else {
        console.warn(`削除対象のブロック (ID: ${blockDataToDelete.id}) が loadedBlocks 配列内に見つかりません。`);
        // 見つからなくてもシーンからの削除は試みる（エラーリカバリ）
    }

    // 2. 3Dシーンからメッシュを削除し、リソースを解放
    if (blockDataToDelete.mesh) {
        const mesh = blockDataToDelete.mesh;
        scene.remove(mesh);

        // マテリアルは個別のインスタンスなのでdisposeする
        if (!Array.isArray(mesh.material)) {
            mesh.material.dispose();
        } else {
            // 万が一マテリアルが配列の場合
            mesh.material.forEach(m => m.dispose());
        }
        // ジオメトリは共有なのでdisposeしない
        console.log(`Block mesh (ID: ${blockDataToDelete.id}) removed and material disposed.`);
    } else {
        console.warn(`削除対象のブロック (ID: ${blockDataToDelete.id}) に対応するメッシュが見つかりません。`);
    }

    // 3. 削除したブロックが選択されていた場合、選択状態を解除
    if (getSelectedBlocks()?.id === blockDataToDelete.id) {
        clearSelection(); // selectionHandlerの関数を呼ぶ
    }

    console.log(`Block (ID: ${blockDataToDelete.id}, Def: ${blockDataToDelete.definitionId}) deleted.`);
    return true;
}