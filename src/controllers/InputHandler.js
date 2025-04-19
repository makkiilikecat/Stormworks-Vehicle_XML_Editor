// src/controllers/InputHandler.js
import * as THREE from 'three';
import { getPreviewPosition, getPreviewOrientationMatrix, updatePreviewBlock, rotatePreview, flipPreview, setPreviewVisible } from './PreviewController.js';
import { addBlock, removeBlock, getAllMeshes } from '../models/BlockDataManager.js'; // DataManager利用
import { setDeleteMode, isDeleteModeActive, setXmlEditMode, isXmlEditModeActive, setSelectedBlockId, getSelectedBlockId } from '../app/AppState.js';
import { raycastFromMouse } from '../services/RaycastService.js'; // Raycastサービス利用
import { X_AXIS, Y_AXIS, Z_AXIS, ROTATION_ANGLE } from '../app/Constants.js';
import { selectBlockByRaycast, highlightHoveredFace, clearFaceHighlight } from './SelectionController.js'; // 面ハイライト関連追加
import { handleRotationInput as handleBlockRotation, stretchBlock, shearBlock } from './BlockTransformController.js'; // stretch/shear追加

let isMouseOverCanvas = false;
const mouse = new THREE.Vector2(); // Raycasting用マウス座標

const dragState = {
    isDragging: false,
    startCoords: new THREE.Vector2(),
    targetBlockId: null,
    targetFaceNormal: new THREE.Vector3(),
    targetPoint: new THREE.Vector3(), // ドラッグ開始点のワールド座標
    isCtrlPressed: false,
};

/**
 * InputHandlerを初期化し、イベントリスナーを設定します。
 * @param {HTMLCanvasElement} domElement - イベントを設定するCanvas要素
 */
export function initInputHandler(domElement) {
    domElement.addEventListener('mousemove', onMouseMove);
    domElement.addEventListener('pointerdown', onPointerDown);
     // ★追加: ドラッグ中の移動と終了を捕捉
    domElement.addEventListener('pointermove', onPointerMove);
    domElement.addEventListener('pointerup', onPointerUp);
    domElement.addEventListener('mouseleave', onMouseLeave); // ドラッグ中に外れた場合も考慮
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp); // ★追加: Ctrlキー離したのを検知
    console.log("InputHandler initialized.");
    console.log("InputHandler initialized.");
}

function onMouseMove(event) {
    isMouseOverCanvas = true;
    const clientX = event.clientX;
    const clientY = event.clientY;
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    // ★ XML編集モードでなければ面ハイライトは行わない
    if (isXmlEditModeActive() && getSelectedBlockId() && !dragState.isDragging) {
        highlightHoveredFace(mouse); // カーソル下の面をハイライト
    } else {
        clearFaceHighlight(); // ドラッグ中やモード外は消す
    }
}

function onPointerDown(event) {
    if (event.button !== 0) return; // 左クリックのみ
    dragState.startCoords.copy(mouse); // ドラッグ開始座標記録
    dragState.isCtrlPressed = event.ctrlKey; // Ctrlキー状態記録

    if (isDeleteModeActive()) {
        handleDeleteClick();
    } else if (isXmlEditModeActive()) {
        // XML編集モード: 面ドラッグ開始 or 選択/解除
        const intersectInfo = highlightHoveredFace(mouse); // ハイライトしつつ情報を取得
        if (intersectInfo && intersectInfo.object.userData.blockId === getSelectedBlockId()) {
            // 選択中のブロックのハイライトされた面をクリックした場合 -> ドラッグ開始
            dragState.isDragging = true;
            dragState.targetBlockId = getSelectedBlockId();
            dragState.targetFaceNormal.copy(intersectInfo.faceNormal);
            dragState.targetPoint.copy(intersectInfo.point);
            // カーソル変更などドラッグ中の見た目変更
            document.body.style.cursor = 'grabbing';
            clearFaceHighlight(); // ドラッグ開始したら面ハイライトは消す
        } else {
            // 面以外をクリック or 別のブロックをクリック -> 選択/解除
            selectBlockByRaycast(mouse);
        }
    } else {
        handleNormalModeClick(); // 通常モード処理
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

// ★追加: ドラッグ中の処理
function onPointerMove(event) {
    if (!dragState.isDragging || !dragState.targetBlockId) return;

    const currentMouse = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );
    // TODO: マウス移動量から適切な dragAmount や dragVector を計算
    // この計算は複雑になるため、別途関数化推奨
    const dragDelta = currentMouse.clone().sub(dragState.startCoords);

    if (dragState.isCtrlPressed) { // Ctrl+ドラッグ = Stretch
        // マウスの上下移動量(deltaY)を dragAmount に変換 (感度調整必要)
        const dragAmount = -dragDelta.y * 0.5; // Y下向きが正なので反転、係数は調整
        stretchBlock(dragState.targetBlockId, dragState.targetFaceNormal, dragAmount);
    } else { // 通常ドラッグ = Shear
        // ★マウス移動ベクトルをワールド平面に投影し、ローカル座標でのずれベクトルを計算する
        // この部分はRaycastや投影計算が必要で複雑
        // 仮実装: マウス移動量をそのまま使う（不正確）
        const dragVectorWorld = new THREE.Vector3(dragDelta.x, 0, -dragDelta.y).multiplyScalar(0.5); // 仮
        shearBlock(dragState.targetBlockId, dragState.targetFaceNormal, dragVectorWorld);
    }

    // 次のフレームのために開始座標を更新する？ -> しない方が変化量が分かりやすい
    // dragState.startCoords.copy(currentMouse);
}

// ★追加: ドラッグ終了処理
function onPointerUp(event) {
    if (event.button !== 0) return;
    if (dragState.isDragging) {
        dragState.isDragging = false;
        dragState.targetBlockId = null;
        document.body.style.cursor = 'default'; // カーソル戻す
        console.log("Dragging ended.");
        // 必要なら最終状態の確定処理など
    }
}

function onKeyDown(event) {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';
    if (isInputFocused) return;

    let needsPreviewUpdate = false;

    // ★ Shift+E で XML編集モード切替
    if (event.shiftKey && event.code === 'KeyE') {
        event.preventDefault();
        setXmlEditMode(!isXmlEditModeActive());
        setPreviewVisible(false);
    } else if (event.code === 'KeyX') { // 削除モード切替
        setDeleteMode(!isDeleteModeActive());
        setPreviewVisible(false);
    } else {
        // モードに応じた操作
        if (isXmlEditModeActive()) {
            handleBlockRotation(event.code); // JKL 回転
        } else if (!isDeleteModeActive()) {
            needsPreviewUpdate = handlePreviewRotationKeyPress(event.code) || handlePreviewFlipKeyPress(event.code);
        }
    }
    // Ctrlキーの状態は onPointerDown で取得済み

    if (needsPreviewUpdate) {
        // updatePreviewBlock(mouse); // animateループに任せる
    }
}
// ★追加: Ctrlキー離した場合の処理 (ドラッグ中に離された場合)
function onKeyUp(event) {
    if (event.code === 'ControlLeft' || event.code === 'ControlRight') {
        if (dragState.isDragging) {
            dragState.isCtrlPressed = false;
        }
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
    setPreviewVisible(false);
    if (dragState.isDragging) { // ドラッグ中にマウスが外れたら終了
        onPointerUp({ button: 0 }); // 左ボタンUPイベントを擬似的に発生
    }
    clearFaceHighlight(); // 面ハイライトも消す
}

export function getIsMouseOverCanvas() {
    return isMouseOverCanvas;
}

/**
 * ★ 新規: 現在のマウス座標(正規化済)のコピーを返します。
 * @returns {THREE.Vector2}
 */
export function getCurrentMouseCoords() {
    return mouse.clone(); // ★ クローンを返す
}