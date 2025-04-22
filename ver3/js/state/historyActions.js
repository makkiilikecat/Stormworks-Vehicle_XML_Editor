/**
 * @fileoverview アンドゥ・リドゥの各アクションタイプに対応する具体的な状態変更処理。
 * historyManager.js から呼び出され、現在のブロックデータ配列やシーンを操作します。
 * このモジュール自体は履歴スタックを管理せず、純粋なアクションの実行を担当します。
 * シーンの再描画は historyManager 側で行われる想定です。
 */

import * as THREE from 'three'; // Matrix4, Vector3, Quaternion を使用
import { BlockData } from '../data/blockData.js'; // BlockDataクラス定義
import { placeBlock } from '../interactions/blockActions.js'; // placeBlockはUndo/Redoでは直接使わない方が良い場合が多い

// --- 計算用一時変数 (Undo/Redoの計算で使用) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

/**
 * アクションを元に戻す処理 (アンドゥ) を実行します。
 * 状態の変更のみを行い、シーンの再描画は呼び出し元 (historyManager) が担当します。
 * @param {object} action - 元に戻すアクションオブジェクト (例: { type: 'ADD_BLOCK', blockData: {...} })。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この配列が直接変更されます)。
 * @param {THREE.Scene} scene - 3Dシーン (主にメッシュ削除で使用)。
 * @returns {boolean} アクションの実行に成功した場合はtrue、失敗または未対応の場合はfalse。
 */
export function executeUndo(action, loadedBlocks, scene) {
    console.log('[HistoryActions] Undo 実行:', action.type);
    let success = true;

    switch (action.type) {
        // --- ブロック追加を元に戻す -> 削除 ---
        case 'ADD_BLOCK':
            // action.blockData は追加されたブロックの情報コピー
            const indexToAddUndo = loadedBlocks.findIndex(b => b.id === action.blockData.id);
            if (indexToAddUndo !== -1) {
                const blockToDeleteUndo = loadedBlocks[indexToAddUndo];
                // メッシュ削除 & リソース破棄
                if (blockToDeleteUndo.mesh && blockToDeleteUndo.mesh.parent) {
                    scene.remove(blockToDeleteUndo.mesh);
                    disposeMaterial(blockToDeleteUndo.mesh.material);
                }
                if (blockToDeleteUndo.foregroundMesh && blockToDeleteUndo.foregroundMesh.parent) {
                    scene.remove(blockToDeleteUndo.foregroundMesh);
                    disposeMaterial(blockToDeleteUndo.foregroundMesh.material);
                }
                // 配列から削除
                loadedBlocks.splice(indexToAddUndo, 1);
            } else {
                console.warn(`[HistoryActions-Undo(ADD)] Block ID ${action.blockData.id} が見つかりません。`);
                success = false;
            }
            break;

        // --- ブロック削除を元に戻す -> 再追加 ---
        case 'DELETE_BLOCK':
            // action.blockData は削除されたブロック情報のコピー (mesh参照なし)
            if (!loadedBlocks.find(b => b.id === action.blockData.id)) {
                // BlockData オブジェクトとして loadedBlocks に戻す
                // (renderBlocks が mesh を再生成する想定)
                loadedBlocks.push(action.blockData);
            } else {
                console.warn(`[HistoryActions-Undo(DELETE)] Block ID ${action.blockData.id} が既に存在します。`);
                success = false;
            }
            break;

        // --- カット操作を元に戻す -> 削除されたブロックを再追加 ---
        case 'CUT_BLOCKS':
            if (action.deletedBlocksData && Array.isArray(action.deletedBlocksData)) {
                action.deletedBlocksData.forEach(deletedInfo => {
                    if (!loadedBlocks.find(b => b.id === deletedInfo.id)) {
                        loadedBlocks.push(deletedInfo); // renderBlocks でメッシュ再生成
                    } else {
                        console.warn(`[HistoryActions-Undo(CUT)] Block ID ${deletedInfo.id} が既に存在します。`);
                    }
                });
                 if(action.deletedBlocksData.length === 0) success = false;
            } else { success = false; }
            break;

        // --- ペースト操作を元に戻す -> 追加されたブロックを削除 ---
        case 'PASTE_BLOCKS':
            if (action.addedBlocksData && Array.isArray(action.addedBlocksData)) {
                const idsToDeletePaste = new Set(action.addedBlocksData.map(info => info.id));
                let deletedCount = 0;
                // ★修正: 元の配列を直接変更 (逆順ループで splice)
                for (let i = loadedBlocks.length - 1; i >= 0; i--) {
                    const block = loadedBlocks[i];
                    if (idsToDeletePaste.has(block.id)) {
                        // メッシュ削除 & リソース破棄
                        if (block.mesh && block.mesh.parent) { scene.remove(block.mesh); disposeMaterial(block.mesh.material); }
                        if (block.foregroundMesh && block.foregroundMesh.parent) { scene.remove(block.foregroundMesh); disposeMaterial(block.foregroundMesh.material); }
                        loadedBlocks.splice(i, 1);
                        deletedCount++;
                    }
                }
                if (deletedCount !== action.addedBlocksData.length) {
                     console.warn(`[HistoryActions-Undo(PASTE)] 削除対象のブロック数が一致しません (${deletedCount}/${action.addedBlocksData.length})`);
                }
                if (deletedCount === 0 && action.addedBlocksData.length > 0) success = false;
            } else { success = false; }
            break;

        // --- 変形操作 (単一/グループ/ドラッグ) を元に戻す ---
        case 'TRANSFORM_BLOCKS':
        case 'TRANSFORM_GROUP':
            if (action.transformations && Array.isArray(action.transformations)) {
                action.transformations.forEach(t => {
                    const block = loadedBlocks.find(b => b.id === t.blockId);
                    if (block) {
                        // 古い行列 (oldMatrix) から位置と回転・スケールを復元
                        const oldPosition = _v1.setFromMatrixPosition(t.oldMatrix);
                        const oldQuaternion = _q1.setFromRotationMatrix(t.oldMatrix);
                        const oldScale = _v2.setFromMatrixScale(t.oldMatrix);
                        block.position.copy(oldPosition);
                        block.rotationMatrix.compose(new THREE.Vector3(), oldQuaternion, oldScale);
                    } else { console.warn(`[HistoryActions-Undo(TRANSFORM)] Block ID ${t.blockId} が見つかりません。`); }
                });
            } else { success = false; }
            break;

        // --- プロパティ設定を元に戻す ---
        case 'SET_PROPERTIES':
            if (action.changes && Array.isArray(action.changes)) {
                action.changes.forEach(change => {
                    const block = loadedBlocks.find(b => b.id === change.blockId);
                    if (block) {
                        // 古い値 (oldValue) を使ってプロパティを復元
                        setBlockPropertyValueInternal(block, change.propertyPath, change.matrixRow, change.matrixCol, change.oldValue);
                    } else { console.warn(`[HistoryActions-Undo(SET_PROPERTIES)] Block ID ${change.blockId} が見つかりません。`); }
                });
            } else { success = false; }
            break;

        // TODO: 他のアクションタイプ (範囲変更など) のアンドゥ処理を追加

        default:
            console.warn(`[HistoryActions] 未対応のアンドゥアクションタイプ: ${action.type}`);
            success = false;
    }
    // アンドゥ/リドゥ後の再描画は historyManager 側で行う
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
        // --- ブロック追加をやり直す -> 再追加 ---
        case 'ADD_BLOCK':
            if (!loadedBlocks.find(b => b.id === action.blockData.id)) {
                loadedBlocks.push(action.blockData); // renderBlocks でメッシュ生成
            } else { success = false; }
            break;

        // --- ブロック削除をやり直す -> 再削除 ---
        case 'DELETE_BLOCK':
             const blockToRedoDelete = loadedBlocks.find(b => b.id === action.blockData.id);
             if (blockToRedoDelete) {
                 const index = loadedBlocks.indexOf(blockToRedoDelete);
                 if (index > -1) loadedBlocks.splice(index, 1);
                 if (blockToRedoDelete.mesh && blockToRedoDelete.mesh.parent) { scene.remove(blockToRedoDelete.mesh); disposeMaterial(blockToRedoDelete.mesh.material); }
                 if (blockToRedoDelete.foregroundMesh && blockToRedoDelete.foregroundMesh.parent) { scene.remove(blockToRedoDelete.foregroundMesh); disposeMaterial(blockToRedoDelete.foregroundMesh.material); }
             } else { success = false; }
            break;

        // --- カット操作をやり直す -> 再削除 ---
        case 'CUT_BLOCKS':
             if (action.deletedBlocksData && Array.isArray(action.deletedBlocksData)) {
                 const idsToRedoDelete = new Set(action.deletedBlocksData.map(info => info.id));
                 let deletedCount = 0;
                 // ★修正: 元の配列を直接変更 (逆順ループで splice)
                 for (let i = loadedBlocks.length - 1; i >= 0; i--) {
                     const block = loadedBlocks[i];
                     if (idsToRedoDelete.has(block.id)) {
                         // メッシュ削除 & リソース破棄
                         if (block.mesh && block.mesh.parent) { scene.remove(block.mesh); disposeMaterial(block.mesh.material); }
                         if (block.foregroundMesh && block.foregroundMesh.parent) { scene.remove(block.foregroundMesh); disposeMaterial(block.foregroundMesh.material); }
                         loadedBlocks.splice(i, 1);
                         deletedCount++;
                     }
                 }
                  if (deletedCount !== action.deletedBlocksData.length) {
                       console.warn(`[HistoryActions-Redo(CUT)] 削除対象のブロック数が一致しません (${deletedCount}/${action.deletedBlocksData.length})`);
                  }
                  if (deletedCount === 0 && action.deletedBlocksData.length > 0) success = false;
             } else { success = false; }
            break;

        // --- ペースト操作をやり直す -> 再追加 ---
        case 'PASTE_BLOCKS':
            if (action.addedBlocksData && Array.isArray(action.addedBlocksData)) {
                action.addedBlocksData.forEach(addedInfo => {
                    if (!loadedBlocks.find(b => b.id === addedInfo.id)) {
                        loadedBlocks.push(addedInfo); // renderBlocks でメッシュ再生成
                    } else {
                         console.warn(`[HistoryActions-Redo(PASTE)] Block ID ${addedInfo.id} が既に存在します。`);
                    }
                });
                 if(action.addedBlocksData.length === 0) success = false;
            } else { success = false; }
            break;

        // --- 変形操作をやり直す ---
        case 'TRANSFORM_BLOCKS':
        case 'TRANSFORM_GROUP':
             if (action.transformations && Array.isArray(action.transformations)) {
                 action.transformations.forEach(t => {
                     const block = loadedBlocks.find(b => b.id === t.blockId);
                     if (block) {
                         // 新しい行列 (newMatrix) から位置と回転・スケールを復元
                         const newPosition = _v1.setFromMatrixPosition(t.newMatrix);
                         const newQuaternion = _q1.setFromRotationMatrix(t.newMatrix);
                         const newScale = _v2.setFromMatrixScale(t.newMatrix);
                         block.position.copy(newPosition);
                         block.rotationMatrix.compose(new THREE.Vector3(), newQuaternion, newScale);
                     } else { /* Warn */ }
                 });
             } else { success = false; }
            break;

        // --- プロパティ設定をやり直す ---
        case 'SET_PROPERTIES':
            if (action.changes && Array.isArray(action.changes)) {
                 action.changes.forEach(change => {
                     const block = loadedBlocks.find(b => b.id === change.blockId);
                     if (block) {
                         setBlockPropertyValueInternal(block, change.propertyPath, change.matrixRow, change.matrixCol, change.newValue);
                     } else { /* Warn */ }
                 });
             } else { success = false; }
            break;

        // TODO: 他のアクションタイプの リドゥ 処理

        default:
            console.warn(`[HistoryActions] 未対応のリドゥアクションタイプ: ${action.type}`);
            success = false;
    }
    // アンドゥ/リドゥ後の再描画は historyManager 側で行う
    return success;
}


// --- ヘルパー関数 ---

/**
 * マテリアルの dispose を安全に呼び出します。配列も考慮します。
 * 共有マテリアル（名前で判定）は破棄しません。
 * @param {THREE.Material | THREE.Material[]} material
 * @private
 */
function disposeMaterial(material) {
    if (!material) return;
    if (Array.isArray(material)) {
        material.forEach(m => disposeMaterial(m)); // 配列なら再帰的に処理
    } else if (typeof material.dispose === 'function') {
        // 共有マテリアルでないことを確認してから破棄
        const matName = material.name || '';
        // Base Material や Unknown Material など、特定の名前を持つものは破棄しない (仮の判定)
        if (matName !== 'unknownMaterial' && !matName.includes('Base') && matName !== 'foregroundCubeMaterial') {
             console.log(`[HistoryActions] Disposing material: ${matName || material.uuid}`);
             material.dispose();
        }
    }
}


/**
 * BlockDataの指定されたプロパティに値を設定する内部関数 (SET_PROPERTIES用)。
 * @param {BlockData} blockData - 対象のBlockData。
 * @param {string | null} propertyPath - 'vp.x' 等。
 * @param {number} row - 行列の行 (-1以外)。
 * @param {number} col - 行列の列 (-1以外)。
 * @param {number} value - 設定する値。
 * @private
 */
function setBlockPropertyValueInternal(blockData, propertyPath, row, col, value) {
    if (propertyPath) {
        const parts = propertyPath.split('.'); // "vp.x"
        const prop = parts[1];
        const currentPosXml = blockData.getPositionXml();
        currentPosXml[prop] = value;
        blockData.setPositionFromXml(currentPosXml.x, currentPosXml.y, currentPosXml.z);
    } else if (row !== -1 && col !== -1) {
        const currentElements = blockData.getRotationMatrixXmlElements();
        const index = col * 3 + row;
        currentElements[index] = value;
        blockData.setRotationMatrixFromXmlElements(currentElements);
    } else {
         console.error("[HistoryActions] setBlockPropertyValueInternal: Invalid arguments.");
    }
    // 注意: メッシュ更新は historyManager の renderBlocks に任せる
}