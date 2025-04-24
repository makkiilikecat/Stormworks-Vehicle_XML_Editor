/**
 * @fileoverview XML編集モード (`EditMode.XML_EDIT`) における
 * ポインターイベント処理を担当します。
 * このモードでは、主にブロックのクリックによる選択 (`handleSelectionClick`) と、
 * ブロックの面ドラッグによる変形 (`handleDragTransform...`) が行われます。
 */

import * as THREE from 'three'; // 基本的な型定義のためにインポート
import { getMouseNDCFromEvent } from './mouseInteractionHandler.js'; // マウス座標取得ヘルパー
// XML編集モード専用のクリック選択ハンドラ
import { handleSelectionClick as handleXmlEditSelectionClick } from '../interactions/selectionHandler.js';
// ドラッグ変形ハンドラ (開始、移動、終了)
import { handleDragTransformPointerDown, handleDragTransformPointerMove, handleDragTransformPointerUp } from '../interactions/dragTransformHandler.js';
// ドラッグ変形状態 (参照はしないが、dragTransformHandlerが内部で使用)
// import { blockDragState } from '../interactions/dragState.js'; // dragTransformHandler が内部で使うのでここでは不要

/**
 * PointerDownイベント処理 (XML編集モード)。
 * まずドラッグ変形を開始できるか試み、できなければクリック選択処理を実行します。
 * @param {PointerEvent} event - ポインターイベントオブジェクト。
 * @param {object} appState - アプリケーションの状態オブジェクト (camera, scene, renderer, controls, loadedBlocks を含む)。
 */
export function handlePointerDown(event, appState) {
    console.log("[XmlEditInteraction] PointerDown");
    // 1. ドラッグ変形を開始できるか試みる
    // handleDragTransformPointerDown は内部で単一選択チェックなどを行う
    const dragStarted = handleDragTransformPointerDown(
        event,
        appState.camera,
        appState.scene,
        appState.renderer.domElement,
        () => { if (appState.controls) appState.controls.enabled = false; } // カメラ操作無効化コールバック
    );

    // 2. ドラッグが開始された場合は、ここで処理終了
    if (dragStarted) {
        console.log("[XmlEditInteraction] ドラッグ変形を開始しました。");
        // isDraggingBlockTransform 状態は dragTransformHandler 内で管理される
        return;
    }

    // 3. ドラッグが開始されなかった場合、通常のクリックとしてブロック選択処理を実行
    console.log("[XmlEditInteraction] ドラッグ変形は開始されず。クリック選択処理を実行します。");
    handleXmlEditSelectionClick( // XML編集モード用の選択処理
        event,
        event.ctrlKey || event.metaKey, // Ctrl/Cmdキーの状態
        appState.camera,
        appState.scene,
        appState.renderer.domElement,
        appState.loadedBlocks
    );
}

/**
 * PointerMoveイベント処理 (XML編集モード)。
 * ドラッグ変形中の処理を行います。
 * @param {PointerEvent} event - ポインターイベントオブジェクト。
 * @param {object} appState - アプリケーションの状態オブジェクト (camera, scene, renderer を含む)。
 */
export function handlePointerMove(event, appState) {
    // ドラッグ変形中の処理を呼び出す (ドラッグ中でなければ内部で何もしない)
    handleDragTransformPointerMove(
        event,
        appState.camera,
        appState.renderer.domElement,
        appState.scene
    );
}

/**
 * PointerUpイベント処理 (XML編集モード)。
 * ドラッグ変形操作を終了・確定させます。
 * ★ 修正: handleDragTransformPointerUp に appState を渡す。
 * @param {PointerEvent} event - ポインターイベントオブジェクト。
 * @param {object} appState - アプリケーションの状態オブジェクト (controls, loadedBlocks を含む)。
 */
export function handlePointerUp(event, appState) {
    // ドラッグ変形終了処理を呼び出す (ドラッグ中でなければ内部で何もしない)
    handleDragTransformPointerUp(
        event,
        () => { if (appState.controls) appState.controls.enabled = true; }, // カメラ操作有効化コールバック
        appState // <<< ★ 追加: loadedBlocks を参照するために appState を渡す
    );
}

/**
 * PointerLeaveイベント処理 (XML編集モード)。
 * ドラッグ変形操作を終了・確定させます（キャンセル扱いではなく確定）。
 * ★ 修正: handleDragTransformPointerUp に appState を渡す。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handlePointerLeave(appState) {
    // ドラッグ変形終了処理を呼び出す (ドラッグ中でなければ内部で何もしない)
    handleDragTransformPointerUp(
        null, // イベントオブジェクトは null とする (PointerUp と区別する場合)
        () => { if (appState.controls) appState.controls.enabled = true; },
        appState // <<< ★ 追加
    );
}