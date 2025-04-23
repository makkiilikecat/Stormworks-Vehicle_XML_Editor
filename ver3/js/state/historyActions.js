/**
 * @fileoverview アンドゥ・リドゥの各アクションタイプに対応する具体的な状態変更処理。
 * historyManager.js から呼び出され、現在のブロックデータ配列やシーンを操作します。
 * このモジュール自体は履歴スタックを管理せず、純粋なアクションの実行を担当します。
 * 各アクションの実行後、シーンの再描画が必要になる場合がありますが、
 * このモジュール内では再描画は行わず、呼び出し元 (historyManager) が担当します。
 */

import * as THREE from 'three'; // Matrix4, Vector3, Quaternion のため
import { BlockData } from '../data/blockData.js'; // アクションデータが BlockData の構造を持つため
import { deleteBlock, placeBlock } from '../interactions/blockActions.js'; // ブロックの追加・削除 (Undo/Redo用)
// import { setBlockPropertyValueInternal } from './historyUtils.js'; // このファイル内に移動

// --- 計算用一時変数 (メモリ効率化のためモジュールスコープで定義) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

/**
 * アクションを元に戻す (Undo) 処理を実行します。
 * 状態の変更のみを行い、シーンの再描画は呼び出し元 (historyManager) が担当します。
 * @param {object} action - 元に戻すアクションオブジェクト。 `type` プロパティを持つ。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この配列が変更されます)。
 * @param {THREE.Scene} scene - 3Dシーン (主にメッシュ削除で使用)。
 * @returns {boolean} アクションの実行に成功した場合はtrue、失敗または未対応の場合はfalse。
 */
export function executeUndo(action, loadedBlocks, scene) {
    console.log('[HistoryActions] Undo 実行:', action.type);
    let success = true;

    switch (action.type) {
        // --- ブロック追加 (ADD_BLOCK) を元に戻す -> ブロック削除 ---
        case 'ADD_BLOCK':
            // action.blockData には追加されたブロックの情報 (コピー) が含まれる
            // ID を使って実際の BlockData インスタンスを loadedBlocks から探す
            const blockToUndoAdd = loadedBlocks.find(b => b.id === action.blockData.id);
            if (blockToUndoAdd) {
                // deleteBlock を isHistoryAction=true で呼び出し、
                // 履歴スタックへの追加を防ぎつつ削除処理を実行
                success = deleteBlock(blockToUndoAdd, loadedBlocks, scene, true);
            } else {
                console.error(`[HistoryActions-Undo(ADD)] 削除対象のブロック ID ${action.blockData.id} が見つかりません。`);
                success = false;
            }
            break;

        // --- ブロック削除 (DELETE_BLOCK) を元に戻す -> ブロック再追加 ---
        case 'DELETE_BLOCK':
        // --- カット操作 (CUT_BLOCKS) を元に戻す -> 削除されたブロックを再追加 ---
        case 'CUT_BLOCKS':
        // --- 対称削除 (DELETE_SYMMETRY) を元に戻す -> 削除された全ブロックを追加 ---
        case 'DELETE_SYMMETRY':
            // action.blockData または action.deletedBlocksData (配列) に削除されたブロック情報のコピーが含まれる
            const blocksToAdd = action.blockData ? [action.blockData] : (action.deletedBlocksData || []);
            if (blocksToAdd.length > 0) {
                blocksToAdd.forEach(blockInfo => {
                    // 同じIDのブロックが既に存在しないことを確認
                    if (!loadedBlocks.find(b => b.id === blockInfo.id)) {
                        // 保存された情報から BlockData インスタンスを復元して追加
                        // (注意: mesh, foregroundMesh は null なので、renderBlocks で再生成が必要)
                        // BlockData コンストラクタを使わずに直接オブジェクトを push しても良いが、
                        // 将来的な BlockData のメソッド依存を考慮すると、インスタンス化が望ましい場合もある。
                        // ここでは、保存された情報が BlockData の主要プロパティを持つオブジェクトであると仮定し、そのまま追加。
                        loadedBlocks.push(blockInfo);
                    } else {
                        console.warn(`[HistoryActions-Undo(${action.type})] 追加しようとしたブロック ID ${blockInfo.id} は既に存在します。`);
                        // 一部失敗しても他のブロックは復元を試みる
                    }
                });
                 // 全ての追加に失敗した場合 (例: 全てIDが重複) のみ false とする
                 if (blocksToAdd.every(info => loadedBlocks.find(b => b.id === info.id))) {
                     // success = false; // 既に存在してもUndo自体は意図通りかもしれないので、一旦 true のまま
                 }
            } else {
                console.error(`[HistoryActions-Undo(${action.type})] 元に戻すためのブロック情報が見つかりません。`, action);
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
                        // 変更前の行列 (oldMatrix) から位置と回転を復元
                        t.oldMatrix.decompose(block.position, _q1, _v1); // 位置、回転、スケールを分解
                        block.rotationMatrix.setFromQuaternion(_q1);     // 回転を設定
                        block.rotationMatrix.scale(_v1);                 // スケールを適用
                        // block.updateMeshMatrix(); // メッシュ更新は呼び出し元の再描画に任せる
                    } else {
                        console.warn(`[HistoryActions-Undo(TRANSFORM)] Block ID ${t.blockId} が見つかりません。`);
                        // success = false;
                    }
                });
            } else {
                console.error(`[HistoryActions-Undo(TRANSFORM)] 無効な transformations データです。`, action);
                success = false;
            }
            break;

        // --- プロパティ設定 (SET_PROPERTIES) を元に戻す ---
        case 'SET_PROPERTIES':
            // action.changes 配列 [{ blockId, propertyPath?, matrixRow?, matrixCol?, oldValue, newValue }, ...]
            if (action.changes && Array.isArray(action.changes)) {
                action.changes.forEach(change => {
                    const block = loadedBlocks.find(b => b.id === change.blockId);
                    if (block) {
                        // 変更前の値 (oldValue) を使ってプロパティを復元
                        setBlockPropertyValueInternal(block, change.propertyPath, change.matrixRow, change.matrixCol, change.oldValue);
                    } else {
                        console.warn(`[HistoryActions-Undo(SET_PROP)] Block ID ${change.blockId} が見つかりません。`);
                        // success = false;
                    }
                });
            } else {
                console.error(`[HistoryActions-Undo(SET_PROP)] 無効な changes データです。`, action);
                success = false;
            }
            break;

        // --- ペースト操作 (PASTE_BLOCKS) を元に戻す -> 追加されたブロックを削除 ---
        case 'PASTE_BLOCKS':
        // --- 対称配置 (PLACE_SYMMETRY) を元に戻す -> 配置された全ブロックを削除 ---
        case 'PLACE_SYMMETRY':
            // action.addedBlocksData または action.placedBlocksData 配列 [{ id, ... }, ...]
            const blocksToUndoPaste = action.addedBlocksData || action.placedBlocksData;
            if (blocksToUndoPaste && Array.isArray(blocksToUndoPaste)) {
                const idsToDelete = new Set(blocksToUndoPaste.map(info => info.id));
                let deletedCount = 0;
                // loadedBlocks 配列を直接変更（末尾からループして splice）
                for (let i = loadedBlocks.length - 1; i >= 0; i--) {
                    const block = loadedBlocks[i];
                    if (idsToDelete.has(block.id)) {
                        // メッシュ削除 & リソース破棄
                        if (block.mesh && block.mesh.parent) { scene.remove(block.mesh); /* Dispose Material */ }
                        if (block.foregroundMesh && block.foregroundMesh.parent) { scene.remove(block.foregroundMesh); /* Dispose Material */ }
                        loadedBlocks.splice(i, 1);
                        deletedCount++;
                    }
                }
                if (deletedCount !== blocksToUndoPaste.length) {
                    console.warn(`[HistoryActions-Undo(${action.type})] 削除対象のブロック数が一致しません (${deletedCount}/${blocksToUndoPaste.length})`);
                }
                if (deletedCount === 0 && blocksToUndoPaste.length > 0) {
                     console.error(`[HistoryActions-Undo(${action.type})] 削除対象のブロックが見つかりませんでした。`);
                     success = false;
                }
            } else {
                console.error(`[HistoryActions-Undo(${action.type})] 無効な addedBlocksData / placedBlocksData です。`, action);
                success = false;
            }
            break;

        default:
            console.warn(`[HistoryActions] 未対応のアンドゥアクションタイプ: ${action.type}`);
            success = false;
    }

    if (!success) {
        console.error(`[HistoryActions] アンドゥ操作 (${action.type}) に失敗しました。`);
    }
    return success;
}

/**
 * 元に戻したアクションをやり直す (Redo) 処理を実行します。
 * 状態の変更のみを行い、シーンの再描画は呼び出し元 (historyManager) が担当します。
 * @param {object} action - やり直すアクションオブジェクト。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この配列が変更されます)。
 * @param {THREE.Scene} scene - 3Dシーン (主にメッシュ削除で使用)。
 * @returns {boolean} アクションの実行に成功した場合はtrue、失敗または未対応の場合はfalse。
 */
export function executeRedo(action, loadedBlocks, scene) {
     console.log('[HistoryActions] Redo 実行:', action.type);
     let success = true;

     switch (action.type) {
        // --- ブロック追加 (ADD_BLOCK) をやり直す -> ブロックを再追加 ---
        case 'ADD_BLOCK':
        // --- カット操作 (CUT_BLOCKS) をやり直す -> (Undoで追加されたものを)再削除 ---
        // (DELETE_SYMMETRY の Redo と同じ)
        case 'DELETE_SYMMETRY':
            // action.blockData または action.deletedBlocksData に情報が含まれる
            const blocksToRedoAdd = action.blockData ? [action.blockData] : (action.deletedBlocksData || []);
            if (blocksToRedoAdd.length > 0) {
                 blocksToRedoAdd.forEach(blockInfo => {
                     if (!loadedBlocks.find(b => b.id === blockInfo.id)) {
                         loadedBlocks.push(blockInfo);
                     } else { /* Warn */ }
                 });
                 if (blocksToRedoAdd.every(info => !loadedBlocks.find(b => b.id === info.id))) {
                     // 実際には一つも追加されなかった場合 (全てID重複など)
                     // success = false;
                 }
            } else {
                 console.error(`[HistoryActions-Redo(${action.type})] やり直すためのブロック情報が見つかりません。`, action);
                 success = false;
            }
             break;

        // --- ブロック削除 (DELETE_BLOCK) をやり直す -> ブロックを再削除 ---
        case 'DELETE_BLOCK':
        // --- カット操作 (CUT_BLOCKS) をやり直す -> 再削除 ---
        case 'CUT_BLOCKS':
        // --- 対称削除 (DELETE_SYMMETRY) をやり直す -> 全ブロックを再削除 ---
            const blocksToRedoDeleteInfo = action.blockData ? [action.blockData] : (action.deletedBlocksData || []);
            if (blocksToRedoDeleteInfo.length > 0) {
                 const idsToRedoDelete = new Set(blocksToRedoDeleteInfo.map(info => info.id));
                 let deletedCount = 0;
                 for (let i = loadedBlocks.length - 1; i >= 0; i--) {
                     const block = loadedBlocks[i];
                     if (idsToRedoDelete.has(block.id)) {
                         if (block.mesh && block.mesh.parent) { scene.remove(block.mesh); /* Dispose */ }
                         if (block.foregroundMesh && block.foregroundMesh.parent) { scene.remove(block.foregroundMesh); /* Dispose */ }
                         loadedBlocks.splice(i, 1);
                         deletedCount++;
                     }
                 }
                 if (deletedCount !== blocksToRedoDeleteInfo.length) { /* Warn */ }
                 if (deletedCount === 0 && blocksToRedoDeleteInfo.length > 0) success = false;
            } else {
                 console.error(`[HistoryActions-Redo(${action.type})] やり直すためのブロック情報が見つかりません。`, action);
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
                         // 変更後の行列 (newMatrix) から位置と回転を復元
                         t.newMatrix.decompose(block.position, _q1, _v1);
                         block.rotationMatrix.setFromQuaternion(_q1);
                         block.rotationMatrix.scale(_v1);
                         // block.updateMeshMatrix(); // 再描画に任せる
                     } else { /* Warn */ }
                 });
             } else { /* Error */ success = false; }
             break;

        // --- プロパティ設定 (SET_PROPERTIES) をやり直す ---
        case 'SET_PROPERTIES':
            if (action.changes && Array.isArray(action.changes)) {
                 action.changes.forEach(change => {
                     const block = loadedBlocks.find(b => b.id === change.blockId);
                     if (block) {
                         // 変更後の値 (newValue) を使ってプロパティを復元
                         setBlockPropertyValueInternal(block, change.propertyPath, change.matrixRow, change.matrixCol, change.newValue);
                     } else { /* Warn */ }
                 });
             } else { /* Error */ success = false; }
            break;

        // --- ペースト操作 (PASTE_BLOCKS) をやり直す -> ブロックを再追加 ---
        case 'PASTE_BLOCKS':
        // --- 対称配置 (PLACE_SYMMETRY) をやり直す -> 全ブロックを再追加 ---
        case 'PLACE_SYMMETRY':
            const blocksToRedoPaste = action.addedBlocksData || action.placedBlocksData;
            if (blocksToRedoPaste && Array.isArray(blocksToRedoPaste)) {
                blocksToRedoPaste.forEach(addedInfo => {
                    if (!loadedBlocks.find(b => b.id === addedInfo.id)) {
                        loadedBlocks.push(addedInfo); // 再描画でメッシュ生成
                    } else { /* Warn */ }
                });
                 if(blocksToRedoPaste.length === 0) success = false;
            } else {
                 console.error(`[HistoryActions-Redo(${action.type})] 無効な addedBlocksData / placedBlocksData です。`, action);
                 success = false;
            }
            break;


         default:
             console.warn(`[HistoryActions] 未対応のリドゥアクションタイプ: ${action.type}`);
             success = false;
     }

     if (!success) {
         console.error(`[HistoryActions] リドゥ操作 (${action.type}) に失敗しました。`);
     }
     return success;
}


/**
 * BlockDataの指定されたプロパティに値を設定する内部ヘルパー関数。
 * @param {BlockData} blockData 対象ブロック。
 * @param {string | null} propertyPath プロパティパス ('vp.x'など) または null。
 * @param {number} row 行列の行インデックス (-1以外なら行列操作)。
 * @param {number} col 行列の列インデックス (-1以外なら行列操作)。
 * @param {number} value 設定する値 (整数)。
 * @private
 */
function setBlockPropertyValueInternal(blockData, propertyPath, row, col, value) {
    // ... (実装は変更なし) ...
    if (propertyPath) { const parts = propertyPath.split('.'); const prop = parts[1]; const currentPosXml = blockData.getPositionXml(); currentPosXml[prop] = value; blockData.setPositionFromXml(currentPosXml.x, currentPosXml.y, currentPosXml.z); }
    else if (row !== -1 && col !== -1) { const currentElements = blockData.getRotationMatrixXmlElements(); const index = col * 3 + row; currentElements[index] = value; blockData.setRotationMatrixFromXmlElements(currentElements); }
    else { console.error("[HistoryActions] 不正なプロパティパスまたは行列インデックスです。"); }
}