// src/controllers/InputHandler.js
import * as THREE from 'three';
import { getPreviewPosition, getPreviewOrientationMatrix, updatePreviewBlock, rotatePreview, flipPreview, setPreviewVisible } from './PreviewController.js';
import { addBlock, removeBlock, getAllMeshes } from '../models/BlockDataManager.js'; // DataManager利用
import { setDeleteMode, isDeleteModeActive, setXmlEditMode, isXmlEditModeActive, setSelectedBlockId, getSelectedBlockId } from '../app/AppState.js';
import { selectBlockByRaycast } from './SelectionController.js';
import { handleRotationInput as handleBlockRotation } from './BlockTransformController.js'; // 配置済みブロック回転
import { raycastFromMouse } from '../services/RaycastService.js'; // Raycastサービス利用
import { X_AXIS, Y_AXIS, Z_AXIS, ROTATION_ANGLE } from '../app/Constants.js';

let isMouseOverCanvas = false;
export const mouse = new THREE.Vector2(); // Raycasting用マウス座標

/**
 * InputHandlerを初期化し、イベントリスナーを設定します。
 * @param {HTMLCanvasElement} domElement - イベントを設定するCanvas要素
 */
export function initInputHandler(domElement) {
    domElement.addEventListener('mousemove', onMouseMove);
    domElement.addEventListener('pointerdown', onPointerDown);
    domElement.addEventListener('mouseenter', () => { isMouseOverCanvas = true; });
    domElement.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('keydown', onKeyDown);
    console.log("InputHandler initialized.");
}

function onMouseMove(event) {
    isMouseOverCanvas = true; // マウスが乗ったらフラグON
    // Raycasting用のマウス座標を更新
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    // プレビュー位置更新は animate ループに任せる
}

function onPointerDown(event) {
    if (event.button !== 0) return; // 左クリックのみ

    if (isDeleteModeActive()) {
        handleDeleteClick();
    } else if (isXmlEditModeActive()) {
        selectBlockByRaycast(mouse); // XML編集モード中はクリックで選択/解除
    } else {
        handleNormalModeClick();
    }
}

function handleNormalModeClick() {
    const previewPosition = getPreviewPosition();
    const previewOrientation = getPreviewOrientationMatrix();

    if (previewPosition && previewOrientation) {
        // プレビューが表示されていれば配置
        addBlock({ position: previewPosition, orientation: previewOrientation });
        // 配置後のプレビュー更新は animate ループが行う
    } else {
        // プレビュー非表示なら、クリック位置でブロック選択/解除試行
        selectBlockByRaycast(mouse);
    }
}

function handleDeleteClick() {
    const meshes = getAllMeshes();
    if (meshes.length === 0) return;
    const intersects = raycastFromMouse(mouse, meshes);
    if (intersects.length > 0 && intersects[0].object.userData.blockId) {
        removeBlock(intersects[0].object.userData.blockId); // DataManagerに削除依頼
        // 削除後のプレビュー更新は animate ループが行う
    }
}

function onKeyDown(event) {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';
    if (isInputFocused) return;

    let needsPreviewUpdate = false;

    // モード切り替え
    if (event.ctrlKey && event.code === 'KeyE') {
        event.preventDefault();
        setXmlEditMode(!isXmlEditModeActive());
        setPreviewVisible(false); // モード切替時はプレビュー非表示
    } else if (event.code === 'KeyX') {
        setDeleteMode(!isDeleteModeActive());
        setPreviewVisible(false); // モード切替時はプレビュー非表示
    } else {
        // モードに応じた操作
        if (isXmlEditModeActive()) {
            // XML編集モード中の配置済みブロック回転 (BlockTransformController呼出し)
            handleBlockRotation(event.code);
        } else if (!isDeleteModeActive()) {
            // 通常モード中のプレビュー回転・反転
            needsPreviewUpdate = handlePreviewRotationKeyPress(event.code) || handlePreviewFlipKeyPress(event.code);
        }
    }

    // プレビュー更新が必要な場合（通常モードでのプレビュー操作時）
    if (needsPreviewUpdate) {
         updatePreviewBlock(mouse); // マウス座標を渡して即時更新
    }
}

// --- PreviewController への操作依頼 ---
function handlePreviewRotationKeyPress(keyCode) {
    let rotated = false;
    switch (keyCode) {
        case 'KeyJ': rotatePreview(X_AXIS, -ROTATION_ANGLE); rotated = true; break;
        case 'KeyK': rotatePreview(Y_AXIS, ROTATION_ANGLE); rotated = true; break;
        case 'KeyL': rotatePreview(Z_AXIS, ROTATION_ANGLE); rotated = true; break;
    }
    return rotated;
}
function handlePreviewFlipKeyPress(keyCode) {
     let flipped = false;
     switch (keyCode) {
        case 'KeyU': flipPreview('x'); flipped = true; break;
        case 'KeyI': flipPreview('y'); flipped = true; break;
        case 'KeyO': flipPreview('z'); flipped = true; break;
    }
    return flipped;
}
// --- ここまで ---

function onMouseLeave() {
    isMouseOverCanvas = false;
    setPreviewVisible(false); // マウスが離れたらプレビュー非表示
}

export function getIsMouseOverCanvas() {
    return isMouseOverCanvas;
}