/**
 * @fileoverview 通常 (配置) モードにおけるポインターイベント処理を担当します。
 */

import * as THREE from 'three';
import { getMouseNDCFromEvent } from './mouseInteractionHandler.js';
import { placeBlock } from '../interactions/blockActions.js';
import { getPlacementInfo } from '../interactions/placementHandler.js';
import { showPreviewBlock, hidePreviewBlock } from '../rendering/previewBlock.js';
import { getCurrentPlacementBlockId, getPreviewOrientation } from '../state/placementState.js';
import { clearSelection } from '../interactions/selectionState.js'; // 背景クリックで選択解除する場合

/**
 * PointerDownイベント処理 (通常モード)
 * @param {PointerEvent} event
 * @param {object} appState
 */
export function handlePointerDown(event, appState) {
    const placementInfo = getPlacementInfo(event, appState.camera, appState.loadedBlocks, appState.renderer.domElement);
    if (placementInfo) {
        // 配置処理を実行
        console.log("[NormalInteraction] ブロックを配置します。");
        const blockIdToPlace = getCurrentPlacementBlockId();
        const orientationMatrix = getPreviewOrientation();
        placeBlock(placementInfo.position, orientationMatrix, blockIdToPlace, appState.loadedBlocks, appState.scene);
        updatePreview(event, appState); // プレビュー更新
    } else {
        // 配置できない場所をクリックした場合
        console.log("[NormalInteraction] ここには配置できません。");
        // clearSelection(); // 通常モードでは選択操作がないので不要
    }
}

/**
 * PointerMoveイベント処理 (通常モード)
 * @param {PointerEvent} event
 * @param {object} appState
 */
export function handlePointerMove(event, appState) {
    // プレビュー表示の更新
    updatePreview(event, appState);
}

/**
 * PointerUpイベント処理 (通常モード)
 * @param {PointerEvent} event
 * @param {object} appState
 */
export function handlePointerUp(event, appState) {
    // 通常モードでは PointerUp で特別な処理はなし
}

/**
 * PointerLeaveイベント処理 (通常モード)
 * @param {object} appState
 */
export function handlePointerLeave(appState) {
    // プレビューを隠す
    hidePreviewBlock();
}

/**
 * プレビューブロックの位置と向きを更新するヘルパー関数
 * (mouseInteractionHandler.js から移動)
 * @param {PointerEvent} event
 * @param {object} appState
 * @private
 */
function updatePreview(event, appState){
    const { camera, loadedBlocks, renderer, scene } = appState;
    const placementInfo = getPlacementInfo(event, camera, loadedBlocks, renderer.domElement);
    if (placementInfo) {
        const orientationMatrix = getPreviewOrientation();
        showPreviewBlock(scene, placementInfo.position, orientationMatrix);
    } else {
        hidePreviewBlock();
    }
}