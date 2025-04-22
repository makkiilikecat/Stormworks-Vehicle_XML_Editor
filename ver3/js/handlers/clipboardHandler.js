/**
 * @fileoverview 範囲選択モードでのコピー(Ctrl+C)、カット(Ctrl+X)、ペースト(Ctrl+V)操作を処理します。
 * 選択範囲内のブロックデータをクリップボード状態に格納し、カットの場合は元ブロックを削除します。
 */

import * as THREE from 'three';
// 状態管理とユーティリティをインポート
import { getSelectionRangeBox } from '../interactions/selectionState.js';
import { getBlocksInBox } from '../interactions/interactionUtils.js'; // 範囲内ブロック取得
import { setClipboardData, clearClipboardData, getClipboardData, hasClipboard } from '../state/clipboardState.js'; // クリップボード状態操作
// ★ 修正: placeBlock をインポート
import { deleteBlock, placeBlock } from '../interactions/blockActions.js'; // カット時の削除、ペースト時の配置
import { addAction } from '../state/historyManager.js'; // カット、ペースト操作の履歴登録
import { BlockData } from '../data/blockData.js'; // アンドゥ情報作成用

// --- 計算用一時変数 ---
const _v1 = new THREE.Vector3();
const _pastePosition = new THREE.Vector3(); // pasteFromClipboard内で使用

// --- 定数 ---
const MAX_COPY_COUNT = 1000; // 一度にコピー/カットできるブロック数の上限

// --- 公開関数 ---

/**
 * 現在の選択範囲内のブロックデータをクリップボードにコピーします。
 * 各ブロックの位置はワールド座標で保持します。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function copySelectionToClipboard(appState) {
    console.log("[ClipboardHandler] クリップボードへコピー開始...");
    const currentRange = getSelectionRangeBox(); // 現在の選択範囲(Box3)を取得
    if (!currentRange || currentRange.isEmpty()) {
        console.warn("[ClipboardHandler] コピー対象の有効な選択範囲がありません。");
        clearClipboardData(); // 既存のクリップボードをクリア
        return;
    }

    // 範囲内のブロックを取得
    const blocksToCopy = getBlocksInBox(currentRange, appState.loadedBlocks);
    if (blocksToCopy.length === 0) {
        console.log("[ClipboardHandler] 選択範囲内にコピー対象のブロックがありません。");
        clearClipboardData();
        return;
    }
    // 上限チェック
    if (blocksToCopy.length > MAX_COPY_COUNT) {
         console.warn(`[ClipboardHandler] 一度にコピーできるブロック数(${MAX_COPY_COUNT})を超えています。`);
         alert(`コピー制限: 一度にコピーできるのは ${MAX_COPY_COUNT} ブロックまでです。`);
         return;
    }

    // コピー元の基準点 (選択範囲の中心、整数座標) を取得
    const originPoint = currentRange.getCenter(_v1).round();

    // --- ブロックデータのディープコピー ---
    // CopiedBlockData の配列を作成 (ワールド座標と回転を保持)
    const copiedBlocksData = blocksToCopy.map(blockData => {
        return {
            definitionId: blockData.definitionId,
            colorIndices: [...blockData.colorIndices],
            position: blockData.position.clone(),     // ワールド位置
            rotationMatrix: blockData.rotationMatrix.clone(), // ワールド回転
            originalId: blockData.id
        };
    });

    // クリップボード状態を設定
    setClipboardData(copiedBlocksData, originPoint);
    console.log(`[ClipboardHandler] ${copiedBlocksData.length} 個のブロックをクリップボードにコピーしました。基準点:`, originPoint);
    // (コピー成功のフィードバックUIなど)
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
         console.warn(`[ClipboardHandler] 一度にカットできるブロック数(${MAX_COPY_COUNT})を超えています。`);
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
    const deletedBlocksInfo = []; // アンドゥ用に削除情報を記録
    const blockIdsToDelete = new Set(blocksToCut.map(b => b.id));
    const remainingBlocks = [];   // 削除対象外のブロックを一時的に保持

    // loadedBlocks を走査し、削除対象を特定・処理
    for (const block of appState.loadedBlocks) {
        if (blockIdsToDelete.has(block.id)) {
            // --- 削除対象の処理 ---
            // a) アンドゥ用の情報を保存
            deletedBlocksInfo.push({
                id: block.id, definitionId: block.definitionId,
                position: block.position.clone(), rotationMatrix: block.rotationMatrix.clone(),
                colorIndices: [...block.colorIndices],
                mesh: null, foregroundMesh: null // メッシュ参照は含めない
            });
            // b) メッシュをシーンから削除 & リソース破棄
            if (block.mesh && block.mesh.parent) {
                appState.scene.remove(block.mesh);
                if (block.mesh.material?.dispose) {
                    const matName = block.mesh.material.name || '';
                    if(matName !== 'unknownMaterial' && !matName.includes('Base')) {
                         // block.mesh.material.dispose(); // 再利用考慮でコメントアウト継続
                    }
                }
            }
            if (block.foregroundMesh && block.foregroundMesh.parent) {
                appState.scene.remove(block.foregroundMesh);
                if (block.foregroundMesh.material?.dispose) {
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
        // 元の配列の内容を更新 (参照を維持)
        appState.loadedBlocks.length = 0;
        appState.loadedBlocks.push(...remainingBlocks);

        // アンドゥ履歴にまとめて登録
        addAction({ type: 'CUT_BLOCKS', deletedBlocksData: deletedBlocksInfo });
        console.log(`[ClipboardHandler] ${deletedBlocksInfo.length} 個のブロックを削除し、アンドゥ履歴 'CUT_BLOCKS' を登録しました。`);

        // クリップボード状態を設定 (削除が成功してから)
        setClipboardData(copiedBlocksData, originPoint);
        console.log(`[ClipboardHandler] ${copiedBlocksData.length} 個のブロックをクリップボードに設定しました。`);

        // レンダリング更新を促す
        document.dispatchEvent(new CustomEvent('blocksChanged'));
    } else {
        console.warn("[ClipboardHandler] カット対象として識別されたブロックが削除されませんでした。");
        clearClipboardData(); // 失敗時はクリップボードもクリア
    }
}


/**
 * クリップボードの内容を現在の選択範囲の中心を基準に貼り付けます。
 * ペースト操作全体を単一のアンドゥ単位として登録します。
 * @param {object} appState - アプリケーションの状態オブジェクト (loadedBlocks, scene を含む)。
 */
export function pasteFromClipboard(appState) {
    console.log("[ClipboardHandler] クリップボードから貼り付け開始...");
    const clipboardContent = getClipboardData();
    if (!clipboardContent || !clipboardContent.blocks || clipboardContent.blocks.length === 0) {
        console.warn("[ClipboardHandler] クリップボードにデータがないため、貼り付けできません。"); return;
    }
    const pasteRange = getSelectionRangeBox();
    if (!pasteRange || pasteRange.isEmpty()) {
        console.warn("[ClipboardHandler] 貼り付け先の有効な選択範囲がありません。"); return;
    }
    const pasteCenter = pasteRange.getCenter(_v1).round(); // 貼り付け中心 (整数)
    const copyOrigin = clipboardContent.origin;           // コピー時の基準点

    const addedBlocks = [];      // 実際に追加されたBlockData (Undo処理用)
    const addedBlocksInfo = []; // アンドゥ履歴登録用の情報コピー

    console.log(`[ClipboardHandler] ${clipboardContent.blocks.length} 個のブロックを貼り付けます...`);
    clipboardContent.blocks.forEach(copiedBlockData => {
        // a) 貼り付け先のワールド座標計算: pastePos = pasteCenter + (copiedPos - copyOrigin)
        _pastePosition.copy(copiedBlockData.position).sub(copyOrigin).add(pasteCenter).round();
        // b) 回転行列はクリップボードのものをそのまま使用
        const pasteRotation = copiedBlockData.rotationMatrix;
        // c) 定義ID取得
        const definitionId = copiedBlockData.definitionId;

        // d) 貼り付け先にブロックが存在しないかチェック
        const isOccupied = appState.loadedBlocks.some(block => block.position.equals(_pastePosition));

        if (!isOccupied) {
            // e) placeBlock で配置 (履歴登録は抑制)
            const placedBlock = placeBlock(
                _pastePosition, pasteRotation, definitionId,
                appState.loadedBlocks, appState.scene,
                true // isHistoryAction = true
            );
            if (placedBlock) {
                addedBlocks.push(placedBlock); // Undo用リストに追加
                // アンドゥ履歴用の情報コピーを作成
                addedBlocksInfo.push({
                    id: placedBlock.id, definitionId: placedBlock.definitionId,
                    position: placedBlock.position.clone(), rotationMatrix: placedBlock.rotationMatrix.clone(),
                    colorIndices: [...placedBlock.colorIndices],
                    mesh: null, foregroundMesh: null
                });
            } else { console.warn(`[ClipboardHandler] ブロック ${definitionId} の配置に失敗 (${_pastePosition.x},${_pastePosition.y},${_pastePosition.z})。`); }
        } else { console.log(`[ClipboardHandler] 貼り付け先 (${_pastePosition.x},${_pastePosition.y},${_pastePosition.z}) は既にブロックが存在するためスキップ。`); }
    });

    // --- アンドゥ履歴登録 ---
    if (addedBlocksInfo.length > 0) {
        console.log(`[ClipboardHandler] ${addedBlocksInfo.length} 個のブロックを貼り付けました。`);
        addAction({ type: 'PASTE_BLOCKS', addedBlocksData: addedBlocksInfo });
        console.log("[ClipboardHandler] アンドゥ履歴 'PASTE_BLOCKS' を登録しました。");
        // レンダリング更新通知
        document.dispatchEvent(new CustomEvent('blocksChanged'));
    } else {
         console.log("[ClipboardHandler] 貼り付けられるブロックがありませんでした。");
    }
    // ペースト後もクリップボードの内容は維持
}