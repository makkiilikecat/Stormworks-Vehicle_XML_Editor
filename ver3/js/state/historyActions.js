/**
 * @fileoverview アンドゥ・リドゥの各アクションタイプに対応する具体的な状態変更処理。
 * historyManager.js から呼び出され、現在のブロックデータ配列やシーンを操作します。
 * このモジュール自体は履歴スタックを管理せず、純粋なアクションの実行を担当します。
 * シーンの再描画 (renderBlocks) は呼び出し元 (historyManager) が担当します。
 */

import * as THREE from 'three'; // Matrix4, Vector3, Quaternion のため
// BlockData クラス定義 (Undo/Redo で BlockData インスタンスを扱うため)
import { BlockData } from '../data/blockData.js';
// 単一ブロックの追加・削除処理 (Redo で使用する可能性がある)
// import { deleteBlock, placeBlock } from '../interactions/blockActions.js';

// --- 計算用一時変数 ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

/**
 * アクションを元に戻す処理 (アンドゥ) を実行します。
 * 状態 (loadedBlocks) の変更のみを行い、シーンの再描画は呼び出し元が担当します。
 * @param {object} action - 元に戻すアクションオブジェクト。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この配列が変更されます)。
 * @param {THREE.Scene} scene - 3Dシーン (主にメッシュリソースの破棄で使用)。
 * @returns {boolean} アクションの実行に成功した場合はtrue、失敗または未対応の場合はfalse。
 */
export function executeUndo(action, loadedBlocks, scene) {
    console.log('[HistoryActions] Undo 実行:', action.type);
    let success = true;

    switch (action.type) {
        // --- ブロック追加 (ADD_BLOCK) を元に戻す -> 対象ブロックを削除 ---
        case 'ADD_BLOCK':
            // action.blockData は追加された BlockData インスタンスのはず
            const indexToAddUndo = loadedBlocks.findIndex(b => b.id === action.blockData.id);
            if (indexToAddUndo > -1) {
                const blockToRemove = loadedBlocks[indexToAddUndo];
                // loadedBlocks 配列から削除
                loadedBlocks.splice(indexToAddUndo, 1);
                // 対応するメッシュのリソース破棄 (シーンからの削除は再描画時に行われる)
                // ただし、ここで破棄しておかないとメモリリークの可能性
                if (blockToRemove.mesh) {
                    if (blockToRemove.mesh.geometry) blockToRemove.mesh.geometry.dispose(); // 共有ジオメトリの場合は注意
                    if (blockToRemove.mesh.material) blockToRemove.mesh.material.dispose(); // クローンされたマテリアル想定
                }
                if (blockToRemove.foregroundMesh) { // 前景メッシュも同様
                     if (blockToRemove.foregroundMesh.geometry) blockToRemove.foregroundMesh.geometry.dispose();
                     if (blockToRemove.foregroundMesh.material) blockToRemove.foregroundMesh.material.dispose();
                }
                console.log(`[HistoryActions-Undo(ADD)] Block ID ${action.blockData.id} を削除しました。`);
            } else {
                console.warn(`[HistoryActions-Undo(ADD)] 元に戻す対象のブロック ID ${action.blockData.id} が見つかりません。`);
                success = false;
            }
            break;

        // --- ブロック削除 (DELETE_BLOCK) を元に戻す -> 対象ブロックを再追加 ---
        case 'DELETE_BLOCK':
            // action.blockData は削除されたブロック情報のコピー (mesh参照なし)
            // 同じIDのブロックが既に存在しないことを確認
            if (!loadedBlocks.find(b => b.id === action.blockData.id)) {
                // 削除されたデータ (単純なオブジェクト) を loadedBlocks に追加
                // BlockData インスタンスではないが、主要なプロパティを持つため、
                // renderBlocks がこれを元に新しい BlockData とメッシュを作成できる想定
                loadedBlocks.push(action.blockData);
                console.log(`[HistoryActions-Undo(DELETE)] Block ID ${action.blockData.id} を復元リストに追加しました。`);
            } else {
                console.warn(`[HistoryActions-Undo(DELETE)] 復元しようとしたブロック ID ${action.blockData.id} は既に存在します。`);
                success = false; // 予期せぬ状態
            }
            break;

        // --- カット操作 (CUT_BLOCKS) を元に戻す -> 削除されたブロック群を再追加 ---
        case 'CUT_BLOCKS':
            // action.deletedBlocksData は削除されたブロック情報のコピーの配列
            if (action.deletedBlocksData && Array.isArray(action.deletedBlocksData)) {
                let restoredCount = 0;
                action.deletedBlocksData.forEach(deletedInfo => {
                    // 同じIDが存在しないか確認して追加
                    if (!loadedBlocks.find(b => b.id === deletedInfo.id)) {
                        loadedBlocks.push(deletedInfo); // renderBlocks でメッシュ再生成
                        restoredCount++;
                    } else {
                         console.warn(`[HistoryActions-Undo(CUT)] 復元しようとしたブロック ID ${deletedInfo.id} は既に存在します。`);
                    }
                });
                console.log(`[HistoryActions-Undo(CUT)] ${restoredCount} / ${action.deletedBlocksData.length} 個のブロックを復元リストに追加しました。`);
                // 一つも復元できなかった場合に false とする (任意)
                if (restoredCount === 0 && action.deletedBlocksData.length > 0) success = false;
            } else {
                console.error("[HistoryActions-Undo(CUT)] アクションデータに deletedBlocksData がありません。", action);
                success = false;
            }
            break;

        // --- 変形操作 (TRANSFORM_BLOCKS, TRANSFORM_GROUP) を元に戻す ---
        case 'TRANSFORM_BLOCKS':
        case 'TRANSFORM_GROUP':
            // action.transformations 配列 [{ blockId, oldMatrix, newMatrix }, ...]
            if (action.transformations && Array.isArray(action.transformations)) {
                action.transformations.forEach(t => {
                    const block = loadedBlocks.find(b => b.id === t.blockId);
                    if (block) {
                        // 変更前のワールド行列 (oldMatrix) から位置と回転/スケールを復元
                        const oldPosition = _v1.setFromMatrixPosition(t.oldMatrix);
                        const oldQuaternion = _q1.setFromRotationMatrix(t.oldMatrix);
                        const oldScale = _v2.setFromMatrixScale(t.oldMatrix); // スケールも考慮
                        block.position.copy(oldPosition);
                        // rotationMatrix は回転とスケールのみを含むように再構成
                        block.rotationMatrix.compose(new THREE.Vector3(), oldQuaternion, oldScale);
                    } else {
                        console.warn(`[HistoryActions-Undo(TRANSFORM)] Block ID ${t.blockId} が見つかりません。`);
                    }
                });
            } else {
                console.error("[HistoryActions-Undo(TRANSFORM)] アクションデータに transformations がありません。", action);
                success = false;
            }
            break;

        // --- UIからのプロパティ設定 (SET_PROPERTIES) を元に戻す ---
        case 'SET_PROPERTIES':
            // action.changes 配列 [{ blockId, oldValue, newValue, ... }, ...]
            if (action.changes && Array.isArray(action.changes)) {
                action.changes.forEach(change => {
                    const block = loadedBlocks.find(b => b.id === change.blockId);
                    if (block) {
                        // 変更前の値 (oldValue) を使ってプロパティを復元
                        setBlockPropertyValueInternal(
                            block,
                            change.propertyPath, // 'vp.x' など
                            change.matrixRow,    // 行列の行 (0-2 or -1)
                            change.matrixCol,    // 行列の列 (0-2 or -1)
                            change.oldValue      // <<< 古い値を設定
                        );
                    } else {
                         console.warn(`[HistoryActions-Undo(SET_PROP)] Block ID ${change.blockId} が見つかりません。`);
                    }
                });
            } else {
                console.error("[HistoryActions-Undo(SET_PROP)] アクションデータに changes がありません。", action);
                success = false;
            }
            break;

        // TODO: 他のアクションタイプ (範囲変更 'MOVE_RANGE', 'RESIZE_RANGE' など) のアンドゥ処理をここに追加

        default:
            console.warn(`[HistoryActions] 未対応のアンドゥアクションタイプ: ${action.type}`);
            success = false; // 未対応のアクションは失敗扱い
    }
    return success;
}

/**
 * 元に戻したアクションをやり直す処理 (リドゥ) を実行します。
 * @param {object} action - やり直すアクションオブジェクト。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (変更対象)。
 * @param {THREE.Scene} scene - 3Dシーン。
 * @returns {boolean} 成功した場合はtrue。
 */
export function executeRedo(action, loadedBlocks, scene) {
     console.log('[HistoryActions] Redo 実行:', action.type);
     let success = true;

     switch (action.type) {
         // --- ブロック追加 (ADD_BLOCK) をやり直す -> 再追加 ---
         case 'ADD_BLOCK':
             // アンドゥで削除されたものを再追加 (Undo の DELETE_BLOCK と同じ)
            if (!loadedBlocks.find(b => b.id === action.blockData.id)) {
                loadedBlocks.push(action.blockData); // renderBlocks でメッシュ生成
                console.log(`[HistoryActions-Redo(ADD)] Block ID ${action.blockData.id} を復元リストに追加しました。`);
            } else {
                 console.warn(`[HistoryActions-Redo(ADD)] Block ID ${action.blockData.id} は既に存在します。`);
                 success = false;
            }
             break;

         // --- ブロック削除 (DELETE_BLOCK) をやり直す -> 再削除 ---
         case 'DELETE_BLOCK':
            // アンドゥで追加されたものを再削除 (Undo の ADD_BLOCK と同じ)
             const indexToDeleteRedo = loadedBlocks.findIndex(b => b.id === action.blockData.id);
             if (indexToDeleteRedo > -1) {
                 const blockToRemove = loadedBlocks[indexToDeleteRedo];
                 loadedBlocks.splice(indexToDeleteRedo, 1);
                 // メッシュリソース破棄
                 if (blockToRemove.mesh) { /* Dispose */ }
                 if (blockToRemove.foregroundMesh) { /* Dispose */ }
                 console.log(`[HistoryActions-Redo(DELETE)] Block ID ${action.blockData.id} を削除しました。`);
             } else {
                  console.warn(`[HistoryActions-Redo(DELETE)] 再削除対象のブロック ID ${action.blockData.id} が見つかりません。`);
                  success = false;
             }
            break;

         // --- カット操作 (CUT_BLOCKS) をやり直す -> 再削除 ---
         case 'CUT_BLOCKS':
             // アンドゥで追加されたブロック群を再度削除する
             if (action.deletedBlocksData && Array.isArray(action.deletedBlocksData)) {
                 const idsToRedoDelete = new Set(action.deletedBlocksData.map(info => info.id));
                 let deletedCount = 0;
                 // ★修正: filterではなくspliceを使うなどで元の配列を変更する
                 for (let i = loadedBlocks.length - 1; i >= 0; i--) {
                     const block = loadedBlocks[i];
                     if (idsToRedoDelete.has(block.id)) {
                         // メッシュ削除 & リソース破棄
                         if (block.mesh && block.mesh.parent) { scene.remove(block.mesh); /* Dispose */ }
                         if (block.foregroundMesh && block.foregroundMesh.parent) { scene.remove(block.foregroundMesh); /* Dispose */ }
                         // 配列から削除
                         loadedBlocks.splice(i, 1);
                         deletedCount++;
                     }
                 }
                 console.log(`[HistoryActions-Redo(CUT)] ${deletedCount} / ${idsToRedoDelete.size} 個のブロックを再削除しました。`);
                 if (deletedCount !== idsToRedoDelete.size) {
                      console.warn("[HistoryActions-Redo(CUT)] 一部のブロックが見つからず、再削除できませんでした。");
                      // success = false; // 一部失敗でも true を返すか？設計による
                 }
                 if (idsToRedoDelete.size === 0) success = false; // 対象が0なら失敗
             } else {
                  console.error("[HistoryActions-Redo(CUT)] アクションデータに deletedBlocksData がありません。", action);
                  success = false;
             }
            break;

         // --- 変形操作 (TRANSFORM_BLOCKS, TRANSFORM_GROUP) をやり直す ---
         case 'TRANSFORM_BLOCKS':
         case 'TRANSFORM_GROUP':
             if (action.transformations && Array.isArray(action.transformations)) {
                 action.transformations.forEach(t => {
                     const block = loadedBlocks.find(b => b.id === t.blockId);
                     if (block) {
                         // 新しい行列 (newMatrix) から位置と回転/スケールを復元
                         const newPosition = _v1.setFromMatrixPosition(t.newMatrix);
                         const newQuaternion = _q1.setFromRotationMatrix(t.newMatrix);
                         const newScale = _v2.setFromMatrixScale(t.newMatrix);
                         block.position.copy(newPosition);
                         block.rotationMatrix.compose(new THREE.Vector3(), newQuaternion, newScale);
                     } else { /* Warn */ }
                 });
             } else { success = false; }
             break;

        // --- UIからのプロパティ設定 (SET_PROPERTIES) をやり直す ---
        case 'SET_PROPERTIES':
            if (action.changes && Array.isArray(action.changes)) {
                 action.changes.forEach(change => {
                     const block = loadedBlocks.find(b => b.id === change.blockId);
                     if (block) {
                         // 変更後の値 (newValue) を使ってプロパティを復元
                         setBlockPropertyValueInternal(
                             block, change.propertyPath, change.matrixRow, change.matrixCol, change.newValue
                         );
                     } else { /* Warn */ }
                 });
             } else { success = false; }
            break;

        // TODO: 他のアクションタイプの リドゥ 処理

         default:
             console.warn(`[HistoryActions] 未対応のリドゥアクションタイプ: ${action.type}`);
             success = false;
     }
     return success;
}


// --- ヘルパー関数 (SET_PROPERTIES アクションの Undo/Redo で使用) ---
// (同じファイル内に置くか、historyUtils.js などに分ける)

/**
 * BlockDataの指定されたプロパティに値を設定する内部関数。
 * XML編集UIからの変更をアンドゥ/リドゥするために使用されます。
 * @param {BlockData} blockData - 対象のBlockData。
 * @param {string | null} propertyPath - 'vp.x' のようなプロパティパス、またはnull。
 * @param {number} row - 行列の行インデックス (-1以外の場合、行列操作)。
 * @param {number} col - 行列の列インデックス (-1以外の場合、行列操作)。
 * @param {number} value - 設定する値 (整数)。
 * @private
 */
function setBlockPropertyValueInternal(blockData, propertyPath, row, col, value) {
    if (propertyPath) { // 座標プロパティの場合 (vp.x, vp.y, vp.z)
        const prop = propertyPath.split('.')[1]; // 'x', 'y', or 'z'
        const currentPosXml = blockData.getPositionXml();
        currentPosXml[prop] = value; // 指定された要素のみ更新
        // BlockData のセッターを呼び出して内部状態 (Three.js座標系) とメッシュを更新
        blockData.setPositionFromXml(currentPosXml.x, currentPosXml.y, currentPosXml.z);
    } else if (row !== -1 && col !== -1) { // 回転行列プロパティの場合
        const currentElements = blockData.getRotationMatrixXmlElements();
        const index = col * 3 + row; // XML要素配列 (列優先) のインデックス計算
        if (index >= 0 && index < 9) {
            currentElements[index] = value; // 指定された要素のみ更新
            // BlockData のセッターを呼び出して内部状態 (Three.js座標系) とメッシュを更新
            blockData.setRotationMatrixFromXmlElements(currentElements);
        } else {
             console.error("Invalid matrix row/col for setBlockPropertyValueInternal:", row, col);
        }
    } else {
        console.error("Invalid property path or matrix indices for setBlockPropertyValueInternal.");
    }
    // 注意: この関数内で blockData のセッター (setPositionFromXml / setRotationMatrixFromXmlElements) を
    // 呼ぶことで、BlockData内部状態の更新と、それに紐づくメッシュ行列の更新(updateMeshMatrixの呼び出し)
    // が行われる想定。もしセッター内でメッシュ更新が行われていない場合は、ここで updateMeshMatrix を呼ぶ必要がある。
    // → blockData.js を確認したところ、セッター内で updateMeshMatrix が呼ばれているのでOK。
}