/**
 * @fileoverview アンドゥ・リドゥ対象となる各アクションの実行ロジックを定義します。
 * historyManagerから呼び出され、BlockData配列やシーンの状態を変更します。
 * このモジュールは履歴スタックを管理せず、アクションの適用・取り消し処理に専念します。
 * シーンの再描画は呼び出し元 (historyManager) が担当します。
 */

import * as THREE from 'three'; // Matrix4, Vector3, Quaternion を使用
import { BlockData } from '../data/blockData.js'; // BlockDataクラス定義
import { deleteBlock } from '../interactions/blockActions.js'; // ブロック削除処理
import { positionToXml } from '../utils/coordinateConverter.js'; // 座標変換ユーティリティ

// --- 計算用の一時変数 (メモリ確保のオーバーヘッド削減) ---
const _v1 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

/**
 * アクションを元に戻す (Undo) 処理。
 * 状態変更のみ行い、再描画は呼び出し元に委ねます。
 * @param {object} action - 元に戻すアクションオブジェクト ({ type, ... })。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (変更対象)。
 * @param {THREE.Scene} scene - 3Dシーン (メッシュ削除などで使用)。
 * @returns {boolean} 処理成功時は true、失敗または未対応アクションなら false。
 */
export function executeUndo(action, loadedBlocks, scene) {
    console.log('[HistoryActions] Undo 実行:', action.type);
    let success = true; // 処理成功フラグ

    switch (action.type) {
        /**
         * case 'ADD_BLOCK': ブロック追加操作の取り消し
         * -> 対応するブロックを削除する
         */
        case 'ADD_BLOCK': {
            // action.blockData には追加時のブロック情報 (コピー) が格納されている
            const blockToUndoAdd = loadedBlocks.find(b => b.id === action.blockData.id);
            if (blockToUndoAdd) {
                // deleteBlock を履歴記録なしモード (isHistoryAction=true) で実行
                success = deleteBlock(blockToUndoAdd, loadedBlocks, scene, true);
            } else {
                console.error(`[HistoryActions-Undo(ADD)] Undo対象ブロック (ID: ${action.blockData.id}) が見つかりません。`);
                success = false;
            }
            break;
        }

        /**
         * case 'DELETE_BLOCK', 'CUT_BLOCKS', 'DELETE_SYMMETRY': ブロック削除・カット操作の取り消し
         * -> 削除されたブロックを BlockData インスタンスとして再生成し、配列に追加する
         */
        case 'DELETE_BLOCK':
        case 'CUT_BLOCKS':
        case 'DELETE_SYMMETRY': {
            // action.blockData (単一) または action.deletedBlocksData (複数) に情報がある
            const blocksToAddInfo = action.blockData ? [action.blockData] : (action.deletedBlocksData || []);
            if (blocksToAddInfo.length > 0) {
                blocksToAddInfo.forEach(blockInfo => {
                    // 既に同じIDのブロックが存在しないか確認
                    if (!loadedBlocks.find(b => b.id === blockInfo.id)) {
                        try {
                            // --- BlockData インスタンスを復元 ---
                            // BlockData コンストラクタに必要な形式にデータを変換
                            const posXml = positionToXml(blockInfo.position); // Vector3 -> {x,y,z}
                            const rotMatrix = blockInfo.rotationMatrix; // Matrix4 のはず
                            const colorStr = blockInfo.colorIndices ? blockInfo.colorIndices.join(',') : "0"; // number[] -> string

                            // new BlockData でインスタンス生成 (元のIDを指定して復元)
                            const restoredBlock = new BlockData(
                                blockInfo.definitionId,
                                posXml,             // 位置 (XML形式)
                                null,               // 回転 (文字列形式は不要)
                                colorStr,           // 色 (文字列形式)
                                blockInfo.tAttribute, // t属性
                                blockInfo.cAttributes, // <c>の追加属性 (Map)
                                blockInfo.oAttributes, // <o>の追加属性 (Map)
                                blockInfo.oChildren,   // <o>の子要素 (Node[])
                                rotMatrix,          // 回転 (Matrix4形式)
                                blockInfo.id        // 元のID
                            );
                            loadedBlocks.push(restoredBlock); // 配列に追加
                            console.log(`[HistoryActions-Undo(${action.type})] Block ID ${blockInfo.id} を復元しました。`);
                        } catch (e) {
                            console.error(`[HistoryActions-Undo(${action.type})] BlockDataインスタンス復元失敗 (ID: ${blockInfo.id}):`, e, blockInfo);
                            success = false; // 復元に失敗
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
         * case 'TRANSFORM_BLOCKS', 'TRANSFORM_GROUP': ブロック変形操作の取り消し
         * -> 保存された操作前の position と rotationMatrix を使って状態を復元する
         */
        case 'TRANSFORM_BLOCKS':
        case 'TRANSFORM_GROUP': {
            // action.transformations 配列 [{ blockId, oldPosition, oldRotationMatrix, newPosition, newRotationMatrix }, ...]
            if (action.transformations && Array.isArray(action.transformations)) {
                action.transformations.forEach(t => {
                    const block = loadedBlocks.find(b => b.id === t.blockId);
                    if (block) {
                        // 保存された操作前の position と rotationMatrix をコピーして復元
                        block.position.copy(t.oldPosition);
                        block.rotationMatrix.copy(t.oldRotationMatrix);
                        // メッシュの updateMeshMatrix は historyManager の undo/redo 完了後に呼ばれる想定
                    } else {
                        console.warn(`[HistoryActions-Undo(TRANSFORM)] Block ID ${t.blockId} が見つかりません。`);
                    }
                });
            } else {
                console.error(`[HistoryActions-Undo(TRANSFORM)] 無効な transformations データです。`, action);
                success = false;
            }
            break;
        }

        /**
         * case 'SET_PROPERTIES': プロパティ編集操作の取り消し
         * -> 保存された操作前の値 (oldValue) を使ってプロパティを復元する
         */
        case 'SET_PROPERTIES': {
            // action.changes 配列 [{ blockId, propName, propSource, propType, oldValue, newValue }, ...]
            if (action.changes && Array.isArray(action.changes)) {
                action.changes.forEach(change => {
                    const block = loadedBlocks.find(b => b.id === change.blockId);
                    if (block) {
                        // 操作前の値 (oldValue) を使ってプロパティ値を設定
                        setBlockPropertyValueInternal(block, change.propName, change.propSource, change.propType, change.oldValue);
                    } else {
                        console.warn(`[HistoryActions-Undo(SET_PROP)] Block ID ${change.blockId} が見つかりません。`);
                    }
                });
            } else {
                console.error(`[HistoryActions-Undo(SET_PROP)] 無効な changes データです。`, action);
                success = false;
            }
            break;
        }

        /**
         * case 'PASTE_BLOCKS', 'PLACE_SYMMETRY': ペースト・対称配置操作の取り消し
         * -> 追加されたブロックをIDで特定し、削除する
         */
        case 'PASTE_BLOCKS':
        case 'PLACE_SYMMETRY': {
            // action.addedBlocksData または action.placedBlocksData 配列 [{ id, ... }, ...]
            const blocksToUndoPaste = action.addedBlocksData || action.placedBlocksData;
            if (blocksToUndoPaste && Array.isArray(blocksToUndoPaste)) {
                const idsToDelete = new Set(blocksToUndoPaste.map(info => info.id));
                let deletedCount = 0;
                // loadedBlocks 配列を末尾から走査して削除 (インデックスずれを防ぐため)
                for (let i = loadedBlocks.length - 1; i >= 0; i--) {
                    const block = loadedBlocks[i];
                    if (idsToDelete.has(block.id)) {
                        // 対応するメッシュもシーンから削除
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
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (変更対象)。
 * @param {THREE.Scene} scene - 3Dシーン (メッシュ削除などで使用)。
 * @returns {boolean} 処理成功時は true、失敗または未対応アクションなら false。
 */
export function executeRedo(action, loadedBlocks, scene) {
     console.log('[HistoryActions] Redo 実行:', action.type);
     let success = true;

     switch (action.type) {
        /**
         * case 'ADD_BLOCK': ブロック追加操作のやり直し
         * -> Undo で削除されたブロックを再追加
         * case 'DELETE_SYMMETRY': 対称削除操作のやり直し (Undoで追加されたブロックを再削除)
         * -> 削除処理へ
         * case 'PASTE_BLOCKS', 'PLACE_SYMMETRY': ペースト・対称配置操作のやり直し
         * -> Undo で削除されたブロックを再追加
         */
        case 'ADD_BLOCK':
        case 'PASTE_BLOCKS':
        case 'PLACE_SYMMETRY': {
             const blocksToRedoAddInfo = action.blockData ? [action.blockData] : (action.addedBlocksData || action.placedBlocksData || []);
             if (blocksToRedoAddInfo.length > 0) {
                  blocksToRedoAddInfo.forEach(blockInfo => {
                      if (!loadedBlocks.find(b => b.id === blockInfo.id)) {
                          // --- BlockData インスタンスを復元 --- (Undoと同様)
                          try {
                              const posXml = positionToXml(blockInfo.position);
                              const rotMatrix = blockInfo.rotationMatrix;
                              const colorStr = blockInfo.colorIndices ? blockInfo.colorIndices.join(',') : "0";
                              const restoredBlock = new BlockData(blockInfo.definitionId, posXml, null, colorStr, blockInfo.tAttribute, blockInfo.cAttributes, blockInfo.oAttributes, blockInfo.oChildren, rotMatrix, blockInfo.id);
                              loadedBlocks.push(restoredBlock);
                              console.log(`[HistoryActions-Redo(${action.type})] Block ID ${blockInfo.id} を再追加しました。`);
                          } catch (e) { console.error(`[HistoryActions-Redo(${action.type})] BlockData復元失敗 (ID: ${blockInfo.id}):`, e, blockInfo); success = false; }
                          // --------------------------------------
                      } else { /* Warn */ }
                  });
             } else { console.error(`[HistoryActions-Redo(${action.type})] やり直すためのブロック情報不明。`, action); success = false; }
              break;
         }

        /**
         * case 'DELETE_BLOCK', 'CUT_BLOCKS': ブロック削除・カット操作のやり直し
         * -> Undo で追加されたブロックを再削除
         * case 'DELETE_SYMMETRY': 対称削除操作のやり直し (Undoで追加されたブロックを再削除)
         * -> ここで処理
         */
        case 'DELETE_BLOCK':
        case 'CUT_BLOCKS':
        case 'DELETE_SYMMETRY': { // DELETE_SYMMETRY の Redo は削除
            const blocksToRedoDeleteInfo = action.blockData ? [action.blockData] : (action.deletedBlocksData || []);
            if (blocksToRedoDeleteInfo.length > 0) {
                const idsToRedoDelete = new Set(blocksToRedoDeleteInfo.map(info => info.id));
                let deletedCount = 0;
                for (let i = loadedBlocks.length - 1; i >= 0; i--) {
                    const block = loadedBlocks[i];
                    if (idsToRedoDelete.has(block.id)) {
                        if (block.mesh?.parent) { scene.remove(block.mesh); /* TODO: Dispose */ }
                        if (block.foregroundMesh?.parent) { scene.remove(block.foregroundMesh); /* TODO: Dispose */ }
                        loadedBlocks.splice(i, 1);
                        deletedCount++;
                    }
                }
                if (deletedCount !== blocksToRedoDeleteInfo.length) { /* Warn */ }
                if (deletedCount === 0 && blocksToRedoDeleteInfo.length > 0) success = false;
            } else {
                console.error(`[HistoryActions-Redo(${action.type})] 削除対象のブロック情報不明。`, action);
                success = false;
            }
            break;
        }


         /**
          * case 'TRANSFORM_BLOCKS', 'TRANSFORM_GROUP': ブロック変形操作のやり直し
          * -> 保存された操作後の position と rotationMatrix を使って状態を復元する
          */
         case 'TRANSFORM_BLOCKS':
         case 'TRANSFORM_GROUP': {
             // action.transformations 配列 [{ blockId, oldPosition, oldRotationMatrix, newPosition, newRotationMatrix }, ...]
             if (action.transformations && Array.isArray(action.transformations)) {
                 action.transformations.forEach(t => {
                     const block = loadedBlocks.find(b => b.id === t.blockId);
                     if (block) {
                         // 保存された操作後の position と rotationMatrix をコピーして復元
                         block.position.copy(t.newPosition);
                         block.rotationMatrix.copy(t.newRotationMatrix);
                         // メッシュ更新は historyManager の完了後再描画に任せる
                     } else { /* Warn */ }
                 });
             } else { console.error(`[HistoryActions-Redo(TRANSFORM)] 無効な transformations データ`, action); success = false; }
             break;
         }

        /**
         * case 'SET_PROPERTIES': プロパティ編集操作のやり直し
         * -> 保存された操作後の値 (newValue) を使ってプロパティを復元する
         */
        case 'SET_PROPERTIES': {
            // action.changes 配列 [{ blockId, propName, propSource, propType, oldValue, newValue }, ...]
            if (action.changes && Array.isArray(action.changes)) {
                 action.changes.forEach(change => {
                     const block = loadedBlocks.find(b => b.id === change.blockId);
                     if (block) {
                         // 操作後の値 (newValue) を使ってプロパティ値を設定
                         setBlockPropertyValueInternal(block, change.propName, change.propSource, change.propType, change.newValue);
                     } else { console.warn(`[HistoryActions-Redo(SET_PROP)] Block ID ${change.blockId} 不明`); }
                 });
             } else { console.error(`[HistoryActions-Redo(SET_PROP)] 無効な changes データ`, action); success = false; }
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
            // パース失敗時は何もしない（元の値のまま）
            if (isNaN(parsedValue)) {
                console.warn(`[HistoryActions] 数値パース失敗: '${value}' for ${propName}`);
                return;
            }
        } else { // string
            parsedValue = value;
        }
    } catch (e) {
        console.error(`[HistoryActions] プロパティ値 '${value}' のパース失敗 (type: ${propType}):`, e);
        return; // パース失敗時は設定しない
    }

    // console.log(`[HistoryActions] setBlockProp: Name=${propName}, Source=${propSource}, Type=${propType}, Value=${parsedValue}`);

    // BlockData の適切なセッターを呼び出す
    if (propSource === 'standard') {
        if (propName === 't') { blockData.setTAttribute(parsedValue); }
        else if (propName === 'vp.x') { const cp = blockData.getPositionXml(); blockData.setPositionFromXml(parsedValue, cp.y, cp.z); }
        else if (propName === 'vp.y') { const cp = blockData.getPositionXml(); blockData.setPositionFromXml(cp.x, parsedValue, cp.z); }
        else if (propName === 'vp.z') { const cp = blockData.getPositionXml(); blockData.setPositionFromXml(cp.x, cp.y, parsedValue); }
        else if (propName.startsWith('r.')) {
            // r[row][col] の形式からインデックスを計算
            const [, rStr, cStr] = propName.split('.');
            const r = parseInt(rStr); const c = parseInt(cStr);
            const index = c * 3 + r; // 列優先インデックス
            // 現在の回転行列要素を取得し、指定箇所を更新
            const currentElements = blockData.getRotationMatrixXmlElements();
            currentElements[index] = Math.round(parsedValue); // 回転行列要素は整数
            // 更新した要素配列で回転行列を設定
            blockData.setRotationMatrixFromXmlElements(currentElements);
        } else {
            console.error("[HistoryActions] 不明な標準プロパティ:", propName);
        }
    } else if (propSource === 'c') {
        // 追加属性は文字列として保存
        blockData.setCAttribute(propName, value); // パース前の文字列 value を使用
    } else if (propSource === 'o') {
        // 追加属性は文字列として保存
        blockData.setOAttribute(propName, value); // パース前の文字列 value を使用
    } else {
        console.error("[HistoryActions] 不明なプロパティソース:", propSource);
    }
}