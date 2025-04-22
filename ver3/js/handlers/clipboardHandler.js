/**
 * @fileoverview 範囲選択モードでのコピー(Ctrl+C)、カット(Ctrl+X)、ペースト(Ctrl+V)操作を処理します。
 */

import * as THREE from 'three';
// 状態管理とユーティリティをインポート
import { getSelectionRangeBox } from '../interactions/selectionState.js';
import { getBlocksInBox } from '../interactions/interactionUtils.js'; // 範囲内ブロック取得
import { setClipboardData, clearClipboardData, getClipboardData, hasClipboard } from '../state/clipboardState.js'; // クリップボード操作
import { deleteBlock, placeBlock } from '../interactions/blockActions.js'; // ブロック配置・削除 (placeBlockを使用)
import { addAction } from '../state/historyManager.js'; // アンドゥ履歴登録
import { BlockData } from '../data/blockData.js'; // 型情報として (現在は未使用)

// --- 計算用一時変数 ---
const _v1 = new THREE.Vector3(); // 汎用ベクトル
const _box = new THREE.Box3();   // 範囲計算用
const _pastePosition = new THREE.Vector3(); // 貼り付け位置計算用

// --- 定数 ---
const MAX_COPY_COUNT = 1000; // 一度にコピー/カットできるブロック数の上限

// --- 公開関数 ---

/**
 * 現在の選択範囲内のブロックデータをクリップボードにコピーします。
 * 各ブロックのワールド座標と回転を保持します。
 * @param {object} appState - アプリケーションの状態オブジェクト (loadedBlocks を含む)。
 */
export function copySelectionToClipboard(appState) {
    console.log("[ClipboardHandler] クリップボードへコピー開始...");
    // 1. 現在の選択範囲を取得
    const currentRange = getSelectionRangeBox();
    if (!currentRange || currentRange.isEmpty()) {
        console.warn("[ClipboardHandler] コピー対象の有効な選択範囲がありません。");
        clearClipboardData(); // 範囲が無効ならクリップボードもクリア
        // TODO: ユーザーフィードバック
        return;
    }

    // 2. 範囲内のブロックを取得
    const blocksToCopy = getBlocksInBox(currentRange, appState.loadedBlocks);
    if (blocksToCopy.length === 0) {
        console.log("[ClipboardHandler] 選択範囲内にコピー対象のブロックがありません。");
        clearClipboardData(); // 対象がなければクリップボードをクリア
        // TODO: ユーザーフィードバック
        return;
    }
    // 上限チェック
    if (blocksToCopy.length > MAX_COPY_COUNT) {
         console.warn(`[ClipboardHandler] 一度にコピーできるブロック数(${MAX_COPY_COUNT})を超えています。`);
         alert(`コピー制限: 一度にコピーできるのは ${MAX_COPY_COUNT} ブロックまでです。`);
         return;
    }

    // 3. コピー元の基準点 (選択範囲の中心、整数座標) を取得
    const originPoint = currentRange.getCenter(_v1).round();

    // 4. ブロックデータのディープコピー (ワールド座標と回転を保持)
    const copiedBlocksData = blocksToCopy.map(blockData => {
        return {
            definitionId: blockData.definitionId,
            colorIndices: [...blockData.colorIndices],
            position: blockData.position.clone(),     // ワールド位置
            rotationMatrix: blockData.rotationMatrix.clone(), // ワールド回転
            originalId: blockData.id                  // 元のID (任意)
        };
    });

    // 5. クリップボード状態を設定
    setClipboardData(copiedBlocksData, originPoint);
    console.log(`[ClipboardHandler] ${copiedBlocksData.length} 個のブロックをクリップボードにコピーしました。基準点:`, originPoint);
    // TODO: ユーザーフィードバック (コピー成功通知)
}

/**
 * 現在の選択範囲内のブロックデータをクリップボードにカットします (コピー後に元を削除)。
 * 削除操作は単一のアンドゥ単位として履歴に登録されます。
 * @param {object} appState - アプリケーションの状態オブジェクト (loadedBlocks, scene を含む)。
 */
export function cutSelectionToClipboard(appState) {
    console.log("[ClipboardHandler] クリップボードへカット開始...");
    // 1. 現在の選択範囲を取得
    const currentRange = getSelectionRangeBox();
    if (!currentRange || currentRange.isEmpty()) {
        console.warn("[ClipboardHandler] カット対象の有効な選択範囲がありません。");
        clearClipboardData();
        return;
    }

    // 2. 範囲内のブロックを取得
    const blocksToCut = getBlocksInBox(currentRange, appState.loadedBlocks);
    if (blocksToCut.length === 0) {
        console.log("[ClipboardHandler] 選択範囲内にカット対象のブロックがありません。");
        clearClipboardData();
        return;
    }
    // 上限チェック
     if (blocksToCut.length > MAX_COPY_COUNT) {
         console.warn(`[ClipboardHandler] 一度にカットできるブロック数(${MAX_COPY_COUNT})を超えています。`);
         alert(`カット制限: 一度にカットできるのは ${MAX_COPY_COUNT} ブロックまでです。`);
         return;
     }

    // 3. コピー元の基準点を取得
    const originPoint = currentRange.getCenter(_v1).round();

    // 4. クリップボード用データのディープコピー
    const copiedBlocksData = blocksToCut.map(blockData => ({
        definitionId: blockData.definitionId,
        colorIndices: [...blockData.colorIndices],
        position: blockData.position.clone(),
        rotationMatrix: blockData.rotationMatrix.clone(),
        originalId: blockData.id
    }));

    // --- 5. 元ブロックの削除処理 と アンドゥ用情報作成 ---
    console.log(`[ClipboardHandler] ${blocksToCut.length} 個のブロックを削除します...`);
    const deletedBlocksInfo = []; // アンドゥ用に削除情報を記録
    const blockIdsToDelete = new Set(blocksToCut.map(b => b.id));
    const remainingBlocks = []; // 削除対象外のブロックを保持

    // 元の loadedBlocks 配列を走査
    for (const block of appState.loadedBlocks) {
        if (blockIdsToDelete.has(block.id)) {
            // 削除対象の場合
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
                if (block.mesh.material?.dispose) { /* ... 共有判定して破棄 ... */ }
            }
            if (block.foregroundMesh && block.foregroundMesh.parent) {
                appState.scene.remove(block.foregroundMesh);
                if (block.foregroundMesh.material?.dispose) block.foregroundMesh.material.dispose();
            }
        } else {
            // 削除対象外の場合は保持
            remainingBlocks.push(block);
        }
    }

    // --- 6. loadedBlocks 更新 & 履歴登録 & クリップボード設定 ---
    if (deletedBlocksInfo.length > 0) {
        // a) 元の loadedBlocks 配列の内容を入れ替える
        appState.loadedBlocks.length = 0;
        appState.loadedBlocks.push(...remainingBlocks);

        // b) アンドゥ履歴にまとめて登録
        addAction({ type: 'CUT_BLOCKS', deletedBlocksData: deletedBlocksInfo });
        console.log(`[ClipboardHandler] ${deletedBlocksInfo.length} 個のブロックを削除し、アンドゥ履歴 'CUT_BLOCKS' を登録。`);

        // c) クリップボード状態を設定 (削除が成功してから)
        setClipboardData(copiedBlocksData, originPoint);
        console.log(`[ClipboardHandler] ${copiedBlocksData.length} 個のブロックをクリップボードに設定。`);

        // d) レンダリング更新を促す
        document.dispatchEvent(new CustomEvent('blocksChanged'));

    } else {
        console.warn("[ClipboardHandler] カット対象として識別されたブロックが削除されませんでした。");
        clearClipboardData(); // 失敗時はクリップボードもクリア
    }
}


/**
 * クリップボードの内容を現在の選択範囲の中心を基準に貼り付けます。
 * @param {object} appState - アプリケーションの状態オブジェクト (loadedBlocks, scene を含む)。
 */
export function pasteFromClipboard(appState) {
    console.log("[ClipboardHandler] クリップボードから貼り付け開始...");
    // 1. クリップボードデータを取得
    const clipboardContent = getClipboardData();
    if (!clipboardContent || !clipboardContent.blocks || clipboardContent.blocks.length === 0) {
        console.warn("[ClipboardHandler] クリップボードにデータがないため、貼り付けできません。");
        return;
    }

    // 2. 貼り付け先の基準点を取得 (現在の選択範囲の中心)
    const pasteRange = getSelectionRangeBox();
    if (!pasteRange || pasteRange.isEmpty()) {
        console.warn("[ClipboardHandler] 貼り付け先の有効な選択範囲がありません。");
        return;
    }
    const pasteCenter = pasteRange.getCenter(_v1).round(); // 貼り付け中心 (整数)
    const copyOrigin = clipboardContent.origin;           // コピー時の基準点

    // 3. 貼り付けるブロックのリストを作成 (アンドゥ用)
    const addedBlocks = []; // 実際に追加された BlockData を格納

    // 4. クリップボード内の各ブロックを配置
    console.log(`[ClipboardHandler] ${clipboardContent.blocks.length} 個のブロックを貼り付けます...`);
    clipboardContent.blocks.forEach(copiedBlockData => {
        // a) 貼り付け先のワールド座標を計算: pastePos = pasteCenter + (copiedPos - copyOrigin)
        _pastePosition.copy(copiedBlockData.position) // コピー時のワールド座標
                      .sub(copyOrigin)                // コピー基準点からの相対ベクトル
                      .add(pasteCenter)               // 貼り付け基準点に加算
                      .round();                       // 最終座標を整数に丸める

        // b) 貼り付け先の回転行列 (クリップボードのものをそのまま使用)
        const pasteRotation = copiedBlockData.rotationMatrix; // クローン済みのはず

        // c) 定義ID、色を取得
        const definitionId = copiedBlockData.definitionId;
        const colorIndicesString = copiedBlockData.colorIndices.join(','); // placeBlock は文字列を受け取る？ -> BlockData 内でパースするので配列で良い

        // d) 貼り付け先にブロックが既に存在しないかチェック
        const isOccupied = appState.loadedBlocks.some(block => block.position.equals(_pastePosition));

        if (!isOccupied) {
            // e) placeBlock を呼び出して配置
            // ★ placeBlock の第6引数 isHistoryAction = true を渡し、内部での履歴登録を抑制
            const placedBlock = placeBlock(
                _pastePosition,      // 貼り付け位置 (Vector3)
                pasteRotation,       // 貼り付け向き (Matrix4)
                definitionId,        // 定義ID (string)
                appState.loadedBlocks, // loadedBlocks 配列
                appState.scene,        // シーン
                true                 // ★ 履歴登録抑制フラグ
            );

            if (placedBlock) {
                // 色情報を復元 (placeBlock は色を考慮しないため)
                placedBlock.colorIndices = [...copiedBlockData.colorIndices];
                // TODO: 色情報をメッシュマテリアルに反映させる処理が必要
                // if (placedBlock.mesh && placedBlock.mesh.material && !Array.isArray(placedBlock.mesh.material)) {
                //     placedBlock.mesh.material.color.setHex(getColorFromIndices(placedBlock.colorIndices)); // 仮の関数
                // }

                addedBlocks.push(placedBlock); // アンドゥ用にリストに追加
            } else {
                 console.warn(`[ClipboardHandler] ブロック ${definitionId} の配置に失敗しました (座標: ${_pastePosition.x},${_pastePosition.y},${_pastePosition.z})。`);
            }
        } else {
            console.log(`[ClipboardHandler] 貼り付け先 (${_pastePosition.x},${_pastePosition.y},${_pastePosition.z}) は既にブロックが存在するためスキップします。`);
        }
    });

    // 5. アンドゥ履歴登録 (Step 5c で実装)
    if (addedBlocks.length > 0) {
        console.log(`[ClipboardHandler] ${addedBlocks.length} 個のブロックを貼り付けました。`);
        // addAction({ type: 'PASTE_BLOCKS', addedBlocks: addedBlocks.map(b => ({...})) }); // Step 5c
        document.dispatchEvent(new CustomEvent('blocksChanged')); // レンダリング更新を促す
    } else {
         console.log("[ClipboardHandler] 貼り付けられるブロックがありませんでした。");
    }
    // クリップボードの内容は維持
}