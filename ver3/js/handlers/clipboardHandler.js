/**
 * @fileoverview 範囲選択モードでのコピー(Ctrl+C)およびカット(Ctrl+X)操作を処理します。
 * 選択範囲内のブロックデータをクリップボード状態に格納し、カットの場合は元ブロックを削除します。
 */

import * as THREE from 'three';
import { getSelectionRangeBox } from '../interactions/selectionState.js';
import { getBlocksInBox } from '../interactions/interactionUtils.js';
import { setClipboardData, clearClipboardData } from '../state/clipboardState.js';
import { BlockData } from '../data/blockData.js'; // アンドゥ情報作成のため型情報を使う可能性
import { addAction } from '../state/historyManager.js';

// --- 計算用一時変数 ---
const _v1 = new THREE.Vector3();
const _box = new THREE.Box3();

// --- 定数 ---
const MAX_COPY_COUNT = 1000;

// --- 公開関数 ---

/**
 * 現在の選択範囲内のブロックデータをクリップボードにコピーします。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function copySelectionToClipboard(appState) {
    // ... (変更なし) ...
    console.log("[ClipboardHandler] クリップボードへコピー開始...");
    const currentRange = getSelectionRangeBox();
    if (!currentRange || currentRange.isEmpty()) {
        console.warn("[ClipboardHandler] コピー対象の有効な選択範囲がありません。");
        clearClipboardData();
        return;
    }
    const blocksToCopy = getBlocksInBox(currentRange, appState.loadedBlocks);
    if (blocksToCopy.length === 0) {
        console.log("[ClipboardHandler] 選択範囲内にコピー対象のブロックがありません。");
        clearClipboardData();
        return;
    }
    if (blocksToCopy.length > MAX_COPY_COUNT) {
         console.warn(`[ClipboardHandler] 一度にコピーできるブロック数(${MAX_COPY_COUNT})を超えています。`);
         alert(`コピー制限: 一度にコピーできるのは ${MAX_COPY_COUNT} ブロックまでです。`);
         return;
    }
    const originPoint = currentRange.getCenter(_v1).round();
    const copiedBlocksData = blocksToCopy.map(blockData => ({
        definitionId: blockData.definitionId,
        colorIndices: [...blockData.colorIndices],
        position: blockData.position.clone(),
        rotationMatrix: blockData.rotationMatrix.clone(),
        originalId: blockData.id
    }));
    setClipboardData(copiedBlocksData, originPoint);
    console.log(`[ClipboardHandler] ${copiedBlocksData.length} 個のブロックをクリップボードにコピーしました。`);
}

/**
 * 現在の選択範囲内のブロックデータをクリップボードにカットします (コピー後に元を削除)。
 * 削除操作は単一のアンドゥ単位として履歴に登録されます。
 * @param {object} appState - アプリケーションの状態オブジェクト (loadedBlocks, scene を含む)。
 */
export function cutSelectionToClipboard(appState) {
    console.log("[ClipboardHandler] クリップボードへカット開始...");
    const currentRange = getSelectionRangeBox();
    if (!currentRange || currentRange.isEmpty()) {
        console.warn("[ClipboardHandler] カット対象の有効な選択範囲がありません。");
        clearClipboardData();
        return;
    }

    const blocksToCut = getBlocksInBox(currentRange, appState.loadedBlocks);
    if (blocksToCut.length === 0) {
        console.log("[ClipboardHandler] 選択範囲内にカット対象のブロックがありません。");
        clearClipboardData();
        return;
    }
     if (blocksToCut.length > MAX_COPY_COUNT) {
         console.warn(`[ClipboardHandler] 一度にカットできるブロック数(${MAX_COPY_COUNT})を超えています。処理を中断します。`);
         alert(`カット制限: 一度にカットできるのは ${MAX_COPY_COUNT} ブロックまでです。`);
         return;
     }

    const originPoint = currentRange.getCenter(_v1).round();

    // --- 1. クリップボード用データのディープコピー ---
    const copiedBlocksData = blocksToCut.map(blockData => ({
        definitionId: blockData.definitionId,
        colorIndices: [...blockData.colorIndices],
        position: blockData.position.clone(),
        rotationMatrix: blockData.rotationMatrix.clone(),
        originalId: blockData.id
    }));

    // --- 2. 元ブロックの削除処理 と アンドゥ用情報作成 ---
    console.log(`[ClipboardHandler] ${blocksToCut.length} 個のブロックを削除します...`);
    const deletedBlocksInfo = [];
    const blockIdsToDelete = new Set(blocksToCut.map(b => b.id));
    // ★修正: filterではなく、元の配列を直接変更する
    const remainingBlocks = []; // 削除対象外のブロックを一時的に保持する配列

    for (const block of appState.loadedBlocks) {
        if (blockIdsToDelete.has(block.id)) {
            // --- 削除対象の処理 ---
            // a) アンドゥ用の情報を保存
            deletedBlocksInfo.push({
                id: block.id,
                definitionId: block.definitionId,
                position: block.position.clone(),
                rotationMatrix: block.rotationMatrix.clone(),
                colorIndices: [...block.colorIndices],
                mesh: null,
                foregroundMesh: null
            });
            // b) メッシュをシーンから削除 & リソース破棄
            if (block.mesh && block.mesh.parent) {
                appState.scene.remove(block.mesh);
                // マテリアル破棄 (クローンされたもののみ)
                // 注意: 共有マテリアルを破棄しないように判定が必要
                if (block.mesh.material && typeof block.mesh.material.dispose === 'function') {
                     // 例: 名前で判定 (より確実な方法があればそれがベスト)
                     const matName = block.mesh.material.name || '';
                     if(matName !== 'unknownMaterial' && !matName.includes('Base')) {
                          block.mesh.material.dispose();
                     }
                }
            }
            if (block.foregroundMesh && block.foregroundMesh.parent) {
                appState.scene.remove(block.foregroundMesh);
                if (block.foregroundMesh.material && typeof block.foregroundMesh.material.dispose === 'function') {
                    block.foregroundMesh.material.dispose();
                }
            }
        } else {
            // 削除対象外のブロックは一時配列へ
            remainingBlocks.push(block);
        }
    }

    // --- 3. loadedBlocks の内容を更新 & 履歴登録 & クリップボード設定 ---
    if (deletedBlocksInfo.length > 0) {
        // ★修正: 元の配列の内容を、削除対象外のブロックで置き換える
        appState.loadedBlocks.length = 0; // 元の配列を空にする
        appState.loadedBlocks.push(...remainingBlocks); // 新しい内容を push

        // アンドゥ履歴に登録
        addAction({
            type: 'CUT_BLOCKS',
            deletedBlocksData: deletedBlocksInfo
        });
        console.log(`[ClipboardHandler] ${deletedBlocksInfo.length} 個のブロックを削除し、アンドゥ履歴 'CUT_BLOCKS' を登録しました。`);

        // クリップボード状態を設定
        setClipboardData(copiedBlocksData, originPoint);
        console.log(`[ClipboardHandler] ${copiedBlocksData.length} 個のブロックをクリップボードに設定しました。`);

        // レンダリング更新が必要な場合があるため通知
        // (historyManager は undo/redo 時のみ再描画するため)
        document.dispatchEvent(new CustomEvent('blocksChanged')); // 例: main.js でリッスンして renderBlocks を呼ぶなど

    } else {
        console.warn("[ClipboardHandler] カット対象として識別されたブロックが削除されませんでした。");
        clearClipboardData();
    }
}