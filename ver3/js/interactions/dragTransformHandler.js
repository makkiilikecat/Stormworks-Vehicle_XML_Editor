/**
 * @fileoverview ドラッグによるブロック変形操作のイベントハンドリング。
 */
import * as THREE from 'three';
import { getSelectedBlocks } from './selectionHandler.js';
import { EditMode, getCurrentMode } from '../state/editMode.js';
import { showGhostBlock, updateGhostBlockTransform, hideGhostBlock } from '../rendering/ghostBlock.js';
import { roundAndClampMatrix, getLocalAxisInfoFromWorldNormal, getFaceCenterWorld } from '../utils/mathUtils.js';
import { addAction } from '../state/historyManager.js';
// --- 修正: 分割したモジュールをインポート ---
import { dragState, resetDragState } from './dragState.js';
import { applyShearTransform, applyStretchTransform } from './dragTransformCalculations.js';
// -----------------------------------------

// --- Raycasting用 ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(); // このファイル内で使用するマウス座標用

/** マウス座標取得 */
function getMouseNDC(event, domElement) {
    const rect = domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return mouse;
}

/** 面情報取得 */
function getIntersectedFaceInfo(mouseCoords, camera, targetBlockData) {
    // (dragTransformCalculations.js内の同名関数とほぼ同じだが、依存性を減らすため再定義)
     if (!targetBlockData?.mesh) return null;
     raycaster.setFromCamera(mouseCoords, camera);
     const intersects = raycaster.intersectObject(targetBlockData.mesh);
     if (intersects.length > 0 && intersects[0].face) {
         const i = intersects[0]; const m = targetBlockData.mesh;
         const n = i.face.normal.clone().transformDirection(m.matrixWorld).normalize();
         if (isNaN(n.x) || n.lengthSq() < 0.5) { return null; }
         const a = getLocalAxisInfoFromWorldNormal(n, m.matrix);
         const c = getFaceCenterWorld(m.matrix, a);
         return { point: i.point, normal: n, axisInfo: a, center: c };
     } return null;
}


/**
 * ポインターダウンイベントを処理し、ドラッグ変形を開始します。
 * @param {PointerEvent} event
 * @param {THREE.Camera} camera
 * @param {THREE.Scene} scene
 * @param {HTMLElement} domElement
 * @param {Function} disableControls - OrbitControls無効化コールバック。
 * @returns {boolean} ドラッグを開始したかどうか。
 */
export function handleDragTransformPointerDown(event, camera, scene, domElement, disableControls) {
    if (getCurrentMode() !== EditMode.XML_EDIT || event.button !== 0) return false;
    const selected = getSelectedBlocks();
    if (selected.length !== 1) return false;

    const targetBlockData = selected[0];
    const mouseNDC = getMouseNDC(event, domElement);
    const faceInfo = getIntersectedFaceInfo(mouseNDC, camera, targetBlockData);

    if (faceInfo) {
        // --- dragStateを初期化 ---
        dragState.isDragging = true;
        dragState.mode = event.shiftKey ? 'stretch' : 'shear';
        dragState.targetBlockData = targetBlockData;
        dragState.startPointWorld.copy(faceInfo.point);
        dragState.startMouseNDC.copy(mouseNDC);
        dragState.currentMouseNDC.copy(mouseNDC);
        dragState.lastMouseNDC.copy(mouseNDC);
        dragState.faceInfo = faceInfo;
        // BlockDataの現在の状態を行列にコピー (位置含む)
        dragState.initialBlockMatrix.copy(targetBlockData.rotationMatrix);
        dragState.initialBlockMatrix.setPosition(targetBlockData.position);
        dragState.currentTransformedMatrix.copy(dragState.initialBlockMatrix);

        // せん断用の平面と開始点を計算 (必要なら)
        if (dragState.mode === 'shear') {
            const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            dragState.dragPlaneCameraNormal.setFromNormalAndCoplanarPoint(cameraForward, faceInfo.center);
            // intersectPlaneは calculations 内にあるが、ここでは直接計算しても良い
            raycaster.setFromCamera(mouseNDC, camera);
            raycaster.ray.intersectPlane(dragState.dragPlaneCameraNormal, dragState.dragStartPointOnPlane);
        }

        // ゴースト表示開始 (丸め・クランプ後)
        dragState.ghostMatrix.copy(dragState.initialBlockMatrix);
        roundAndClampMatrix(dragState.ghostMatrix);
        showGhostBlock(scene, dragState.ghostMatrix);

        disableControls(); // カメラ操作無効化
        document.body.style.cursor = 'grabbing';
        console.log(`Drag Start: Mode=${dragState.mode}, BlockID=${targetBlockData.id}`);
        return true;
    }
    return false;
}

/**
 * ポインタームーブイベントを処理し、ドラッグ変形を適用します。
 * @param {PointerEvent} event
 * @param {THREE.Camera} camera
 * @param {HTMLElement} domElement
 * @param {THREE.Scene} scene - ゴースト表示用。
 */
export function handleDragTransformPointerMove(event, camera, domElement, scene) {
    if (!dragState.isDragging) return;

    const mouseNDC = getMouseNDC(event, domElement);
    dragState.lastMouseNDC.copy(dragState.currentMouseNDC);
    dragState.currentMouseNDC.copy(mouseNDC);

    // 変形計算を実行 (dragState.currentTransformedMatrix が更新される)
    if (dragState.mode === 'shear') {
        applyShearTransform(camera);
    } else if (dragState.mode === 'stretch') {
        applyStretchTransform(camera);
    }

    // --- 修正: リアルタイムで対象ブロックの行列も更新 ---
    if (dragState.targetBlockData?.mesh) {
        dragState.targetBlockData.mesh.matrix.copy(dragState.currentTransformedMatrix);
        dragState.targetBlockData.mesh.matrixWorldNeedsUpdate = true;
    }
    // -------------------------------------------------

    // ゴーストブロックの更新 (丸め・クランプ後)
    dragState.ghostMatrix.copy(dragState.currentTransformedMatrix);
    roundAndClampMatrix(dragState.ghostMatrix);
    updateGhostBlockTransform(dragState.ghostMatrix);
}


/**
 * ポインターアップイベントを処理し、ドラッグ変形を終了・確定します。
 * @param {PointerEvent | null} event - nullの場合、ドラッグキャンセル扱い。
 * @param {Function} enableControls - OrbitControls有効化コールバック。
 */
export function handleDragTransformPointerUp(event, enableControls) {
    // event が null でもドラッグ中なら終了処理を実行 (pointerleaveからの呼び出し)
    if (!dragState.isDragging) return;
    // event があり、それが左ボタン以外なら無視 (他のボタン押下など)
    if (event && event.button !== 0) return;

    // --- 変更を確定 ---
    const finalMatrix = dragState.ghostMatrix.clone(); // 丸め・クランプ後の行列
    const targetBlockData = dragState.targetBlockData;
    const oldMatrix = new THREE.Matrix4(); // アンドゥ用
    oldMatrix.copy(targetBlockData.rotationMatrix);
    oldMatrix.setPosition(targetBlockData.position); // 位置も含めて保存

    // 変更があったか比較 (equalsは厳密なので閾値比較の方が良いかも)
    if (!oldMatrix.equals(finalMatrix)) {
        console.log("Applying final transform.");
        // アンドゥ履歴に登録
        addAction({
            type: 'TRANSFORM_BLOCKS',
            transformations: [{
                blockId: targetBlockData.id,
                oldMatrix: oldMatrix,
                newMatrix: finalMatrix.clone() // クローンを保存
            }]
        });

        // BlockDataを更新
        finalMatrix.decompose(targetBlockData.position, new THREE.Quaternion(), new THREE.Vector3()); // 位置更新
        targetBlockData.rotationMatrix.copy(finalMatrix); // 回転/スケール更新
        targetBlockData.rotationMatrix.setPosition(0,0,0); // 位置情報をクリア

        // メッシュも最終状態に更新 (既にゴーストと同じはずだが念のため)
        targetBlockData.mesh.matrix.copy(finalMatrix);
        targetBlockData.mesh.matrixWorldNeedsUpdate = true;

        // UI更新イベント発行
        document.dispatchEvent(new CustomEvent('blocktransformupdated'));
    } else {
        // 変更がなかった場合は、ドラッグ中のリアルタイム変形を元に戻す
        targetBlockData.mesh.matrix.copy(oldMatrix);
        targetBlockData.mesh.matrixWorldNeedsUpdate = true;
        console.log("No significant change, reverted mesh transform.");
    }

    // --- 状態リセット ---
    resetDragState(); // 状態をリセット
    hideGhostBlock();
    enableControls();
    document.body.style.cursor = 'default';
}