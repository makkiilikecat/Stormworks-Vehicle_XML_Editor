/**
 * @fileoverview XML編集モードにおけるポインターイベント処理を担当します。
 * ブロック変形ドラッグの開始/終了、クリックによる選択などを処理します。
 */

import * as THREE from 'three';
import { getMouseNDCFromEvent } from './mouseInteractionHandler.js';
import { handleSelectionClick as handleXmlEditSelectionClick } from '../interactions/selectionHandler.js';
import { handleDragTransformPointerDown, handleDragTransformPointerMove, handleDragTransformPointerUp } from '../interactions/dragTransformHandler.js';

// --- モジュール内状態 ---
// mouseInteractionHandler.js から isDraggingBlockTransform を移動すべきか、
// または dragTransformHandler が自身の状態を持つべきか検討が必要。
// 一旦、dragTransformHandler が状態を持つと仮定する。
// let isDraggingBlockTransform = false; // このファイルで状態を管理しない方が良い

/**
 * PointerDownイベント処理 (XML編集モード)
 * @param {PointerEvent} event
 * @param {object} appState
 */
export function handlePointerDown(event, appState) {
    // ドラッグ変形を開始できるか試みる
    const dragStarted = handleDragTransformPointerDown(
        event, appState.camera, appState.scene, appState.renderer.domElement,
        () => appState.controls.enabled = false
    );
    if (dragStarted) {
        // isDraggingBlockTransform = true; // 状態は dragTransformHandler 内で管理される想定
        console.log("[XmlEditInteraction] ドラッグ変形を開始しました。");
        return; // ドラッグ開始したら選択処理はしない
    }

    // ドラッグが開始されなかった場合、クリック選択処理を実行
    console.log("[XmlEditInteraction] クリック選択処理を実行します。");
    handleXmlEditSelectionClick(
        event, event.ctrlKey || event.metaKey,
        appState.camera, appState.scene, appState.renderer.domElement, appState.loadedBlocks
    );
}

/**
 * PointerMoveイベント処理 (XML編集モード)
 * @param {PointerEvent} event
 * @param {object} appState
 */
export function handlePointerMove(event, appState) {
    // ドラッグ変形中の処理 (状態は dragTransformHandler 内でチェックされる)
    handleDragTransformPointerMove(event, appState.camera, appState.renderer.domElement, appState.scene);
}

/**
 * PointerUpイベント処理 (XML編集モード)
 * @param {PointerEvent} event
 * @param {object} appState
 */
export function handlePointerUp(event, appState) {
    // ドラッグ変形終了処理 (状態は dragTransformHandler 内でチェックされる)
    handleDragTransformPointerUp(event, () => appState.controls.enabled = true);
    // isDraggingBlockTransform = false; // 状態は dragTransformHandler 内で管理される想定
}

/**
 * PointerLeaveイベント処理 (XML編集モード)
 * @param {object} appState
 */
export function handlePointerLeave(appState) {
    // ドラッグ変形終了処理 (状態は dragTransformHandler 内でチェックされる)
    handleDragTransformPointerUp(null, () => appState.controls.enabled = true); // null イベントで確定
    // isDraggingBlockTransform = false; // 状態は dragTransformHandler 内で管理される想定
}