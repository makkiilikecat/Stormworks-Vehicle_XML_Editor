// src/controllers/InputHandler.js
import * as THREE from 'three';
import { updateMousePosition, getPreviewPosition, setPreviewVisible, rotatePreview, flipPreview, getPreviewOrientationMatrix, updatePreviewBlock } from './PreviewController.js';
import { placeBlock } from './PlacementController.js';
import { setDeleteMode, isDeleteModeActive, setXmlEditMode, isXmlEditModeActive, getSelectedBlockId } from '../app/AppState.js'; // AppState は親
import { deleteBlock } from './DeletionController.js';
import { selectBlockByRaycast } from './SelectionController.js';
import { handleRotationInput } from './BlockTransformController.js';
import { X_AXIS, Y_AXIS, Z_AXIS, ROTATION_ANGLE } from '../app/Constants.js';

let camera, scene;
let placedBlocksData = [];
let isMouseOverCanvas = false;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

export function initInputHandler(domElement, cam, scn, blocksData) {
    camera = cam; // SelectionController に渡すため保持
    scene = scn;
    placedBlocksData = blocksData; // 各コントローラーに渡すため保持

    domElement.addEventListener('mousemove', onMouseMove);
    domElement.addEventListener('pointerdown', onPointerDown);
    domElement.addEventListener('mouseenter', () => { isMouseOverCanvas = true; });
    domElement.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('keydown', onKeyDown);
}

function onMouseMove(event) {
    const clientX = event.clientX;
    const clientY = event.clientY;
    // プレビューコントローラーにマウス位置を通知
    updateMousePosition(clientX, clientY);
    // Raycasting用のマウス座標も更新
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
}

function onPointerDown(event) {
    if (event.button !== 0) return; // 左クリックのみ

    if (isDeleteModeActive()) {
        // 削除コントローラーに処理を依頼 (Raycast含む) -> DeletionControllerでRaycastする方が良いかも
        handleDeleteClick(); // handleDeleteClick内でRaycastしてdeleteBlock呼出し
    } else if (isXmlEditModeActive()) {
        // XML編集モード中はクリックで選択のみ？ -> 今は特に何もしない or 選択
        selectBlockByRaycast(mouse); // クリック位置でブロック選択試行
    } else {
        // 通常モード: プレビュー位置への配置 or 既存ブロックの選択
        handleNormalModeClick();
    }
}

function handleNormalModeClick() {
    const previewPosition = getPreviewPosition();
    const previewOrientation = getPreviewOrientationMatrix();

    if (previewPosition && previewOrientation) {
        // プレビューが表示されていれば配置
        placeBlock(previewPosition, previewOrientation);
        updatePreviewBlock(placedBlocksData); // 配置後にプレビュー更新
    } else {
        // プレビューが表示されていなければ、クリック位置でブロック選択試行
        selectBlockByRaycast(mouse);
    }
}

function handleDeleteClick() {
    if (!camera || !placedBlocksData) return;
    raycaster.setFromCamera(mouse, camera);
    const targetMeshes = placedBlocksData.map(data => data.mesh).filter(mesh => !!mesh);
    if (targetMeshes.length === 0) return;
    const intersects = raycaster.intersectObjects(targetMeshes, false);
    if (intersects.length > 0) {
        const intersectedMesh = intersects[0].object;
        if (intersectedMesh && intersectedMesh.isMesh) {
            deleteBlock(intersectedMesh);
            updatePreviewBlock(placedBlocksData);
        }
    }
}

function onKeyDown(event) {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';
    if (isInputFocused) return;

    let needsPreviewUpdate = false;

    // モード切り替え (Ctrl+E, X)
    if (event.ctrlKey && event.code === 'KeyE') {
        event.preventDefault(); // ブラウザのデフォルト動作抑制
        setXmlEditMode(!isXmlEditModeActive());
        needsPreviewUpdate = true;
    } else if (event.code === 'KeyX') {
        setDeleteMode(!isDeleteModeActive());
        needsPreviewUpdate = true;
    } else {
        // モードに応じたキー操作
        if (isXmlEditModeActive()) {
            // XML編集モード中のJKL回転
            handleRotationInput(event.code); // BlockTransformController を呼び出す
            // XML編集モード中はプレビュー不要なので needsPreviewUpdate = false
        } else if (!isDeleteModeActive()) {
            // 通常モード中のJKLUIO (プレビュー操作) -> PreviewControllerで処理
            // needsPreviewUpdate = handlePreviewTransformKeys(event.code); // PreviewControllerに処理を依頼する形式に変更するのが望ましい
            // → 従来通りInputHandler内でPreviewControllerの関数を呼ぶ
            needsPreviewUpdate = handlePreviewRotationKeyPress(event.code) || handlePreviewFlipKeyPress(event.code);
        }
    }

    // プレビュー更新が必要な場合に呼び出す
    if (needsPreviewUpdate && !isDeleteModeActive() && !isXmlEditModeActive()) {
        updatePreviewBlock(placedBlocksData);
    } else if (!isXmlEditModeActive() && !isDeleteModeActive()) {
        // 通常モードでプレビュー操作した場合も更新が必要
        // updatePreviewBlock(placedBlocksData); // これは不要。回転/反転関数後に呼ばれるため
    }
}

// --- PreviewController 操作部分 ---
/** プレビュー回転処理。回転が行われた場合にtrueを返す */
function handlePreviewRotationKeyPress(keyCode) {
    let rotated = false;
    switch (keyCode) {
        case 'KeyJ': rotatePreview(X_AXIS, -ROTATION_ANGLE); rotated = true; break;
        case 'KeyK': rotatePreview(Y_AXIS, ROTATION_ANGLE); rotated = true; break;
        case 'KeyL': rotatePreview(Z_AXIS, ROTATION_ANGLE); rotated = true; break;
    }
    return rotated;
}
/** プレビュー反転処理。反転が行われた場合にtrueを返す */
function handlePreviewFlipKeyPress(keyCode) {
     let flipped = false;
     switch (keyCode) {
        case 'KeyU': flipPreview('x'); flipped = true; break;
        case 'KeyI': flipPreview('y'); flipped = true; break;
        case 'KeyO': flipPreview('z'); flipped = true; break;
    }
    return flipped;
}

function onMouseLeave() {
    isMouseOverCanvas = false;
    setPreviewVisible(false);
}

export function getIsMouseOverCanvas() {
    return isMouseOverCanvas;
}