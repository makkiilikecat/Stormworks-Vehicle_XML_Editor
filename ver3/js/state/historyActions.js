/**
 * @fileoverview アンドゥ・リドゥ対象となる各アクションの実行ロジックを定義します。
 * historyManagerから呼び出され、BlockData配列やシーンの状態を変更します。
 * このモジュールは履歴スタックを管理せず、アクションの適用・取り消し処理に専念します。
 * シーンの再描画は呼び出し元 (historyManager) が担当します。
 *
 * 【主な変更点 v4】
 * - 対称編集に対応した PLACE_SYMMETRY, DELETE_SYMMETRY アクションを追加。
 * - ペイント機能に対応した PAINT_BLOCK, REPLACE_COLOR アクションを追加。
 */

import * as THREE from 'three'; // Matrix4, Vector3, Quaternion を使用
import { BlockData } from '../data/blockData.js'; // BlockDataクラス定義
import { deleteBlock } from '../interactions/blockActions.js'; // ブロック削除処理
import { positionToXml } from '../utils/coordinateConverter.js'; // 座標変換ユーティリティ

// --- 計算用の一時変数 ---
const _v1 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

/**
 * アクションを元に戻す (Undo) 処理。
 * 状態変更のみ行い、再描画は呼び出し元に委ねます。
 * @param {object} action - 元に戻すアクションオブジェクト ({ type, ... })。
 * - ADD_BLOCK: { type: 'ADD_BLOCK', blockData: { id, ... } }
 * - DELETE_BLOCK/CUT_BLOCKS/DELETE_SYMMETRY: { type: '...', deletedBlocksData: [{ id, ... }] }
 * - TRANSFORM_BLOCKS/TRANSFORM_GROUP: { type: '...', transformations: [{ blockId, oldPosition, oldRotationMatrix, ... }] }
 * - SET_PROPERTIES: { type: 'SET_PROPERTIES', changes: [{ blockId, propName, propSource, propType, oldValue, ... }] }
 * - PASTE_BLOCKS/PLACE_SYMMETRY: { type: '...', addedBlocksData/placedBlocksData: [{ id, ... }] }
 * - PAINT_BLOCK: { type: 'PAINT_BLOCK', changes: [{ blockId, paintType, index?, oldValue, ... }] }
 * - REPLACE_COLOR: { type: 'REPLACE_COLOR', changes: [{ blockId, paintType, index?, oldValue, ... }] }
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (変更対象)。
 * @param {THREE.Scene} scene - 3Dシーン (メッシュ削除などで使用)。
 * @returns {boolean} 処理成功時は true、失敗または未対応アクションなら false。
 */
export function executeUndo(action, loadedBlocks, scene) {
    console.log('[HistoryActions] Undo 実行:', action.type);
    let success = true; // 処理成功フラグ

    switch (action.type) {
        /** case 'ADD_BLOCK': ブロック追加操作の取り消し -> 対応するブロックを削除 */
        case 'ADD_BLOCK': {
            const blockToUndoAdd = loadedBlocks.find(b => b.id === action.blockData.id);
            if (blockToUndoAdd) {
                // 履歴記録なしモードで削除
                success = deleteBlock(blockToUndoAdd, loadedBlocks, scene, true);
            } else {
                console.error(`[HistoryActions-Undo(ADD)] Undo対象ブロック (ID: ${action.blockData.id}) が見つかりません。`);
                success = false;
            }
            break;
        }

        /** case 'DELETE_BLOCK', 'CUT_BLOCKS', 'DELETE_SYMMETRY': ブロック削除・カット操作の取り消し -> 削除されたブロックを再生成して追加 */
        case 'DELETE_BLOCK':
        case 'CUT_BLOCKS':
        case 'DELETE_SYMMETRY': {
            const blocksToAddInfo = action.blockData ? [action.blockData] : (action.deletedBlocksData || []);
            if (blocksToAddInfo.length > 0) {
                blocksToAddInfo.forEach(blockInfo => {
                    if (!loadedBlocks.find(b => b.id === blockInfo.id)) {
                        try {
                            const posXml = positionToXml(blockInfo.position);
                            const rotMatrix = blockInfo.rotationMatrix;
                            const colorStr = blockInfo.colorIndices ? blockInfo.colorIndices.join(',') : "0"; // 旧データ形式かも？
                            const scString = blockInfo.surfaceColors ? `${blockInfo.surfaceColors.length},${blockInfo.surfaceColors.map(c => c === 'FFFFFF' ? 'x' : c).join(',')}` : null; // 新形式があれば優先
                            const bcString = blockInfo.baseColor || null;
                            const acString = blockInfo.additiveColor || null;

                            // BlockData を復元 (元のIDを使用)
                            const restoredBlock = new BlockData(
                                blockInfo.definitionId, posXml, null,
                                scString, bcString, acString, // 新しい色情報形式
                                blockInfo.tAttribute, blockInfo.cAttributes, blockInfo.oAttributes, blockInfo.oChildren,
                                rotMatrix, blockInfo.id // 元のIDで復元
                            );
                            loadedBlocks.push(restoredBlock);
                        } catch (e) { console.error(`[HistoryActions-Undo(${action.type})] BlockData復元失敗 (ID: ${blockInfo.id}):`, e, blockInfo); success = false; }
                    } else { /* Warn */ }
                });
            } else { console.error(`[HistoryActions-Undo(${action.type})] 復元対象ブロック情報が見つかりません。`, action); success = false; }
            break;
        }

        /** case 'TRANSFORM_BLOCKS', 'TRANSFORM_GROUP': ブロック変形操作の取り消し -> 操作前の position と rotationMatrix に戻す */
        case 'TRANSFORM_BLOCKS':
        case 'TRANSFORM_GROUP': {
            if (action.transformations && Array.isArray(action.transformations)) {
                action.transformations.forEach(t => {
                    const block = loadedBlocks.find(b => b.id === t.blockId);
                    if (block) {
                        block.position.copy(t.oldPosition);
                        block.rotationMatrix.copy(t.oldRotationMatrix);
                    } else { /* Warn */ }
                });
            } else { console.error(`[HistoryActions-Undo(TRANSFORM)] 無効な transformations データ`, action); success = false; }
            break;
        }

        /** case 'SET_PROPERTIES': プロパティ編集操作の取り消し -> 操作前の値 (oldValue) に戻す */
        case 'SET_PROPERTIES': {
            if (action.changes && Array.isArray(action.changes)) {
                action.changes.forEach(change => {
                    const block = loadedBlocks.find(b => b.id === change.blockId);
                    if (block) {
                        setBlockPropertyValueInternal(block, change.propName, change.propSource, change.propType, change.oldValue);
                    } else { /* Warn */ }
                });
            } else { console.error(`[HistoryActions-Undo(SET_PROP)] 無効な changes データ`, action); success = false; }
            break;
        }

        /** case 'PASTE_BLOCKS', 'PLACE_SYMMETRY': ペースト・対称配置操作の取り消し -> 追加されたブロックを削除 */
        case 'PASTE_BLOCKS':
        case 'PLACE_SYMMETRY': {
            const blocksToUndoPaste = action.addedBlocksData || action.placedBlocksData;
            if (blocksToUndoPaste && Array.isArray(blocksToUndoPaste)) {
                const idsToDelete = new Set(blocksToUndoPaste.map(info => info.id));
                let deletedCount = 0;
                for (let i = loadedBlocks.length - 1; i >= 0; i--) {
                    const block = loadedBlocks[i];
                    if (idsToDelete.has(block.id)) {
                        if (block.mesh?.parent) { scene.remove(block.mesh); /* Dispose? */ }
                        if (block.foregroundMesh?.parent) { scene.remove(block.foregroundMesh); /* Dispose? */ }
                        loadedBlocks.splice(i, 1);
                        deletedCount++;
                    }
                }
                if (deletedCount !== blocksToUndoPaste.length) { /* Warn */ }
                if (deletedCount === 0 && blocksToUndoPaste.length > 0) { success = false; }
            } else { console.error(`[HistoryActions-Undo(${action.type})] 無効な addedBlocksData / placedBlocksData`, action); success = false; }
            break;
        }

        /** case 'PAINT_BLOCK': ペイント操作の取り消し -> 操作前の色 (oldValue) に戻す */
        case 'PAINT_BLOCK': {
            if (action.changes && Array.isArray(action.changes)) {
                action.changes.forEach(change => {
                    const block = loadedBlocks.find(b => b.id === change.blockId);
                    if (block) {
                        if (change.paintType === 'surface' && change.index !== undefined) {
                            block.setSurfaceColor(change.index, change.oldValue); // Surface color 復元
                        } else if (change.paintType === 'base') {
                            block.setBaseColor(change.oldValue); // Base color 復元
                        } else if (change.paintType === 'additive') {
                            block.setAdditiveColor(change.oldValue); // Additive color 復元
                        } else { console.warn(`[HistoryActions-Undo(PAINT)] 不明な paintType`, change); success = false; }
                    } else { console.warn(`[HistoryActions-Undo(PAINT)] Block ID ${change.blockId} 不明`); success = false; }
                });
            } else { console.error(`[HistoryActions-Undo(PAINT)] 無効な changes データ`, action); success = false; }
            break;
        }

        /** case 'REPLACE_COLOR': 色置き換え操作の取り消し -> 全ての変更を操作前の色 (oldValue) に戻す */
        case 'REPLACE_COLOR': {
            if (action.changes && Array.isArray(action.changes)) {
                 action.changes.forEach(change => {
                     const block = loadedBlocks.find(b => b.id === change.blockId);
                     if (block) {
                         if (change.paintType === 'surface' && change.index !== undefined) {
                             block.setSurfaceColor(change.index, change.oldValue);
                         } else if (change.paintType === 'base') {
                             block.setBaseColor(change.oldValue);
                         } else if (change.paintType === 'additive') {
                             block.setAdditiveColor(change.oldValue);
                         } else { console.warn(`[HistoryActions-Undo(REPLACE)] 不明な paintType`, change); success = false; }
                     } else { /* Warn */ }
                 });
             } else { console.error(`[HistoryActions-Undo(REPLACE)] 無効な changes データ`, action); success = false; }
            break;
        }

        // --- 未対応のアクション ---
        default:
            console.warn(`[HistoryActions] 未対応のUndoアクションタイプ: ${action.type}`);
            success = false;
    }

    if (!success) { console.error(`[HistoryActions] Undo操作 (${action.type}) に失敗しました。`); }
    return success;
}

/**
 * 元に戻したアクションをやり直す (Redo) 処理。
 * 状態変更のみ行い、再描画は呼び出し元に委ねます。
 * @param {object} action - やり直すアクションオブジェクト ({ type, ... })。
 * (Undo と同じ構造を想定)
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (変更対象)。
 * @param {THREE.Scene} scene - 3Dシーン (メッシュ削除などで使用)。
 * @returns {boolean} 処理成功時は true、失敗または未対応アクションなら false。
 */
export function executeRedo(action, loadedBlocks, scene) {
     console.log('[HistoryActions] Redo 実行:', action.type);
     let success = true;

     switch (action.type) {
        /** case 'ADD_BLOCK', 'PASTE_BLOCKS', 'PLACE_SYMMETRY': ブロック追加操作のやり直し -> Undo で削除されたブロックを再追加 */
        case 'ADD_BLOCK':
        case 'PASTE_BLOCKS':
        case 'PLACE_SYMMETRY': {
             const blocksToRedoAddInfo = action.blockData ? [action.blockData] : (action.addedBlocksData || action.placedBlocksData || []);
             if (blocksToRedoAddInfo.length > 0) {
                  blocksToRedoAddInfo.forEach(blockInfo => {
                      if (!loadedBlocks.find(b => b.id === blockInfo.id)) {
                          try {
                              const posXml = positionToXml(blockInfo.position);
                              const rotMatrix = blockInfo.rotationMatrix;
                              const scString = blockInfo.surfaceColors ? `${blockInfo.surfaceColors.length},${blockInfo.surfaceColors.map(c => c === 'FFFFFF' ? 'x' : c).join(',')}` : null;
                              const bcString = blockInfo.baseColor || null;
                              const acString = blockInfo.additiveColor || null;
                              const restoredBlock = new BlockData(
                                  blockInfo.definitionId, posXml, null,
                                  scString, bcString, acString,
                                  blockInfo.tAttribute, blockInfo.cAttributes, blockInfo.oAttributes, blockInfo.oChildren,
                                  rotMatrix, blockInfo.id
                              );
                              loadedBlocks.push(restoredBlock);
                          } catch (e) { console.error(`[HistoryActions-Redo(${action.type})] BlockData復元失敗 (ID: ${blockInfo.id}):`, e, blockInfo); success = false; }
                      } else { /* Warn */ }
                  });
             } else { console.error(`[HistoryActions-Redo(${action.type})] やり直すためのブロック情報不明。`, action); success = false; }
              break;
         }

        /** case 'DELETE_BLOCK', 'CUT_BLOCKS', 'DELETE_SYMMETRY': ブロック削除・カット操作のやり直し -> Undo で追加されたブロックを再削除 */
        case 'DELETE_BLOCK':
        case 'CUT_BLOCKS':
        case 'DELETE_SYMMETRY': {
            const blocksToRedoDeleteInfo = action.blockData ? [action.blockData] : (action.deletedBlocksData || []);
            if (blocksToRedoDeleteInfo.length > 0) {
                const idsToRedoDelete = new Set(blocksToRedoDeleteInfo.map(info => info.id));
                let deletedCount = 0;
                for (let i = loadedBlocks.length - 1; i >= 0; i--) {
                    const block = loadedBlocks[i];
                    if (idsToRedoDelete.has(block.id)) {
                        if (block.mesh?.parent) { scene.remove(block.mesh); /* Dispose? */ }
                        if (block.foregroundMesh?.parent) { scene.remove(block.foregroundMesh); /* Dispose? */ }
                        loadedBlocks.splice(i, 1);
                        deletedCount++;
                    }
                }
                if (deletedCount !== blocksToRedoDeleteInfo.length) { /* Warn */ }
                if (deletedCount === 0 && blocksToRedoDeleteInfo.length > 0) { success = false; }
            } else { console.error(`[HistoryActions-Redo(${action.type})] 削除対象のブロック情報不明。`, action); success = false; }
            break;
        }

         /** case 'TRANSFORM_BLOCKS', 'TRANSFORM_GROUP': ブロック変形操作のやり直し -> 操作後の position と rotationMatrix に戻す */
         case 'TRANSFORM_BLOCKS':
         case 'TRANSFORM_GROUP': {
             if (action.transformations && Array.isArray(action.transformations)) {
                 action.transformations.forEach(t => {
                     const block = loadedBlocks.find(b => b.id === t.blockId);
                     if (block) {
                         block.position.copy(t.newPosition);
                         block.rotationMatrix.copy(t.newRotationMatrix);
                     } else { /* Warn */ }
                 });
             } else { console.error(`[HistoryActions-Redo(TRANSFORM)] 無効な transformations データ`, action); success = false; }
             break;
         }

        /** case 'SET_PROPERTIES': プロパティ編集操作のやり直し -> 操作後の値 (newValue) に戻す */
        case 'SET_PROPERTIES': {
            if (action.changes && Array.isArray(action.changes)) {
                 action.changes.forEach(change => {
                     const block = loadedBlocks.find(b => b.id === change.blockId);
                     if (block) {
                         setBlockPropertyValueInternal(block, change.propName, change.propSource, change.propType, change.newValue);
                     } else { /* Warn */ }
                 });
             } else { console.error(`[HistoryActions-Redo(SET_PROP)] 無効な changes データ`, action); success = false; }
            break;
        }

         /** case 'PAINT_BLOCK': ペイント操作のやり直し -> 操作後の色 (newValue) に戻す */
         case 'PAINT_BLOCK': {
             if (action.changes && Array.isArray(action.changes)) {
                 action.changes.forEach(change => {
                     const block = loadedBlocks.find(b => b.id === change.blockId);
                     if (block) {
                        if (change.paintType === 'surface' && change.index !== undefined) {
                            block.setSurfaceColor(change.index, change.newValue); // Surface color 再適用
                        } else if (change.paintType === 'base') {
                            block.setBaseColor(change.newValue); // Base color 再適用
                        } else if (change.paintType === 'additive') {
                            block.setAdditiveColor(change.newValue); // Additive color 再適用
                        } else { console.warn(`[HistoryActions-Redo(PAINT)] 不明な paintType`, change); success = false; }
                     } else { /* Warn */ success = false; }
                 });
             } else { console.error(`[HistoryActions-Redo(PAINT)] 無効な changes データ`, action); success = false; }
             break;
         }

         /** case 'REPLACE_COLOR': 色置き換え操作のやり直し -> 全ての変更を操作後の色 (newValue) に戻す */
         case 'REPLACE_COLOR': {
             if (action.changes && Array.isArray(action.changes)) {
                  action.changes.forEach(change => {
                      const block = loadedBlocks.find(b => b.id === change.blockId);
                      if (block) {
                         if (change.paintType === 'surface' && change.index !== undefined) {
                             block.setSurfaceColor(change.index, change.newValue);
                         } else if (change.paintType === 'base') {
                             block.setBaseColor(change.newValue);
                         } else if (change.paintType === 'additive') {
                             block.setAdditiveColor(change.newValue);
                         } else { console.warn(`[HistoryActions-Redo(REPLACE)] 不明な paintType`, change); success = false; }
                      } else { /* Warn */ }
                  });
              } else { console.error(`[HistoryActions-Redo(REPLACE)] 無効な changes データ`, action); success = false; }
             break;
         }

         // --- 未対応のアクション ---
         default:
             console.warn(`[HistoryActions] 未対応のRedoアクションタイプ: ${action.type}`);
             success = false;
     }
     if (!success) console.error(`[HistoryActions] Redo操作 (${action.type}) 失敗`);
     return success;
}


/**
 * @private SET_PROPERTIES 用ヘルパー (変更なし)
 */
function setBlockPropertyValueInternal(blockData, propName, propSource, propType, value) {
    // (変更なし)
    let parsedValue;
    try { if (propType === 'boolean') { parsedValue = value.toLowerCase() === 'true'; } else if (propType === 'number') { parsedValue = parseFloat(value); if (isNaN(parsedValue)) { return; } } else { parsedValue = value; } } catch (e) { return; }
    if (propSource === 'standard') { if (propName === 't') blockData.setTAttribute(parsedValue); else if (propName.startsWith('vp.')) { const cp = blockData.getPositionXml(); const axis = propName.slice(3); const newPos = { ...cp }; newPos[axis] = parsedValue; blockData.setPositionFromXml(newPos.x, newPos.y, newPos.z); } else if (propName.startsWith('r.')) { const [, rStr, cStr] = propName.split('.'); const r = parseInt(rStr); const c = parseInt(cStr); const index = c * 3 + r; const currentElements = blockData.getRotationMatrixXmlElements(); currentElements[index] = Math.round(parsedValue); blockData.setRotationMatrixFromXmlElements(currentElements); } else { /*...*/ } }
    else if (propSource === 'c') { blockData.setCAttribute(propName, value); } else if (propSource === 'o') { blockData.setOAttribute(propName, value); } else { /*...*/ }
}