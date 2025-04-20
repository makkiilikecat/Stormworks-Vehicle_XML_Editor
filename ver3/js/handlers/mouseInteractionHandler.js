/**
 * @fileoverview Canvas上でのマウス操作イベントを処理し、モードに応じて適切なアクションを実行。
 */

import * as THREE from 'three';
import { getCurrentMode, EditMode, allowsBlockPlacement } from '../state/editMode.js';
import { handleSelectionClick, clearSelection } from '../interactions/selectionHandler.js';
import { deleteBlock, placeBlock } from '../interactions/blockActions.js';
import { getPlacementInfo } from '../interactions/placementHandler.js';
import { showPreviewBlock, hidePreviewBlock } from '../rendering/previewBlock.js';
import { getCurrentPlacementBlockId, getPreviewOrientation } from '../state/placementState.js';
import { handleDragTransformPointerDown, handleDragTransformPointerMove, handleDragTransformPointerUp } from '../interactions/dragTransformHandler.js';
import { hideGhostBlock } from '../rendering/ghostBlock.js'; // ドラッグキャンセル用

// ドラッグ変形中かどうかのフラグ (このハンドラ内で管理)
let isDraggingTransform = false;

/**
 * マウスイベントからマウスの正規化デバイス座標を計算します。
 * @param {MouseEvent} event - マウスイベント。
 * @param {HTMLElement} domElement - レンダラーのDOM要素。
 * @returns {THREE.Vector2} 正規化デバイス座標。
 * @private
 */
function getMouseNDCFromEvent(event, domElement) {
    const rect = domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return mouse;
}


/**
 * Canvas上でポインター（マウス左ボタン）が押されたときの処理。
 * @param {PointerEvent} event
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handleCanvasPointerDown(event, appState) {
    const { camera, scene, renderer, controls, loadedBlocks } = appState;
    if (event.button !== 0 || !controls.enabled) return; // 左ボタン以外 or カメラ操作中は無視

    const currentMode = getCurrentMode();

    // --- ドラッグ変形開始判定 (XML編集モード) ---
    if (currentMode === EditMode.XML_EDIT) {
        const dragStarted = handleDragTransformPointerDown(
            event, camera, scene, renderer.domElement,
            () => controls.enabled = false // disableControls コールバック
        );
        if (dragStarted) {
            isDraggingTransform = true;
            return; // ドラッグ開始したら他の処理はしない
        }
        // ドラッグ開始しなかった場合は、下の選択処理へ
    }

    // --- 通常のクリック処理 (削除、配置、選択) ---
    if (currentMode === EditMode.DELETE) {
        // 削除
        const placementInfo = getPlacementInfo(event, camera, loadedBlocks, renderer.domElement);
        if (placementInfo?.targetBlock) {
            deleteBlock(placementInfo.targetBlock, loadedBlocks, scene);
        }
    } else if (allowsBlockPlacement(currentMode)) { // 通常モード
        // 配置
        const placementInfo = getPlacementInfo(event, camera, loadedBlocks, renderer.domElement);
        if (placementInfo) {
            const blockIdToPlace = getCurrentPlacementBlockId();
            const orientationMatrix = getPreviewOrientation();
            const placedBlock = placeBlock(placementInfo.position, orientationMatrix, blockIdToPlace, loadedBlocks, scene);
            if (placedBlock) {
                updatePreview(event, appState); // 配置後もプレビュー更新
            }
        } else {
            clearSelection(); // 配置できない場所をクリックしたら選択解除
        }
    } else {
        // 選択 (XML編集モードでドラッグ開始しなかった場合など)
        handleSelectionClick(
            event, event.ctrlKey || event.metaKey,
            camera, scene, renderer.domElement, loadedBlocks
        );
    }
}

/**
 * Canvas上でポインター（マウス）が移動したときの処理。
 * @param {PointerEvent} event
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handleCanvasPointerMove(event, appState) {
    const { camera, renderer, scene, loadedBlocks } = appState;

    // --- ドラッグ変形中の処理 ---
    if (isDraggingTransform) {
        handleDragTransformPointerMove(event, camera, renderer.domElement, scene);
        return;
    }

    // --- 通常モードのプレビュー更新 ---
    if (getCurrentMode() === EditMode.NORMAL) {
        updatePreview(event, appState);
    } else {
        hidePreviewBlock(); // 他のモードではプレビュー非表示
    }
}

/**
 * Canvas上でポインター（マウス左ボタン）が離されたときの処理。
 * @param {PointerEvent} event
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handleCanvasPointerUp(event, appState) {
    const { controls } = appState;
    if (event.button !== 0) return;

    // --- ドラッグ変形終了処理 ---
    if (isDraggingTransform) {
        handleDragTransformPointerUp(event, () => controls.enabled = true); // enableControls コールバック
        isDraggingTransform = false;
    }

    // --- 他のPointerUp処理（例：UI更新トリガー） ---
    // updateXmlEditUIIfNeeded(); // これはカスタムイベントで行う方が良い
}

/**
 * Canvasからポインターが離れたときの処理。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handleCanvasPointerLeave(appState) {
     const { controls } = appState;
    // ドラッグ中に離れた場合は強制終了
    if (isDraggingTransform) {
        console.log("Pointer left canvas during drag, canceling transform.");
        handleDragTransformPointerUp(null, () => controls.enabled = true);
        isDraggingTransform = false;
        hideGhostBlock(); // ゴーストも隠す
    }
    // 通常モードのプレビューも隠す
    hidePreviewBlock();
}


/**
 * 通常モード時にプレビューブロックの位置と向きを更新します。
 * @param {MouseEvent} event - マウスイベント。
 * @param {object} appState - アプリケーションの状態オブジェクト。
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