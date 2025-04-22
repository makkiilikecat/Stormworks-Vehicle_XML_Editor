/**
 * @fileoverview Canvas上でのマウス操作イベントを捕捉し、現在の編集モードに応じて
 * 対応するインタラクションハンドラモジュールに処理を委譲するディスパッチャ。
 */

import * as THREE from 'three'; // 基本的な型定義のためにインポートする場合がある
import { getCurrentMode, EditMode } from '../state/editMode.js';
// 各モードに対応するインタラクションハンドラをインポート
import * as rangeInteraction from './rangeInteractionHandler.js';
import * as xmlEditInteraction from './xmlEditInteractionHandler.js';
import * as normalInteraction from './normalInteractionHandler.js';
import * as deleteInteraction from './deleteInteractionHandler.js';
// import * as paintInteraction from './paintInteractionHandler.js'; // 将来のペイントモード用

// --- ヘルパー関数 ---

/**
 * マウスイベントからマウスの正規化デバイス座標 (-1 to +1) を計算します。
 * @param {PointerEvent} event - マウスイベント。
 * @param {HTMLElement} domElement - レンダラーのDOM要素 (通常はCanvas)。
 * @returns {THREE.Vector2} 正規化デバイス座標。
 */
export function getMouseNDCFromEvent(event, domElement) { // エクスポートして他のハンドラから使えるようにする
    const rect = domElement.getBoundingClientRect();
    // pageX/YではなくclientX/Yを使う (スクロールの影響を受けない)
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    // NDC座標系に変換
    const ndcX = (x / rect.width) * 2 - 1;
    const ndcY = -(y / rect.height) * 2 + 1;
    return new THREE.Vector2(ndcX, ndcY);
}


// --- 公開イベントハンドラ関数 (イベントリスナーから呼ばれる) ---

/**
 * Canvas上でポインターが押されたときの処理。モードに応じて処理を委譲。
 * @param {PointerEvent} event - PointerEventオブジェクト。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handleCanvasPointerDown(event, appState) {
    if (event.button !== 0 || !appState.controls.enabled) return; // 左ボタン、コントロール有効時のみ
    const currentMode = getCurrentMode();

    switch (currentMode) {
        case EditMode.RANGE_SELECT:
            rangeInteraction.handlePointerDown(event, appState);
            break;
        case EditMode.XML_EDIT:
            xmlEditInteraction.handlePointerDown(event, appState);
            break;
        case EditMode.NORMAL:
            normalInteraction.handlePointerDown(event, appState);
            break;
        case EditMode.DELETE:
            deleteInteraction.handlePointerDown(event, appState);
            break;
        case EditMode.PAINT:
            // paintInteraction.handlePointerDown(event, appState);
            console.log("[MouseInteraction] ペイントモードの PointerDown は未実装です。");
            break;
        default:
            console.warn(`[MouseInteraction] 未知のモード (${currentMode}) で PointerDown が発生しました。`);
    }
}

/**
 * Canvas上でポインター（マウス）が移動したときの処理。モードに応じて処理を委譲。
 * @param {PointerEvent} event - PointerEventオブジェクト。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handleCanvasPointerMove(event, appState) {
    // マウス移動は頻繁に発生するため、委譲先のハンドラで controls.enabled をチェックする
    const currentMode = getCurrentMode();

    switch (currentMode) {
        case EditMode.RANGE_SELECT:
            rangeInteraction.handlePointerMove(event, appState);
            break;
        case EditMode.XML_EDIT:
            xmlEditInteraction.handlePointerMove(event, appState);
            break;
        case EditMode.NORMAL:
            normalInteraction.handlePointerMove(event, appState);
            break;
        case EditMode.DELETE:
            deleteInteraction.handlePointerMove(event, appState);
            break;
        case EditMode.PAINT:
            // paintInteraction.handlePointerMove(event, appState);
            break;
        default:
            // 未知のモードでは何もしない
            break;
    }
}

/**
 * Canvas上でポインター（通常はマウス左ボタン）が離されたときの処理。モードに応じて処理を委譲。
 * @param {PointerEvent} event - PointerEventオブジェクト。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handleCanvasPointerUp(event, appState) {
    if (event.button !== 0) return; // 左ボタンのみ
    const currentMode = getCurrentMode();

    switch (currentMode) {
        case EditMode.RANGE_SELECT:
            rangeInteraction.handlePointerUp(event, appState);
            break;
        case EditMode.XML_EDIT:
            xmlEditInteraction.handlePointerUp(event, appState);
            break;
        case EditMode.NORMAL:
            normalInteraction.handlePointerUp(event, appState);
            break;
        case EditMode.DELETE:
            deleteInteraction.handlePointerUp(event, appState);
            break;
        case EditMode.PAINT:
            // paintInteraction.handlePointerUp(event, appState);
            break;
        default:
            // 未知のモードでは何もしない
            break;
    }
}

/**
 * Canvasからポインターが離れたときの処理。モードに応じて処理を委譲。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handleCanvasPointerLeave(appState) {
    // PointerLeave はどのモードでも発生しうる
    const currentMode = getCurrentMode();

    switch (currentMode) {
        case EditMode.RANGE_SELECT:
            rangeInteraction.handlePointerLeave(appState);
            break;
        case EditMode.XML_EDIT:
            xmlEditInteraction.handlePointerLeave(appState);
            break;
        case EditMode.NORMAL:
            normalInteraction.handlePointerLeave(appState);
            break;
        case EditMode.DELETE:
            deleteInteraction.handlePointerLeave(appState);
            break;
        case EditMode.PAINT:
            // paintInteraction.handlePointerLeave(appState);
            break;
        default:
            // 未知のモードでは何もしない
            break;
    }
}