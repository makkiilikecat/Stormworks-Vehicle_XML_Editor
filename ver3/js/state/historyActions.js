/**
 * @fileoverview アンドゥ・リドゥ対象となる各アクションの具体的な実行ロジックを定義します。
 *
 * historyManager から呼び出され、渡されたアクションオブジェクトに基づいて
 * BlockData 配列 (`loadedBlocks`) やシーンの状態を変更します。
 * このモジュールは履歴スタックの管理は行わず、個々のアクションの「実行」と「取り消し」に専念します。
 *
 * 注意: シーンの再描画 (メッシュの追加/削除/更新の反映) は、
 * このモジュールの関数を呼び出した historyManager 側で行う必要があります。
 */

import * as THREE from 'three'; // Matrix4, Vector3 等の型定義のため
import { BlockData } from '../data/blockData.js'; // BlockData クラス (主にインスタンス復元で使用)
import { deleteBlock } from '../interactions/blockActions.js'; // ブロック削除処理 (Undo/Redo内部で使用)
import { positionToXml } from '../utils/coordinateConverter.js'; // 座標変換ユーティリティ

// --- 計算用の一時変数 (メモリ確保のオーバーヘッド削減) ---
// これらの変数は、このモジュール内の関数スコープでのみ使用されます。
const _v1 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

/**
 * 指定されたアクションを元に戻す (Undo) 処理を実行します。
 *
 * @param {object} action - 元に戻すアクションオブジェクト。最低限 `type` プロパティを持ちます。
 * アクションの種類に応じて追加のプロパティ (例: `blockData`, `changes`, `deletedBlocksData`) を含みます。
 * @param {BlockData[]} loadedBlocks - 現在のワークベンチ上のブロックデータ配列 (この配列が変更されます)。
 * @param {THREE.Scene} scene - 3Dシーンオブジェクト (主にメッシュ削除で使用)。
 * @returns {boolean} Undo処理が成功した場合は true、失敗または未対応のアクションタイプの場合は false。
 */
export function executeUndo(action, loadedBlocks, scene) {
    console.log('[HistoryActions] Undo 実行:', action.type);
    let success = true; // 処理成功フラグ (途中で失敗したら false になる)

    switch (action.type) {
        /**
         * アクションタイプ: 'ADD_BLOCK'
         * Undo処理: 追加されたブロックを削除する。
         * Action Data: action.blockData (追加されたブロックの情報)
         */
        case 'ADD_BLOCK': {
            // loadedBlocks から action.blockData.id と一致するブロックを探す
            const blockToUndoAdd = loadedBlocks.find(b => b.id === action.blockData.id);
            if (blockToUndoAdd) {
                // blockActions.deleteBlock を呼び出す (履歴登録はしないモード: isHistoryAction = true)
                success = deleteBlock(blockToUndoAdd, loadedBlocks, scene, true);
                if (!success) console.error(`[HistoryActions-Undo(ADD)] deleteBlock 処理に失敗 (ID: ${action.blockData.id})`);
            } else {
                console.error(`[HistoryActions-Undo(ADD)] Undo対象ブロック (ID: ${action.blockData.id}) が見つかりません。`);
                success = false;
            }
            break;
        }

        /**
         * アクションタイプ: 'DELETE_BLOCK', 'CUT_BLOCKS', 'DELETE_SYMMETRY'
         * Undo処理: 削除/カットされたブロックを復元（再追加）する。
         * Action Data: action.blockData (単一削除) または action.deletedBlocksData (複数削除/カット)
         */
        case 'DELETE_BLOCK':
        case 'CUT_BLOCKS':
        case 'DELETE_SYMMETRY': {
            // 復元するブロック情報の配列を取得
            const blocksToAddInfo = action.blockData ? [action.blockData] : (action.deletedBlocksData || []);
            if (blocksToAddInfo.length > 0) {
                blocksToAddInfo.forEach(blockInfo => {
                    // 念のため、既に同じIDのブロックが存在しないか確認
                    if (!loadedBlocks.find(b => b.id === blockInfo.id)) {
                        try {
                            // BlockData インスタンスを復元
                            const posXml = positionToXml(blockInfo.position);
                            const rotMatrix = blockInfo.rotationMatrix;
                            const colorStr = blockInfo.colorIndices ? blockInfo.colorIndices.join(',') : "0";
                            // ★ 注意: blockInfo に含まれる色情報 (sc, bc, ac) や追加属性 (cAttributes, oAttributes) を
                            //      正しくコンストラクタに渡す必要があります。
                            //      以下のコンストラクタ呼び出しは Stage 1.1 の BlockData 修正に基づいています。
                            const restoredBlock = new BlockData(
                                blockInfo.definitionId,
                                posXml,                 // 位置 (XML形式)
                                null,                   // 回転文字列 (Matrixで指定するため不要)
                                blockInfo.scString,     // sc属性文字列 (actionに保存されている想定)
                                blockInfo.bcString,     // bc属性文字列 (actionに保存されている想定)
                                blockInfo.acString,     // ac属性文字列 (actionに保存されている想定)
                                blockInfo.tAttribute,   // t属性
                                blockInfo.cAttributes,  // <c>の追加属性 (Map)
                                blockInfo.oAttributes,  // <o>の追加属性 (Map)
                                blockInfo.oChildren,    // <o>の子要素 (Node[])
                                rotMatrix,              // 回転 (Matrix4形式)
                                blockInfo.id            // 元のIDで復元
                            );
                            loadedBlocks.push(restoredBlock); // 配列に追加
                        } catch (e) {
                            console.error(`[HistoryActions-Undo(${action.type})] BlockDataインスタンス復元失敗 (ID: ${blockInfo.id}):`, e, blockInfo);
                            success = false; // 復元に失敗したらフラグを下げる
                        }
                    } else {
                        console.warn(`[HistoryActions-Undo(${action.type})] 追加試行ブロック (ID: ${blockInfo.id}) は既に存在します。`);
                    }
                });
            } else {
                console.error(`[HistoryActions-Undo(${action.type})] 復元対象ブロック情報が見つかりません。`, action);
                success = false;
            }
            break;
        }

        /**
         * アクションタイプ: 'TRANSFORM_BLOCKS', 'TRANSFORM_GROUP'
         * Undo処理: ブロックの位置と向きを操作前の状態に戻す。
         * Action Data: action.transformations (変更前後の position/rotationMatrix を持つオブジェクトの配列)
         */
        case 'TRANSFORM_BLOCKS':
        case 'TRANSFORM_GROUP': {
            if (action.transformations && Array.isArray(action.transformations)) {
                action.transformations.forEach(t => {
                    const block = loadedBlocks.find(b => b.id === t.blockId);
                    if (block) {
                        // 保存された操作前の position と rotationMatrix をコピーして復元
                        block.position.copy(t.oldPosition);
                        block.rotationMatrix.copy(t.oldRotationMatrix);
                        // メッシュの updateMeshMatrix は historyManager の完了後に呼び出される想定
                    } else {
                        console.warn(`[HistoryActions-Undo(TRANSFORM)] Block ID ${t.blockId} が見つかりません。`);
                        // success = false; // 一部見つからなくても続行する？
                    }
                });
            } else {
                console.error(`[HistoryActions-Undo(TRANSFORM)] 無効な transformations データです。`, action);
                success = false;
            }
            break;
        }

        /**
         * アクションタイプ: 'SET_PROPERTIES'
         * Undo処理: ブロックのプロパティ値を操作前の値に戻す。
         * Action Data: action.changes (変更前後の値を含むオブジェクトの配列)
         */
        case 'SET_PROPERTIES': {
            if (action.changes && Array.isArray(action.changes)) {
                action.changes.forEach(change => {
                    const block = loadedBlocks.find(b => b.id === change.blockId);
                    if (block) {
                        // 内部ヘルパー関数を使って、操作前の値 (oldValue) を設定する
                        setBlockPropertyValueInternal(block, change.propName, change.propSource, change.propType, change.oldValue);
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
        }

        /**
         * アクションタイプ: 'PASTE_BLOCKS', 'PLACE_SYMMETRY'
         * Undo処理: ペースト/対称配置で追加されたブロックを削除する。
         * Action Data: action.addedBlocksData または action.placedBlocksData (追加されたブロック情報の配列)
         */
        case 'PASTE_BLOCKS':
        case 'PLACE_SYMMETRY': {
            const blocksToUndoPaste = action.addedBlocksData || action.placedBlocksData;
            if (blocksToUndoPaste && Array.isArray(blocksToUndoPaste)) {
                const idsToDelete = new Set(blocksToUndoPaste.map(info => info.id));
                let deletedCount = 0;
                // loadedBlocks 配列を末尾から走査して削除 (インデックスずれを防ぐ)
                for (let i = loadedBlocks.length - 1; i >= 0; i--) {
                    const block = loadedBlocks[i];
                    if (idsToDelete.has(block.id)) {
                        // 対応するメッシュもシーンから削除 (メッシュが存在すれば)
                        if (block.mesh?.parent) { scene.remove(block.mesh); /* TODO: マテリアル破棄 */ }
                        if (block.foregroundMesh?.parent) { scene.remove(block.foregroundMesh); /* TODO: マテリアル破棄 */ }
                        loadedBlocks.splice(i, 1); // 配列から削除
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
        }

        /**
         * アクションタイプ: 'PAINT_BLOCK'
         * Undo処理: ブロックの色情報を操作前の状態に戻す。
         * Action Data: action.changes (変更前後の色情報を含むオブジェクトの配列)
         */
        case 'PAINT_BLOCK': {
            if (action.changes && Array.isArray(action.changes)) {
                action.changes.forEach(change => {
                    const block = loadedBlocks.find(b => b.id === change.blockId);
                    if (block) {
                        // 変更タイプに応じて適切なセッターで元の色に戻す
                        if (change.paintType === 'surface' && change.index !== undefined) {
                            block.setSurfaceColor(change.index, change.oldValue);
                        } else if (change.paintType === 'base') {
                            block.setBaseColor(change.oldValue);
                        } else if (change.paintType === 'additive') {
                            block.setAdditiveColor(change.oldValue);
                        } else {
                            console.warn(`[HistoryActions-Undo(PAINT)] 不明な paintType: ${change.paintType}`);
                            success = false;
                        }
                    } else {
                        console.warn(`[HistoryActions-Undo(PAINT)] Block ID ${change.blockId} が見つかりません。`);
                        success = false;
                    }
                });
            } else {
                console.error(`[HistoryActions-Undo(PAINT)] 無効な changes データです。`, action);
                success = false;
            }
            break;
        }

        default:
            console.warn(`[HistoryActions] 未対応のUndoアクションタイプ: ${action.type}`);
            success = false;
    }

    if (!success) { console.error(`[HistoryActions] Undo操作 (${action.type}) に失敗しました。`); }
    return success;
}

/**
 * 指定されたアクションをやり直す (Redo) 処理を実行します。
 *
 * @param {object} action - やり直すアクションオブジェクト。Undo時と同じ形式。
 * @param {BlockData[]} loadedBlocks - 現在のワークベンチ上のブロックデータ配列 (この配列が変更されます)。
 * @param {THREE.Scene} scene - 3Dシーンオブジェクト (主にメッシュ削除で使用)。
 * @returns {boolean} Redo処理が成功した場合は true、失敗または未対応のアクションタイプの場合は false。
 */
export function executeRedo(action, loadedBlocks, scene) {
     console.log('[HistoryActions] Redo 実行:', action.type);
     let success = true;

     switch (action.type) {
        /**
         * アクションタイプ: 'ADD_BLOCK', 'PASTE_BLOCKS', 'PLACE_SYMMETRY'
         * Redo処理: Undo で削除されたブロックを復元（再追加）する。
         * Action Data: action.blockData, action.addedBlocksData, action.placedBlocksData
         */
        case 'ADD_BLOCK':
        case 'PASTE_BLOCKS':
        case 'PLACE_SYMMETRY': {
             const blocksToRedoAddInfo = action.blockData ? [action.blockData] : (action.addedBlocksData || action.placedBlocksData || []);
             if (blocksToRedoAddInfo.length > 0) {
                  blocksToRedoAddInfo.forEach(blockInfo => {
                      if (!loadedBlocks.find(b => b.id === blockInfo.id)) {
                          try {
                              // BlockData インスタンスを復元 (Undo と同様)
                              const posXml = positionToXml(blockInfo.position);
                              const rotMatrix = blockInfo.rotationMatrix;
                              const colorStr = blockInfo.colorIndices ? blockInfo.colorIndices.join(',') : "0";
                              const restoredBlock = new BlockData(
                                  blockInfo.definitionId, posXml, null,
                                  blockInfo.scString, blockInfo.bcString, blockInfo.acString, // 色情報
                                  blockInfo.tAttribute, blockInfo.cAttributes, blockInfo.oAttributes, blockInfo.oChildren,
                                  rotMatrix, blockInfo.id
                              );
                              loadedBlocks.push(restoredBlock);
                          } catch (e) { console.error(`[HistoryActions-Redo(${action.type})] BlockData復元失敗 (ID: ${blockInfo.id}):`, e, blockInfo); success = false; }
                      } else { console.warn(`[HistoryActions-Redo(${action.type})] 追加試行ブロック (ID: ${blockInfo.id}) は既に存在。`); }
                  });
             } else { console.error(`[HistoryActions-Redo(${action.type})] やり直すためのブロック情報不明。`, action); success = false; }
              break;
         }

        /**
         * アクションタイプ: 'DELETE_BLOCK', 'CUT_BLOCKS', 'DELETE_SYMMETRY'
         * Redo処理: Undo で復元されたブロックを再度削除する。
         * Action Data: action.blockData, action.deletedBlocksData
         */
        case 'DELETE_BLOCK':
        case 'CUT_BLOCKS':
        case 'DELETE_SYMMETRY': {
            const blocksToRedoDeleteInfo = action.blockData ? [action.blockData] : (action.deletedBlocksData || []);
            if (blocksToRedoDeleteInfo.length > 0) {
                const idsToRedoDelete = new Set(blocksToRedoDeleteInfo.map(info => info.id));
                let deletedCount = 0;
                // loadedBlocks を末尾から走査
                for (let i = loadedBlocks.length - 1; i >= 0; i--) {
                    const block = loadedBlocks[i];
                    if (idsToRedoDelete.has(block.id)) {
                        // メッシュ削除 (Undo と同様)
                        if (block.mesh?.parent) { scene.remove(block.mesh); /* TODO: Dispose */ }
                        if (block.foregroundMesh?.parent) { scene.remove(block.foregroundMesh); /* TODO: Dispose */ }
                        loadedBlocks.splice(i, 1); // 配列から削除
                        deletedCount++;
                    }
                }
                if (deletedCount !== blocksToRedoDeleteInfo.length) { console.warn(`[HistoryActions-Redo(${action.type})] 削除対象のブロック数が一致しません。`); }
                if (deletedCount === 0 && blocksToRedoDeleteInfo.length > 0) { console.error(`[HistoryActions-Redo(${action.type})] 削除対象のブロックが見つかりません。`); success = false; }
            } else {
                console.error(`[HistoryActions-Redo(${action.type})] 削除対象のブロック情報不明。`, action);
                success = false;
            }
            break;
        }


         /**
          * アクションタイプ: 'TRANSFORM_BLOCKS', 'TRANSFORM_GROUP'
          * Redo処理: ブロックの位置と向きを操作後の状態に戻す。
          * Action Data: action.transformations
          */
         case 'TRANSFORM_BLOCKS':
         case 'TRANSFORM_GROUP': {
             if (action.transformations && Array.isArray(action.transformations)) {
                 action.transformations.forEach(t => {
                     const block = loadedBlocks.find(b => b.id === t.blockId);
                     if (block) {
                         // 保存された操作後の position と rotationMatrix をコピーして復元
                         block.position.copy(t.newPosition);
                         block.rotationMatrix.copy(t.newRotationMatrix);
                     } else { console.warn(`[HistoryActions-Redo(TRANSFORM)] Block ID ${t.blockId} 不明`); }
                 });
             } else { console.error(`[HistoryActions-Redo(TRANSFORM)] 無効な transformations データ`, action); success = false; }
             break;
         }

        /**
         * アクションタイプ: 'SET_PROPERTIES'
         * Redo処理: ブロックのプロパティ値を操作後の値に戻す。
         * Action Data: action.changes
         */
        case 'SET_PROPERTIES': {
            if (action.changes && Array.isArray(action.changes)) {
                 action.changes.forEach(change => {
                     const block = loadedBlocks.find(b => b.id === change.blockId);
                     if (block) {
                         // 内部ヘルパー関数を使って、操作後の値 (newValue) を設定する
                         setBlockPropertyValueInternal(block, change.propName, change.propSource, change.propType, change.newValue);
                     } else { console.warn(`[HistoryActions-Redo(SET_PROP)] Block ID ${change.blockId} 不明`); }
                 });
             } else { console.error(`[HistoryActions-Redo(SET_PROP)] 無効な changes データ`, action); success = false; }
            break;
        }

        /**
         * アクションタイプ: 'PAINT_BLOCK'
         * Redo処理: ブロックの色情報を操作後の状態に戻す。
         * Action Data: action.changes
         */
        case 'PAINT_BLOCK': {
             if (action.changes && Array.isArray(action.changes)) {
                 action.changes.forEach(change => {
                     const block = loadedBlocks.find(b => b.id === change.blockId);
                     if (block) {
                        // 変更タイプに応じて適切なセッターで操作後の色に戻す
                        if (change.paintType === 'surface' && change.index !== undefined) {
                            block.setSurfaceColor(change.index, change.newValue);
                        } else if (change.paintType === 'base') {
                            block.setBaseColor(change.newValue);
                        } else if (change.paintType === 'additive') {
                            block.setAdditiveColor(change.newValue);
                        } else {
                            console.warn(`[HistoryActions-Redo(PAINT)] 不明な paintType: ${change.paintType}`);
                            success = false;
                        }
                     } else {
                         console.warn(`[HistoryActions-Redo(PAINT)] Block ID ${change.blockId} が見つかりません。`);
                         success = false;
                     }
                 });
             } else {
                 console.error(`[HistoryActions-Redo(PAINT)] 無効な changes データです。`, action);
                 success = false;
             }
             break;
         }

         default:
             console.warn(`[HistoryActions] 未対応のRedoアクションタイプ: ${action.type}`);
             success = false;
     }
     if (!success) console.error(`[HistoryActions] Redo操作 (${action.type}) 失敗`);
     return success;
}


/**
 * BlockDataの指定されたプロパティに値を設定する内部ヘルパー関数。
 * SET_PROPERTIES アクションの Undo/Redo から呼び出されます。
 * (詳細コメント追加)
 *
 * @param {BlockData} blockData - 対象の BlockData インスタンス。
 * @param {string} propName - プロパティ名 ('t', 'vp.x', 'max_force_scalar' など)。
 * @param {string} propSource - プロパティのソース ('standard', 'c', 'o')。
 * @param {string} propType - プロパティの型 ('boolean', 'number', 'string')。
 * @param {string} value - 設定する値 (履歴に保存されていた文字列形式)。
 * @private
 */
function setBlockPropertyValueInternal(blockData, propName, propSource, propType, value) {
    // 履歴に保存されている値 (value) は文字列なので、型に応じてパースする
    let parsedValue;
    try {
        if (propType === 'boolean') {
            parsedValue = value.toLowerCase() === 'true';
        } else if (propType === 'number') {
            parsedValue = parseFloat(value);
            if (isNaN(parsedValue)) {
                console.warn(`[HistoryActions] 数値パース失敗: '${value}' for ${propName}`);
                return; // パース失敗時は設定しない
            }
            // 特定の数値プロパティは整数に丸める
            if (propName === 't' || propName.startsWith('vp.') || propName.startsWith('r.')) {
                 parsedValue = Math.round(parsedValue);
            }
        } else { // string およびその他の型
            parsedValue = value;
        }
    } catch (e) {
        console.error(`[HistoryActions] プロパティ値 '${value}' のパース失敗 (type: ${propType}):`, e);
        return; // パース失敗時は設定しない
    }

    // BlockData の適切なセッターを呼び出す
    if (propSource === 'standard') { // BlockData の基本プロパティ
        if (propName === 't') {
            blockData.setTAttribute(parsedValue);
        } else if (propName.startsWith('vp.')) { // 位置ベクトル (vp)
            const currentPos = blockData.getPositionXml();
            const axis = propName.slice(3); // 'x', 'y', または 'z'
            const newPos = { ...currentPos };
            newPos[axis] = parsedValue; // 指定された軸の値のみ更新
            blockData.setPositionFromXml(newPos.x, newPos.y, newPos.z);
        } else if (propName.startsWith('r.')) { // 回転行列 (r)
            // 'r.R.C' (0-indexed) 形式からインデックス計算
            const [, rStr, cStr] = propName.split('.');
            const r = parseInt(rStr);
            const c = parseInt(cStr);
            const index = c * 3 + r; // 列優先インデックス
            const currentElements = blockData.getRotationMatrixXmlElements();
            currentElements[index] = parsedValue; // 変更箇所を更新 (数値は既に丸め済み)
            blockData.setRotationMatrixFromXmlElements(currentElements);
        } else {
            console.error("[HistoryActions] 不明な標準プロパティ:", propName);
        }
    } else if (propSource === 'c') { // <c> の追加属性
        // 追加属性は文字列として保存
        blockData.setCAttribute(propName, value); // パース前の文字列 value を使用
    } else if (propSource === 'o') { // <o> の追加属性
        // 追加属性は文字列として保存
        blockData.setOAttribute(propName, value); // パース前の文字列 value を使用
    } else {
        console.error("[HistoryActions] 不明なプロパティソース:", propSource);
    }
}