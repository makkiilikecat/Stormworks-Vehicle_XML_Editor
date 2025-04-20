// src/controllers/InputHandler.js
import * as THREE from 'three';
import { getPreviewPosition, getPreviewOrientationMatrix, updatePreviewBlock, rotatePreview, flipPreview, setPreviewVisible } from './PreviewController.js';
import { addBlock, removeBlock, getAllMeshes, updateBlockTransform } from '../models/BlockDataManager.js'; // DataManager利用
import { setDeleteMode, isDeleteModeActive, setXmlEditMode, isXmlEditModeActive, setSelectedBlockId, getSelectedBlockId } from '../app/AppState.js';
import { raycastFromMouse } from '../services/RaycastService.js'; // Raycastサービス利用
import { X_AXIS, Y_AXIS, Z_AXIS, ROTATION_ANGLE } from '../app/Constants.js';
import { selectBlockByRaycast, highlightHoveredFace, clearFaceHighlight, setGhostVisible, updateGhostMesh } from './SelectionController.js'; // 面ハイライト関連追加
import { handleRotationInput as handleBlockRotation, stretchBlock, shearBlock, calculateStretch, calculateShear } from './BlockTransformController.js'; // stretch/shear追加


let isMouseOverCanvas = false;
const mouse = new THREE.Vector2(); // Raycasting用マウス座標

const dragState = {
    isDragging: false,
    mode: null, // 'shear' or 'stretch'
    startPoint: new THREE.Vector3(),
    startMouse: new THREE.Vector2(),
    currentMouse: new THREE.Vector2(), // ★ 追加: 現在のマウスNDC
    lastMouse: new THREE.Vector2(),    // ★ 追加: 1フレーム前のマウスNDC
    face: null, // { normal, axisInfo, center, materialIndex }
    dragPlaneCameraNormal: new THREE.Plane(), // せん断用
    dragStartPointOnPlane: new THREE.Vector3(), // せん断用
    initialBlockMatrix: new THREE.Matrix4(), // ドラッグ開始時の行列
    targetBlockId: null, // ★ 追加: ドラッグ対象ID
};
const dragPlane = new THREE.Plane(); // ストレッチ用平面
const currentIntersection = new THREE.Vector3(); // 計算用
const dragVectorWorld = new THREE.Vector3(); // 計算用

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
    dragState.lastMouse.copy(dragState.currentMouse); // ★ 前回座標を更新
    dragState.currentMouse.copy(mouse);           // ★ 現在座標を更新

    if (isXmlEditModeActive() && getSelectedBlockId() && !dragState.isDragging) {
        highlightHoveredFace(mouse);
    } else {
        clearFaceHighlight();
    }
}

function onPointerDown(event) {
    if (event.button !== 0) return; // 左クリックのみ
    dragState.startCoords.copy(mouse); // ドラッグ開始座標記録
    const isShiftPressed = event.shiftKey;

    if (isDeleteModeActive()) {
        handleDeleteClick();
    }  else if (isXmlEditModeActive()) {
        const intersectInfo = highlightHoveredFace(mouse); // ハイライト & 面情報取得
        if (intersectInfo && intersectInfo.object.userData.blockId === getSelectedBlockId()) {
            dragState.isDragging = true;
            dragState.mode = isShiftPressed ? 'stretch' : 'shear'; // ★ モード設定
            dragState.targetBlockId = getSelectedBlockId();
            dragState.face = intersectInfo; // 面情報を保持
            dragState.startPoint.copy(intersectInfo.point);
            dragState.currentMouse.copy(mouse); // 現在座標を初期化
            dragState.lastMouse.copy(mouse);    // 前回座標も初期化

            const selectedMesh = getMeshById(dragState.targetBlockId);
            if (!selectedMesh) { dragState.isDragging = false; return; } // 安全策
            dragState.initialBlockMatrix.copy(selectedMesh.matrix); // ★ 開始時行列を保存

            // せん断モード用の平面設定 (サンプル同様)
            if (dragState.mode === 'shear') {
                const camera = InputHandler_getCamera(); // App.jsからカメラ取得(仮)
                if (!camera) { dragState.isDragging = false; return; }
                const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
                dragState.dragPlaneCameraNormal.setFromNormalAndCoplanarPoint(cameraForward, intersectInfo.center);
                intersectPlaneFromMouse(mouse, dragState.dragPlaneCameraNormal, dragState.dragStartPointOnPlane);
            }
            // ストレッチモード用の平面設定 (面に垂直)
            if (dragState.mode === 'stretch') {
                 dragPlane.setFromNormalAndCoplanarPoint(dragState.face.normal, dragState.startPoint);
            }

            setGhostVisible(true); // ★ ゴースト表示開始
            document.body.style.cursor = 'grabbing';
            clearFaceHighlight();
        } else {
            selectBlockByRaycast(mouse); // 選択/解除
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

function onPointerMove(event) {
    if (!dragState.isDragging || !dragState.targetBlockId) return;

    // ★ マウス座標は onMouseMove で更新済みなので currentMouse を使う
    const currentMouseNDC = dragState.currentMouse;
    const selectedMesh = getMeshById(dragState.targetBlockId);
    if (!selectedMesh) return; // 安全策

    let transformResult = null;

    if (dragState.mode === 'stretch') {
        // ★ 修正: Raycastベースの押し引き量計算
        if (intersectPlaneFromMouse(currentMouseNDC, dragPlane, currentIntersection)) {
             dragVectorWorld.copy(currentIntersection).sub(dragState.targetPoint);
             const dragAmount = dragVectorWorld.dot(dragState.face.normal);
             transformResult = calculateStretch(dragState.targetBlockId, dragState.initialBlockMatrix, dragState.face.normal, dragAmount);
             // ★ ドラッグ開始点を更新しない (開始点からの総移動量で計算)
        }
    } else if (dragState.mode === 'shear') {
        // ★ 修正: サンプルのせん断ロジックを呼び出す
        const camera = InputHandler_getCamera(); // 仮
        if (!camera) return;
        if (intersectPlaneFromMouse(currentMouseNDC, dragState.dragPlaneCameraNormal, currentIntersection)) {
             dragVectorWorld.copy(currentIntersection).sub(dragState.dragStartPointOnPlane);
             transformResult = calculateShear(dragState.targetBlockId, dragState.initialBlockMatrix, dragVectorWorld, dragState.face.axisInfo);
             // ★ ドラッグ開始点を更新して連続的な操作にする
             // dragState.dragStartPointOnPlane.copy(currentIntersection); // ← これだと挙動が違うかも？要検証
        }
    }

    if (transformResult) {
        // ★ リアルタイム表示更新 (メッシュ直接操作)
        selectedMesh.matrix.copy(transformResult.realtimeMatrix);
        // ★ ゴースト表示更新 (整数化・クランプ後)
        updateGhostMesh(transformResult.ghostMatrix);
    }
}

function onPointerUp(event) {
    if (event.button !== 0 || !dragState.isDragging) return;

    // ★ ゴーストの最終状態を取得してデータ確定
    const ghostMatrix = new THREE.Matrix4(); // 仮の行列
    const ghostMesh = SelectionController_getGhostMesh(); // 仮の関数
    if (ghostMesh) {
         ghostMatrix.copy(ghostMesh.matrix);
         // 分解して position と orientation を取得
         const { position, orientation } = MatrixUtils_decomposeWorldMatrix(ghostMatrix); // 仮の関数
         updateBlockTransform(dragState.targetBlockId, position, orientation); // DataManager更新
         console.log("Block transform confirmed from ghost.");
    } else {
         console.warn("Ghost mesh not found on pointer up.");
         // フォールバック: 最後のリアルタイム行列から確定？ or 何もしない？
    }


    setGhostVisible(false); // ゴースト非表示
    dragState.isDragging = false;
    dragState.targetBlockId = null;
    dragState.face = null;
    document.body.style.cursor = 'default';
    console.log("Dragging ended.");
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