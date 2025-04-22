/**
 * @fileoverview 削除モードにおけるポインターイベント処理を担当します。
 */

import * as THREE from 'three';
import { getMouseNDCFromEvent } from './mouseInteractionHandler.js';
import { deleteBlock } from '../interactions/blockActions.js';
import { getIntersectedBlockData } from './interactionUtils.js'; // <<< ヒット判定関数
import { hidePreviewBlock } from '../rendering/previewBlock.js'; // プレビューを隠す

/**
 * PointerDownイベント処理 (削除モード)
 * @param {PointerEvent} event
 * @param {object} appState
 */
export function handlePointerDown(event, appState) {
    const clickedBlockData = getIntersectedBlockData(event, appState); // 通常メッシュとの交差判定
    if (clickedBlockData) {
        console.log(`[DeleteInteraction] ブロック削除 ID: ${clickedBlockData.id}`);
        deleteBlock(clickedBlockData, appState.loadedBlocks, appState.scene);
    } else {
        console.log("[DeleteInteraction] 削除対象のブロックが見つかりません。");
    }
}

/**
 * PointerMoveイベント処理 (削除モード)
 * @param {PointerEvent} event
 * @param {object} appState
 */
export function handlePointerMove(event, appState) {
    // 削除モードではプレビューは表示しない
    hidePreviewBlock();
}

/**
 * PointerUpイベント処理 (削除モード)
 * @param {PointerEvent} event
 * @param {object} appState
 */
export function handlePointerUp(event, appState) {
    // 削除モードでは PointerUp で特別な処理はなし
}

/**
 * PointerLeaveイベント処理 (削除モード)
 * @param {object} appState
 */
export function handlePointerLeave(appState) {
    // プレビューを隠す
    hidePreviewBlock();
}