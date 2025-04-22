/**
 * @fileoverview ブロックに対する主要な編集アクション（配置、削除）を実装します。
 * アンドゥ・リドゥのための履歴登録もここで行います。
 */

import * as THREE from 'three';
import { getSelectedBlocks, clearSelection } from './selectionState.js'; // ← 修正: selectionState からインポート
import { BlockData } from '../data/blockData.js';
import { addAction } from '../state/historyManager.js';
import { createBlockMesh } from '../rendering/blockRenderer.js';

/**
 * 指定された位置と向きで新しいブロックをワークベンチに配置します。
 * 内部データ配列と3Dシーンの両方を更新し、操作履歴を登録します。
 *
 * @param {THREE.Vector3} positionThreeJs - 配置する位置（Three.js座標系、整数座標）。
 * @param {THREE.Matrix4} orientationMatrix - 配置する向き（Three.js座標系、回転行列）。
 * @param {string} blockDefinitionId - 配置するブロックの種類ID (例: '01_block')。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この配列が変更されます)。
 * @param {THREE.Scene} scene - 3Dシーンオブジェクト。
 * @param {boolean} [isHistoryAction=false] - この関数がアンドゥ/リドゥ操作によって呼び出されたかを示すフラグ。trueの場合、履歴には追加しない。
 * @returns {BlockData | null} 配置に成功した場合は新しく作成されたBlockDataインスタンス、失敗した場合はnull。
 */
export function placeBlock(positionThreeJs, orientationMatrix, blockDefinitionId, loadedBlocks, scene, isHistoryAction = false) {
    // --- 配置位置の重複チェック ---
    // 指定された位置に既にブロックが存在しないかを確認
    const isOccupied = loadedBlocks.some(block => block.position.equals(positionThreeJs));
    if (isOccupied) {
        console.warn("配置しようとした位置は既に占有されています:", positionThreeJs);
        return null; // 配置失敗
    }

    // --- BlockDataインスタンスの作成 ---
    // 配置位置(Three.js座標系)をXML座標系に戻す ({x, y, z} オブジェクト)
    const positionXml = {
        x: Math.round(positionThreeJs.x),
        y: Math.round(positionThreeJs.y),
        z: Math.round(-positionThreeJs.z) // Z座標の符号を反転
    };

    // 新しいブロックデータを作成
    // 第3引数の rotationString はnull、第5引数で初期向きのMatrix4を渡す
    const newBlock = new BlockData(
        blockDefinitionId,
        positionXml, // XML座標系で渡す
        null,        // 回転行列文字列は不要
        "0",         // デフォルトの色情報（ペイント未実装のため）
        orientationMatrix // 初期向き（Three.js座標系）
    );

    // --- 内部データ配列の更新 ---
    loadedBlocks.push(newBlock);

    // --- 3Dシーンへのメッシュ追加 ---
    // ブロック定義に応じたメッシュを作成 (blockRendererの関数を使用)
    const mesh = createBlockMesh(newBlock);

    // メッシュの位置と向きをBlockDataから設定
    // (createBlockMesh内では設定されないため、ここで設定)
    mesh.position.copy(newBlock.position);       // 位置 (Three.js座標系)
    mesh.matrix.copy(newBlock.rotationMatrix);  // 回転/スケール/せん断 (Three.js座標系)
    mesh.matrix.setPosition(newBlock.position); // 行列にも位置情報を反映
    mesh.matrixWorldNeedsUpdate = true;         // ワールド行列の更新を強制

    // 作成したメッシュをシーンに追加
    scene.add(mesh);
    // 作成したメッシュへの参照をBlockDataに保持
    newBlock.mesh = mesh;

    console.log(`Block placed: ID ${newBlock.id}, Def: ${newBlock.definitionId} at (Three.js) ${positionThreeJs.x},${positionThreeJs.y},${positionThreeJs.z}`);

    // --- アンドゥ履歴の登録 ---
    // アンドゥ/リドゥ操作による呼び出しでない場合のみ履歴に追加
    if (!isHistoryAction) {
        addAction({
            type: 'ADD_BLOCK',   // アクションタイプ
            blockData: newBlock // 配置したブロックのデータ全体を保持
        });
    }

    return newBlock; // 配置成功、新しいBlockDataを返す
}


/**
 * 指定されたBlockDataオブジェクトをワークベンチから削除します。
 * 内部データ配列と3Dシーンの両方から削除し、操作履歴を登録します。
 *
 * @param {BlockData} blockDataToDelete - 削除対象のブロックデータ。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この配列が変更されます)。
 * @param {THREE.Scene} scene - 3Dシーンオブジェクト。
 * @param {boolean} [isHistoryAction=false] - この関数がアンドゥ/リドゥ操作によって呼び出されたかを示すフラグ。trueの場合、履歴には追加しない。
 * @returns {boolean} 削除が成功した場合はtrue、失敗した場合はfalse。
 */
export function deleteBlock(blockDataToDelete, loadedBlocks, scene, isHistoryAction = false) {
    // 削除対象のデータが存在するかチェック
    if (!blockDataToDelete) {
        console.warn("削除対象のブロックが指定されていません。");
        return false;
    }

    // --- アンドゥ履歴の登録 ---
    // アンドゥ/リドゥ操作による呼び出しでない場合のみ履歴に追加
    // 削除を実行する前に、元に戻せるように削除対象のデータを保存する
    if (!isHistoryAction) {
        // 注意: blockDataToDeleteを直接保持すると、後で変更される可能性があるため、
        //       必要な情報をコピーするか、シリアライズ可能な形式で保持するのが望ましい。
        //       今回は、mesh参照を除いた簡易コピーを保持する。
        //       undo時にはこの情報を使ってBlockDataを（必要なら）再生成する。
        const deletedBlockDataCopy = {
             // BlockDataのプロパティをコピー
             id: blockDataToDelete.id,
             definitionId: blockDataToDelete.definitionId,
             position: blockDataToDelete.position.clone(), // Vector3はクローン
             rotationMatrix: blockDataToDelete.rotationMatrix.clone(), // Matrix4はクローン
             colorIndices: [...blockDataToDelete.colorIndices], // 配列はコピー
             mesh: null // メッシュへの参照は含めない
             // 必要に応じて他のプロパティもコピー
         };
        addAction({
            type: 'DELETE_BLOCK',       // アクションタイプ
            blockData: deletedBlockDataCopy // 削除したブロックの情報
        });
    }

    // --- 内部データ配列から削除 ---
    const index = loadedBlocks.findIndex(block => block.id === blockDataToDelete.id);
    if (index !== -1) {
        loadedBlocks.splice(index, 1); // 配列から削除
    } else {
        // 配列内に見つからない場合も、シーンからの削除は試みる (エラーリカバリ)
        console.warn(`削除対象のブロック (ID: ${blockDataToDelete.id}) が loadedBlocks 配列内に見つかりません。`);
    }

    // --- 3Dシーンからメッシュを削除 & リソース解放 ---
    if (blockDataToDelete.mesh) {
        const mesh = blockDataToDelete.mesh;
        scene.remove(mesh); // シーンから削除

        // メッシュが使用していたジオメトリとマテリアルを破棄(dispose)
        // ジオメトリはキャッシュ管理されているので、ここでは破棄しない
        // if (mesh.geometry) mesh.geometry.dispose();
        // マテリアルは個別にクローンされているので破棄する
        if (mesh.material) {
            if (!Array.isArray(mesh.material)) {
                mesh.material.dispose();
            } else {
                // 万が一マテリアルが配列の場合
                mesh.material.forEach(m => m.dispose());
            }
        }
        console.log(`Block mesh (ID: ${blockDataToDelete.id}) removed and material disposed.`);
        // 削除後、BlockDataに残っているmesh参照をクリアする (任意だが推奨)
        blockDataToDelete.mesh = null;
    } else {
        console.warn(`削除対象のブロック (ID: ${blockDataToDelete.id}) に対応するメッシュが見つかりません。`);
    }

    // --- 選択状態の解除 ---
    // 削除したブロックが選択されていた場合、選択をクリアする
    if (getSelectedBlocks()?.id === blockDataToDelete.id) {
        clearSelection(); // selectionHandlerの関数を呼び出す
    }
    // 複数選択の場合も考慮するなら、選択リストから削除する処理が必要だが、
    // clearSelection() は全解除なので、現状はこれで問題ない。
    // 将来的に選択中のブロックを個別に削除できるようにする場合は要調整。

    console.log(`Block (ID: ${blockDataToDelete.id}, Def: ${blockDataToDelete.definitionId}) deleted.`);
    return true; // 削除成功
}