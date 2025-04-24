/**
 * @fileoverview アンドゥ・リドゥ対象となる各アクションの具体的な実行ロジック
 * （データ状態の変更と、それに伴う3Dシーンの直接的な更新）を定義します。
 * historyManagerから呼び出され、loadedBlocks 配列やシーンの状態を直接変更します。
 * シーン全体の再描画（renderBlocks）を回避し、影響を受けるオブジェクトのみを
 * 操作することでパフォーマンスを向上させます。
 *
 * @version 5.1 - Redo時の表示状態復元ロジックを修正・強化
 */

import * as THREE from 'three';
import { BlockData } from '../data/blockData.js';
import { positionToXml } from '../utils/coordinateConverter.js';
// メッシュ生成、マテリアル取得/管理に必要な関数・オブジェクトを blockRenderer からインポート
import {
    createBlockMesh,
    getOrCreateMaterial,
    unknownMaterial, // 未対応ブロック用マテリアル
    ghostMaterialBase, // ゴースト表示のベースマテリアル
    foregroundCubeGeometry, // 前景キューブのジオメトリ
    foregroundCubeMaterialBase // 前景キューブのベースマテリアル
    // getOrCreateGhostMaterial // 必要ならゴースト用マテリアル取得関数もインポート
} from '../rendering/blockRenderer.js';
// 現在の編集モードに応じて表示を切り替えるためにインポート
import { getCurrentMode, EditMode } from './editMode.js';
// ブロック定義取得（マテリアル更新等で参照）
import { getBlockDefinition } from '../data/blockDefinitions.js';


/**
 * 指定されたIDのブロックに対応するメッシュ（通常・前景）をシーンから検索して削除します。
 * @param {number} blockId - 削除対象のブロックID。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 * @private
 */
function removeBlockMeshesFromScene(blockId, scene) {
    // シーンから指定IDを持つオブジェクトを検索（複数該当する可能性あり）
    const objectsToRemove = [];
    scene.traverse((object) => {
        if (object.userData?.blockId === blockId && object.userData?.isManagedBlockMesh) {
            objectsToRemove.push(object);
        }
    });

    if (objectsToRemove.length > 0) {
        // console.log(`[HistoryActions] Removing ${objectsToRemove.length} meshes for block ID: ${blockId}`);
        objectsToRemove.forEach(obj => {
            scene.remove(obj);
            // TODO: メッシュ、ジオメトリ、マテリアルの dispose 処理
            // - ジオメトリ: キャッシュされているものは dispose しない
            // - マテリアル: キャッシュ、共有されているものは dispose しない
            if (obj.userData.isForegroundCube && obj.material?.dispose) {
                 // 前景キューブのマテリアルはクローンなので dispose して良いはず
                 obj.material.dispose();
            }
        });
    } else {
        // console.warn(`[HistoryActions] No meshes found to remove for block ID: ${blockId}`);
    }
}

/**
 * アクションを元に戻す (Undo) 処理を実行します。
 * loadedBlocks 配列の状態をアクション実行前に戻し、
 * シーン内の対応する3Dメッシュも追加/削除/更新します。
 *
 * @param {object} action - 元に戻すアクションオブジェクト ({ type, ... })。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この配列が変更されます)。
 * @param {THREE.Scene} scene - 3Dシーンオブジェクト (メッシュ操作用)。
 * @returns {boolean} 処理成功時は true、失敗または未対応アクションなら false。
 */
export function executeUndo(action, loadedBlocks, scene) {
    console.log('[HistoryActions] Undo 実行:', action.type);
    let success = true; // 処理成功フラグ

    switch (action.type) {
        // --- ブロック追加/ペースト/対称配置操作の取り消し ---
        // 追加されたブロック(群)を loadedBlocks から削除し、対応するメッシュをシーンから削除する
        case 'ADD_BLOCK': // (古いアクションタイプ、下位互換用)
        case 'PASTE_BLOCKS':
        case 'PLACE_SYMMETRY': {
            // action オブジェクトから削除対象のブロック情報を取得
            const blocksToUndoAdd = action.blockData ? [action.blockData] : (action.addedBlocksData || action.placedBlocksData || []);
            if (blocksToUndoAdd.length > 0) {
                const idsToRemove = new Set(blocksToUndoAdd.map(info => info.id)); // 削除対象IDリスト
                let removedCount = 0;
                // loadedBlocks 配列を逆順に探索して削除
                for (let i = loadedBlocks.length - 1; i >= 0; i--) {
                    if (idsToRemove.has(loadedBlocks[i].id)) {
                        const removedBlockData = loadedBlocks.splice(i, 1)[0]; // データ配列から削除
                        // シーンから対応するメッシュ(通常・前景)を削除
                        removeBlockMeshesFromScene(removedBlockData.id, scene);
                        removedCount++;
                    }
                }
                // 削除数チェック (デバッグ用)
                if (removedCount !== blocksToUndoAdd.length) {
                    console.warn(`[HistoryActions-Undo(${action.type})] 削除対象ブロック数 (${blocksToUndoAdd.length}) と実際に削除した数 (${removedCount}) が一致しません。`);
                }
            } else {
                console.error(`[HistoryActions-Undo(${action.type})] Undo対象のブロック情報が見つかりません。`, action);
                success = false;
            }
            break;
        }

        // --- ブロック削除/カット/対称削除操作の取り消し ---
        // 削除されたブロック(群)の BlockData を復元し loadedBlocks に追加、
        // 対応するメッシュを生成してシーンに追加し、現在のモードに合わせて表示状態を設定する
        case 'DELETE_BLOCK': // (古いアクションタイプ)
        case 'CUT_BLOCKS':
        case 'DELETE_SYMMETRY': {
            // action オブジェクトから復元対象のブロック情報を取得
            const blocksToRestoreInfo = action.blockData ? [action.blockData] : (action.deletedBlocksData || []);
            if (blocksToRestoreInfo.length > 0) {
                const currentMode = getCurrentMode(); // 現在の編集モードを取得 (表示状態設定用)

                blocksToRestoreInfo.forEach(blockInfo => {
                    // 同じIDのブロックが既に存在しないか確認
                    if (!loadedBlocks.find(b => b.id === blockInfo.id)) {
                        try {
                            // 1. BlockData インスタンスを履歴情報から復元 (元のIDを使用)
                            const restoredBlock = new BlockData(
                                blockInfo.definitionId,
                                positionToXml(blockInfo.position), // position は Vector3 なので XML 形式に変換
                                null, // rotationString は不要
                                // sc属性文字列を復元 (surfaceColors配列から生成)
                                blockInfo.surfaceColors ? `${blockInfo.surfaceColors.length},${blockInfo.surfaceColors.map(c => c === 'FFFFFF' ? 'x' : c).join(',')}` : null,
                                blockInfo.baseColor,         // bc属性
                                blockInfo.additiveColor,     // ac属性
                                blockInfo.tAttribute,        // t属性
                                blockInfo.cAttributes,       // Map (コンストラクタでコピーされる)
                                blockInfo.oAttributes,       // Map (コンストラクタでコピーされる)
                                blockInfo.oChildren,         // Node[] (コンストラクタでクローンされる)
                                blockInfo.rotationMatrix,    // initialMatrix として回転を復元
                                blockInfo.id                 // restoreId として元のIDを指定
                            );
                            // 復元した BlockData を loadedBlocks 配列に追加
                            loadedBlocks.push(restoredBlock);

                            // 2. 通常メッシュを生成してシーンに追加
                            restoredBlock.mesh = createBlockMesh(restoredBlock);
                            if (!restoredBlock.mesh) {
                                throw new Error("通常メッシュの生成に失敗しました。");
                            }
                            scene.add(restoredBlock.mesh);

                            // 3. 前景メッシュも生成・保持 (XML編集モード用に常に用意)
                            const fgMat = foregroundCubeMaterialBase.clone();
                            restoredBlock.foregroundMesh = new THREE.Mesh(foregroundCubeGeometry, fgMat);
                            restoredBlock.foregroundMesh.userData = { // userData を設定
                                isManagedBlockMesh: true,
                                isForegroundCube: true,
                                blockId: restoredBlock.id
                            };
                            restoredBlock.foregroundMesh.matrixAutoUpdate = false;
                            scene.add(restoredBlock.foregroundMesh);

                            // 4. 現在のモードに基づいて表示状態（マテリアル、可視性）を設定
                            setMeshStateBasedOnMode(restoredBlock, currentMode);

                            // 5. 最後に位置・回転を行列に適用
                            restoredBlock.updateMeshMatrix();

                        } catch (e) {
                            console.error(`[HistoryActions-Undo(${action.type})] BlockData復元/メッシュ処理中にエラー (ID: ${blockInfo.id}):`, e, blockInfo);
                            success = false;
                        }
                    } else {
                        console.warn(`[HistoryActions-Undo(${action.type})] 復元しようとしたブロック (ID: ${blockInfo.id}) が既に存在します。`);
                    }
                });
            } else {
                console.error(`[HistoryActions-Undo(${action.type})] 復元対象のブロック情報が見つかりません。`, action);
                success = false;
            }
            break;
        }

        // --- ブロック変形操作の取り消し ---
        // 影響を受けたブロック(群)の position と rotationMatrix を操作前の状態に戻し、
        // 対応するメッシュの行列を更新する
        case 'TRANSFORM_BLOCKS':
        case 'TRANSFORM_GROUP': {
            if (action.transformations && Array.isArray(action.transformations)) {
                action.transformations.forEach(t => {
                    const block = loadedBlocks.find(b => b.id === t.blockId);
                    if (block) {
                        // データ（位置と回転行列）を元に戻す
                        block.position.copy(t.oldPosition);
                        block.rotationMatrix.copy(t.oldRotationMatrix);
                        // メッシュの表示を更新
                        block.updateMeshMatrix();
                    } else {
                        console.warn(`[HistoryActions-Undo(TRANSFORM)] Block ID ${t.blockId} が見つかりません。`);
                        success = false;
                    }
                });
            } else {
                console.error(`[HistoryActions-Undo(TRANSFORM)] 無効な transformations データです。`, action);
                success = false;
            }
            break;
        }

        // --- プロパティ編集操作の取り消し ---
        // 影響を受けたブロック(群)のプロパティ値を操作前の状態 (oldValue) に戻す。
        // t, vp, r 属性の場合はメッシュの行列も更新。
        case 'SET_PROPERTIES': {
            if (action.changes && Array.isArray(action.changes)) {
                action.changes.forEach(change => {
                    const block = loadedBlocks.find(b => b.id === change.blockId);
                    if (block) {
                        // BlockData の値を元に戻す
                        setBlockPropertyValueInternal(block, change.propName, change.propSource, change.propType, change.oldValue);
                        // 位置・回転・t属性に関わるプロパティが変更された場合はメッシュ行列も更新
                        if (change.propName === 't' || change.propName.startsWith('vp.') || change.propName.startsWith('r.')) {
                            block.updateMeshMatrix();
                        }
                        // TODO: 他のプロパティ変更がマテリアル等に影響する場合の処理 (例: 色属性なら updateBlockMeshMaterial 呼び出し)
                    } else {
                        console.warn(`[HistoryActions-Undo(SET_PROP)] Block ID ${change.blockId} が見つかりません。`);
                        success = false;
                    }
                });
            } else {
                console.error(`[HistoryActions-Undo(SET_PROP)] 無効な changes データです。`, action);
                success = false;
            }
            break;
        }

        // --- ペイント操作の取り消し / 色置換操作の取り消し ---
        // 影響を受けたブロック(群)の色情報を操作前の状態 (oldValue) に戻し、
        // 対応するメッシュのマテリアルを更新する。
        case 'PAINT_BLOCK':
        case 'REPLACE_COLOR': {
            if (action.changes && Array.isArray(action.changes)) {
                const updatedBlocks = new Set(); // マテリアル更新が必要なブロックID
                action.changes.forEach(change => {
                    const block = loadedBlocks.find(b => b.id === change.blockId);
                    if (block) {
                        // BlockData の色情報を元に戻す
                        if (change.paintType === 'surface' && change.index !== undefined) {
                            block.setSurfaceColor(change.index, change.oldValue);
                        } else if (change.paintType === 'base') {
                            block.setBaseColor(change.oldValue);
                        } else if (change.paintType === 'additive') {
                            block.setAdditiveColor(change.oldValue);
                        } else {
                            console.warn(`[HistoryActions-Undo(${action.type})] 不明な paintType: ${change.paintType}`);
                            success = false; return; // continue forEach
                        }
                        updatedBlocks.add(block.id); // 更新対象として記録
                    } else {
                        console.warn(`[HistoryActions-Undo(${action.type})] Block ID ${change.blockId} が見つかりません。`);
                        success = false;
                    }
                });
                // 影響を受けたブロックのメッシュマテリアルを更新
                updatedBlocks.forEach(blockId => {
                    const block = loadedBlocks.find(b => b.id === blockId);
                    if (block?.mesh) {
                        updateBlockMeshMaterial(block); // マテリアル更新ヘルパーを呼び出す
                    }
                });
            } else {
                console.error(`[HistoryActions-Undo(${action.type})] 無効な changes データです。`, action);
                success = false;
            }
            break;
        }

        // --- 未対応のアクション ---
        default:
            console.warn(`[HistoryActions] 未対応のUndoアクションタイプ: ${action.type}`);
            success = false;
    }

    if (!success) { console.error(`[HistoryActions] Undo操作 (${action.type}) の一部または全てに失敗しました。`); }
    return success;
}

/**
 * 元に戻したアクションをやり直す (Redo) 処理を実行します。
 * loadedBlocks 配列の状態をアクション実行後の状態に戻し、
 * シーン内の対応する3Dメッシュも追加/削除/更新します。
 *
 * @param {object} action - やり直すアクションオブジェクト ({ type, ... })。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (変更対象)。
 * @param {THREE.Scene} scene - 3Dシーンオブジェクト (メッシュ操作用)。
 * @returns {boolean} 処理成功時は true、失敗または未対応アクションなら false。
 */
export function executeRedo(action, loadedBlocks, scene) {
     console.log('[HistoryActions] Redo 実行:', action.type);
     let success = true;

     switch (action.type) {
         // --- ブロック削除/カット/対称削除操作のやり直し ---
         // Undoで復元されたブロック(群)を loadedBlocks から削除し、メッシュも削除
         case 'DELETE_BLOCK':
         case 'CUT_BLOCKS':
         case 'DELETE_SYMMETRY': {
             // action オブジェクトから削除対象のブロック情報を取得
             const blocksToRedoDelete = action.blockData ? [action.blockData] : (action.deletedBlocksData || []);
             if (blocksToRedoDelete.length > 0) {
                 const idsToRemove = new Set(blocksToRedoDelete.map(info => info.id)); // 削除対象IDリスト
                 let removedCount = 0;
                 // loadedBlocks 配列を逆順に探索して削除
                 for (let i = loadedBlocks.length - 1; i >= 0; i--) {
                     if (idsToRemove.has(loadedBlocks[i].id)) {
                         const removedBlockData = loadedBlocks.splice(i, 1)[0]; // データ配列から削除
                         // シーンから対応するメッシュ(通常・前景)を削除
                         removeBlockMeshesFromScene(removedBlockData.id, scene);
                         removedCount++;
                     }
                 }
                 if (removedCount !== blocksToRedoDelete.length) { /* Warn */ }
             } else { console.error(`[HistoryActions-Redo(${action.type})] Redo対象のブロック情報不明。`, action); success = false; }
             break;
         }

         // --- ブロック追加/ペースト/対称配置操作のやり直し ---
         // Undoで削除されたブロック(群)を loadedBlocks に再追加し、メッシュも生成し、表示状態を設定
         case 'ADD_BLOCK':
         case 'PASTE_BLOCKS':
         case 'PLACE_SYMMETRY': {
            // action オブジェクトから再追加対象のブロック情報を取得
            const blocksToRedoAdd = action.blockData ? [action.blockData] : (action.addedBlocksData || action.placedBlocksData || []);
            if (blocksToRedoAdd.length > 0) {
                 const currentMode = getCurrentMode(); // 現在のモード取得
                 blocksToRedoAdd.forEach(blockInfo => {
                     if (!loadedBlocks.find(b => b.id === blockInfo.id)) { // 存在しないこと確認
                         try {
                             // 1. BlockData を復元
                             const restoredBlock = new BlockData( /* ... Undo と同様の引数で復元 ... */
                                blockInfo.definitionId, positionToXml(blockInfo.position), null,
                                blockInfo.surfaceColors ? `${blockInfo.surfaceColors.length},${blockInfo.surfaceColors.map(c => c === 'FFFFFF' ? 'x' : c).join(',')}` : null,
                                blockInfo.baseColor, blockInfo.additiveColor, blockInfo.tAttribute,
                                blockInfo.cAttributes, blockInfo.oAttributes, blockInfo.oChildren,
                                blockInfo.rotationMatrix, blockInfo.id
                             );
                             loadedBlocks.push(restoredBlock);

                             // 2. 通常メッシュ生成・追加
                             restoredBlock.mesh = createBlockMesh(restoredBlock);
                             if (!restoredBlock.mesh) throw new Error("通常メッシュ生成失敗");
                             scene.add(restoredBlock.mesh);

                             // 3. 前景メッシュ生成・追加 (常に用意)
                             const fgMat = foregroundCubeMaterialBase.clone();
                             restoredBlock.foregroundMesh = new THREE.Mesh(foregroundCubeGeometry, fgMat);
                             restoredBlock.foregroundMesh.userData = { isManagedBlockMesh: true, isForegroundCube: true, blockId: restoredBlock.id };
                             restoredBlock.foregroundMesh.matrixAutoUpdate = false;
                             scene.add(restoredBlock.foregroundMesh);

                             // 4. モードに基づき表示状態設定
                             setMeshStateBasedOnMode(restoredBlock, currentMode);

                             // 5. 位置・回転適用
                             restoredBlock.updateMeshMatrix();

                         } catch (e) { console.error(`[HistoryActions-Redo(${action.type})] BlockData復元/メッシュ処理エラー (ID: ${blockInfo.id}):`, e, blockInfo); success = false; }
                     } else { /* Warn: Block already exists */ }
                 });
            } else { console.error(`[HistoryActions-Redo(${action.type})] Redo対象のブロック情報不明。`, action); success = false; }
             break;
         }

         // --- ブロック変形操作のやり直し ---
         // 影響を受けたブロック(群)の position と rotationMatrix を操作後の状態 (newValue) に戻し、
         // 対応するメッシュの行列を更新する
         case 'TRANSFORM_BLOCKS':
         case 'TRANSFORM_GROUP': {
             if (action.transformations && Array.isArray(action.transformations)) {
                 action.transformations.forEach(t => {
                     const block = loadedBlocks.find(b => b.id === t.blockId);
                     if (block) {
                         // データ（位置と回転行列）を Redo 後の状態に
                         block.position.copy(t.newPosition);
                         block.rotationMatrix.copy(t.newRotationMatrix);
                         // メッシュの表示を更新
                         block.updateMeshMatrix();
                     } else { /* Warn */ success = false; }
                 });
             } else { console.error(`[HistoryActions-Redo(TRANSFORM)] 無効な transformations データ`, action); success = false; }
             break;
         }

         // --- プロパティ編集操作のやり直し ---
         // 影響を受けたブロック(群)のプロパティ値を操作後の状態 (newValue) に戻す
         case 'SET_PROPERTIES': {
            if (action.changes && Array.isArray(action.changes)) {
                 action.changes.forEach(change => {
                     const block = loadedBlocks.find(b => b.id === change.blockId);
                     if (block) {
                         // BlockData の値を Redo 後の状態に
                         setBlockPropertyValueInternal(block, change.propName, change.propSource, change.propType, change.newValue);
                         // 位置・回転・t属性に関わるプロパティが変更された場合はメッシュ行列も更新
                         if (change.propName === 't' || change.propName.startsWith('vp.') || change.propName.startsWith('r.')) {
                             block.updateMeshMatrix();
                         }
                         // TODO: 他のプロパティ変更がマテリアル等に影響する場合の処理
                     } else { /* Warn */ success = false; }
                 });
             } else { console.error(`[HistoryActions-Redo(SET_PROP)] 無効な changes データ`, action); success = false; }
            break;
        }

         // --- ペイント操作のやり直し / 色置換操作のやり直し ---
         // 影響を受けたブロック(群)の色情報を操作後の状態 (newValue) に戻し、
         // 対応するメッシュのマテリアルを更新する。
         case 'PAINT_BLOCK':
         case 'REPLACE_COLOR': {
             if (action.changes && Array.isArray(action.changes)) {
                 const updatedBlocks = new Set(); // マテリアル更新が必要なブロックID
                 action.changes.forEach(change => {
                     const block = loadedBlocks.find(b => b.id === change.blockId);
                     if (block) {
                         // BlockData の色情報を Redo 後の状態に
                         if (change.paintType === 'surface' && change.index !== undefined) {
                             block.setSurfaceColor(change.index, change.newValue);
                         } else if (change.paintType === 'base') {
                             block.setBaseColor(change.newValue);
                         } else if (change.paintType === 'additive') {
                             block.setAdditiveColor(change.newValue);
                         } else { console.warn(`[HistoryActions-Redo(${action.type})] 不明な paintType`); success = false; return; }
                         updatedBlocks.add(block.id);
                     } else { /* Warn */ success = false; }
                 });
                 // 影響を受けたブロックのメッシュマテリアルを更新
                 updatedBlocks.forEach(blockId => {
                    const block = loadedBlocks.find(b => b.id === blockId);
                    if (block?.mesh) {
                        updateBlockMeshMaterial(block);
                    }
                 });
             } else { console.error(`[HistoryActions-Redo(${action.type})] 無効な changes データ`, action); success = false; }
             break;
         }

         // --- 未対応のアクション ---
         default:
             console.warn(`[HistoryActions] 未対応のRedoアクションタイプ: ${action.type}`);
             success = false;
     }
     if (!success) console.error(`[HistoryActions] Redo操作 (${action.type}) の一部または全てに失敗しました。`);
     return success;
}


/**
 * BlockDataのプロパティ値を設定する内部ヘルパー関数。
 * (コメントは変更なし)
 * @param {BlockData} blockData - 対象のBlockData。
 * @param {string} propName - プロパティ名。
 * @param {string} propSource - プロパティのソース ('standard', 'c', 'o')。
 * @param {string} propType - プロパティの型 ('number', 'boolean', 'string')。
 * @param {string | number | boolean} value - 設定する値。
 * @private
 */
function setBlockPropertyValueInternal(blockData, propName, propSource, propType, value) {
    // (実装は変更なし)
    if (propSource === 'standard') { if (propName === 't') { blockData.setTAttribute(value); } else if (propName.startsWith('vp.')) { const axis = propName.slice(3); const currentPos = blockData.getPositionXml(); const newPos = { ...currentPos }; newPos[axis] = parseFloat(value); if (!isNaN(newPos.x) && !isNaN(newPos.y) && !isNaN(newPos.z)) { blockData.setPositionFromXml(newPos.x, newPos.y, newPos.z); } } else if (propName.startsWith('r.')) { const [, rStr, cStr] = propName.split('.'); const r = parseInt(rStr); const c = parseInt(cStr); const index = c * 3 + r; const currentElements = blockData.getRotationMatrixXmlElements(); const numValue = parseFloat(value); if (!isNaN(numValue)) { currentElements[index] = Math.round(numValue); blockData.setRotationMatrixFromXmlElements(currentElements); } } else { /* Warn */ } }
    else if (propSource === 'c') { blockData.setCAttribute(propName, String(value)); } else if (propSource === 'o') { blockData.setOAttribute(propName, String(value)); } else { /* Warn */ }
}


/**
 * 指定された BlockData のメッシュマテリアルを、現在の BlockData の色情報に基づいて更新します。
 * (PAINT_BLOCK / REPLACE_COLOR の Undo/Redo 用ヘルパー)
 * (コメントは変更なし)
 * @param {BlockData} blockData - マテリアルを更新する BlockData。
 * @private
 */
function updateBlockMeshMaterial(blockData) {
    // (実装は変更なし)
    if (!blockData?.mesh || !blockData.mesh.material) return; const mesh = blockData.mesh; const definition = getBlockDefinition(blockData.definitionId); const geometry = mesh.geometry; const isUnknown = definition.type === 'unknown_cube'; if (isUnknown) return; const surfaceColors = blockData.surfaceColors; const baseColor = blockData.getBaseColor(); const numGroups = geometry.groups.length; const numSurfaceColors = surfaceColors ? surfaceColors.length : 0; const requiresArrayMaterial = !isUnknown && numGroups > 0 && numSurfaceColors >= numGroups;
    if (requiresArrayMaterial) { if (!Array.isArray(mesh.material)) { /* Warn, Recover */ mesh.material = []; geometry.groups.forEach(() => mesh.material.push(getOrCreateMaterial(null))); } geometry.groups.forEach((group, groupIndex) => { if (groupIndex < mesh.material.length) { const scIndex = group.materialIndex; const colorCode = (scIndex !== undefined && scIndex < numSurfaceColors && surfaceColors[scIndex]?.toLowerCase() !== 'x') ? surfaceColors[scIndex] : (baseColor || DEFAULT_SURFACE_COLOR); const cachedMat = getOrCreateMaterial(colorCode); if (mesh.material[groupIndex] !== cachedMat) { mesh.material[groupIndex] = cachedMat; } } }); if (mesh.material.needsUpdate !== undefined) mesh.material.needsUpdate = true; }
    else { const fallbackColor = baseColor || (numSurfaceColors > 0 && surfaceColors[0]?.toLowerCase() !== 'x' ? surfaceColors[0] : null); const newMat = getOrCreateMaterial(fallbackColor); if (mesh.material !== newMat) { mesh.material = newMat; } }
}

/**
 * 指定された BlockData のメッシュの表示状態（マテリアル、可視性）を、
 * 現在の編集モードに合わせて設定します。
 * (ADD/DELETE の Undo/Redo ヘルパー)
 * @param {BlockData} blockData - 対象の BlockData。
 * @param {EditMode} currentMode - 現在の編集モード。
 * @private
 */
function setMeshStateBasedOnMode(blockData, currentMode) {
    if (!blockData || !blockData.mesh || !blockData.foregroundMesh) {
        console.warn("[HistoryActions] setMeshStateBasedOnMode: 対象の BlockData またはメッシュが不完全です。", blockData);
        return;
    }

    if (currentMode === EditMode.XML_EDIT) {
        // --- XML編集モード時の表示 ---
        // 前景メッシュを表示
        blockData.foregroundMesh.visible = true;
        // 通常メッシュをゴースト表示
        // ゴーストマテリアルを取得/生成 (blockRenderer のロジックに近づける)
        let ghostColor = ghostMaterialBase.color.clone();
        const bc = blockData.getBaseColor();
        const sc0 = blockData.surfaceColors && blockData.surfaceColors.length > 0 ? blockData.surfaceColors[0] : null;
        let colorCode = bc || (sc0?.toLowerCase() !== 'x' ? sc0 : null);
        if (colorCode) { try { ghostColor.set(`#${colorCode}`); } catch(e){} }
        // TODO: ゴーストマテリアルのキャッシュ機構を使う (blockRenderer参照)
        const ghostMatInstance = ghostMaterialBase.clone(); // 簡易的に毎回クローン
        ghostMatInstance.color.copy(ghostColor);
        blockData.mesh.material = ghostMatInstance;
        blockData.mesh.visible = true;
    } else {
        // --- 通常モードなど (XML編集モード以外) の表示 ---
        // 前景メッシュを非表示
        blockData.foregroundMesh.visible = false;
        // 通常メッシュを通常のマテリアルで表示
        updateBlockMeshMaterial(blockData); // 通常色マテリアルに戻す/設定
        blockData.mesh.visible = true;
    }
}