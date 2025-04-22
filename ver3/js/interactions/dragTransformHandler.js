/**
 * @fileoverview ドラッグによるブロック変形操作 (せん断・伸縮) のイベントハンドリング。
 * マウスイベントを捕捉し、変形計算モジュールを呼び出し、
 * リアルタイム表示 (前景キューブ) とゴースト表示、最終的な状態更新を行う。
 */
import * as THREE from 'three';
// 状態管理とヘルパー関数をインポート
import { getSelectedBlocks } from './selectionState.js';
import { EditMode, getCurrentMode } from '../state/editMode.js';
import { showGhostBlock, updateGhostBlockTransform, hideGhostBlock } from '../rendering/ghostBlock.js';
import { roundAndClampMatrix, getLocalAxisInfoFromWorldNormal, getFaceCenterWorld } from '../utils/mathUtils.js';
import { addAction } from '../state/historyManager.js';
import { dragState, resetDragState } from './dragState.js';
import { applyShearTransform, applyStretchTransform } from './dragTransformCalculations.js';

// --- Raycasting用 (このファイル内でのみ使用) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(); // 正規化デバイス座標 (-1 to +1)

// --- プライベート ヘルパー関数 ---

/**
 * マウスイベントから正規化デバイス座標を取得します。
 * @param {PointerEvent} event - マウスイベント。
 * @param {HTMLElement} domElement - レンダラーのDOM要素 (Canvas)。
 * @returns {THREE.Vector2} 正規化デバイス座標。
 * @private
 */
function getMouseNDC(event, domElement) {
    const rect = domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return mouse;
}

/**
 * 指定されたマウス座標にあるブロック面情報を取得します。
 * Raycasting を行い、交差した面の法線や中心座標などを返します。
 * @param {THREE.Vector2} mouseCoords - 正規化デバイス座標。
 * @param {THREE.Camera} camera - シーンのカメラ。
 * @param {BlockData} targetBlockData - 対象のブロックデータ。
 * @returns {object | null} 面情報 { point, normal, axisInfo, center } または null (交差しない/不正な法線の場合)。
 * @private
 */
function getIntersectedFaceInfo(mouseCoords, camera, targetBlockData) {
    // 対象ブロックに前景メッシュがなければ処理しない
    if (!targetBlockData?.foregroundMesh) {
        console.warn("[DragHandler] 変形対象の前景メッシュが見つかりません。", targetBlockData);
        return null;
    }
    // Raycasting設定
    raycaster.setFromCamera(mouseCoords, camera);
    // 前景キューブとの交差判定
    const intersects = raycaster.intersectObject(targetBlockData.foregroundMesh);

    if (intersects.length > 0 && intersects[0].face) {
        const i = intersects[0]; // 最も手前の交差情報
        const m = targetBlockData.foregroundMesh; // 前景メッシュ
        // ワールド法線を取得 (メッシュのワールド行列を使って変換)
        const worldNormal = i.face.normal.clone().transformDirection(m.matrixWorld).normalize();
        // 法線が無効 (NaN や ゼロベクトルに近い) 場合は失敗
        if (isNaN(worldNormal.x) || worldNormal.lengthSq() < 0.5) {
            console.warn("[DragHandler] 無効な面の法線を検出しました。");
            return null;
        }
        // ローカル軸情報と面のワールド中心座標を取得
        const axisInfo = getLocalAxisInfoFromWorldNormal(worldNormal, m.matrix); // ローカル軸
        const faceCenter = getFaceCenterWorld(m.matrix, axisInfo); // 面の中心
        return { point: i.point, normal: worldNormal, axisInfo: axisInfo, center: faceCenter };
    }
    // 交差なし
    return null;
}


// --- 公開 イベントハンドラ ---

/**
 * ポインターダウンイベントを処理し、ドラッグ変形を開始します。
 * XML編集モードで、かつ単一ブロックが選択されている場合にのみ動作します。
 * @param {PointerEvent} event - PointerEvent オブジェクト。
 * @param {THREE.Camera} camera - シーンのカメラ。
 * @param {THREE.Scene} scene - シーンオブジェクト (ゴースト表示用)。
 * @param {HTMLElement} domElement - レンダラーのDOM要素 (Canvas)。
 * @param {Function} disableControls - OrbitControls無効化コールバック関数。
 * @returns {boolean} ドラッグ変形を開始した場合は true、それ以外は false。
 */
export function handleDragTransformPointerDown(event, camera, scene, domElement, disableControls) {
    // XML編集モード以外、または左ボタン以外の場合は処理しない
    if (getCurrentMode() !== EditMode.XML_EDIT || event.button !== 0) return false;
    // 選択中のブロックを取得
    const selected = getSelectedBlocks();
    // 単一選択でない場合は処理しない
    if (selected.length !== 1) return false;

    const targetBlockData = selected[0]; // 変形対象のブロックデータ
    const mouseNDC = getMouseNDC(event, domElement); // マウス座標取得
    // マウス下の面情報を取得
    const faceInfo = getIntersectedFaceInfo(mouseNDC, camera, targetBlockData);

    // 面情報が取得できた場合のみドラッグ開始
    if (faceInfo) {
        console.log("[DragHandler] ドラッグ変形開始");
        // --- ドラッグ状態 (dragState) を初期化 ---
        dragState.isDragging = true;
        dragState.mode = event.shiftKey ? 'stretch' : 'shear'; // Shiftキーでモード切替
        dragState.targetBlockData = targetBlockData;
        dragState.startPointWorld.copy(faceInfo.point); // 開始交点 (ワールド)
        dragState.startMouseNDC.copy(mouseNDC);       // 開始マウス座標 (NDC)
        dragState.currentMouseNDC.copy(mouseNDC);     // 現在マウス座標 (NDC)
        dragState.lastMouseNDC.copy(mouseNDC);        // 前回マウス座標 (NDC)
        dragState.faceInfo = faceInfo;                // 面情報
        // 開始時のブロック行列 (前景キューブの行列を使用) を保存
        dragState.initialBlockMatrix.copy(targetBlockData.foregroundMesh.matrix);
        // 現在の変形中行列も初期化
        dragState.currentTransformedMatrix.copy(dragState.initialBlockMatrix);

        // せん断モード用の平面と開始点を計算
        if (dragState.mode === 'shear') {
            const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            dragState.dragPlaneCameraNormal.setFromNormalAndCoplanarPoint(cameraForward, faceInfo.center);
            // 交点計算は calculations モジュール内の intersectPlane を使う想定だが、
            // ここで直接 Raycaster を使っても良い
            raycaster.setFromCamera(mouseNDC, camera);
            raycaster.ray.intersectPlane(dragState.dragPlaneCameraNormal, dragState.dragStartPointOnPlane);
        }

        // ゴースト表示開始 (丸め・クランプ後の初期状態)
        dragState.ghostMatrix.copy(dragState.initialBlockMatrix); // 開始時の行列をコピー
        roundAndClampMatrix(dragState.ghostMatrix);             // 丸め＆クランプ
        showGhostBlock(scene, dragState.ghostMatrix);           // ゴースト表示

        disableControls(); // カメラ操作を無効化
        document.body.style.cursor = 'grabbing'; // マウスカーソル変更
        console.log(`[DragHandler] ドラッグモード: ${dragState.mode}, 対象ブロックID: ${targetBlockData.id}`);
        return true; // ドラッグ開始成功
    }
    console.log("[DragHandler] 有効な面が見つからなかったため、ドラッグを開始できません。");
    return false; // ドラッグ開始失敗
}

/**
 * ポインタームーブイベントを処理し、ドラッグ中の変形を適用します。
 * 前景キューブ (リアルタイム) とゴーストブロック (スナップ後) の表示を更新します。
 * @param {PointerEvent} event - PointerEvent オブジェクト。
 * @param {THREE.Camera} camera - シーンのカメラ。
 * @param {HTMLElement} domElement - レンダラーのDOM要素 (Canvas)。
 * @param {THREE.Scene} scene - シーンオブジェクト (ゴースト表示用)。
 */
export function handleDragTransformPointerMove(event, camera, domElement, scene) {
    // ドラッグ中でなければ何もしない
    if (!dragState.isDragging) return;

    // マウス座標を更新
    const mouseNDC = getMouseNDC(event, domElement);
    dragState.lastMouseNDC.copy(dragState.currentMouseNDC); // 前回座標を保存
    dragState.currentMouseNDC.copy(mouseNDC);             // 現在座標を更新

    // 変形計算を実行 (dragState.currentTransformedMatrix が更新される)
    if (dragState.mode === 'shear') {
        applyShearTransform(camera);
    } else if (dragState.mode === 'stretch') {
        applyStretchTransform(camera);
    }

    // ★修正: 前景キューブの行列をリアルタイムで更新 (丸め前)
    if (dragState.targetBlockData?.foregroundMesh) {
        dragState.targetBlockData.foregroundMesh.matrix.copy(dragState.currentTransformedMatrix);
        dragState.targetBlockData.foregroundMesh.matrixWorldNeedsUpdate = true; // ワールド行列更新フラグ
    }

    // ゴーストブロックの表示を更新 (丸め・クランプ後)
    dragState.ghostMatrix.copy(dragState.currentTransformedMatrix); // 最新の変形行列をコピー
    roundAndClampMatrix(dragState.ghostMatrix);                 // 丸め＆クランプ
    updateGhostBlockTransform(dragState.ghostMatrix);           // ゴースト表示更新

    // ★削除: 背景ゴースト (blockData.mesh) をリアルタイムで動かす処理は不要
    // if (dragState.targetBlockData?.mesh) {
    //     dragState.targetBlockData.mesh.matrix.copy(dragState.currentTransformedMatrix);
    //     dragState.targetBlockData.mesh.matrixWorldNeedsUpdate = true;
    // }
}


/**
 * ポインターアップイベントを処理し、ドラッグ変形を終了・確定します。
 * BlockData の状態を更新し、アンドゥ履歴に登録します。
 * @param {PointerEvent | null} event - PointerEvent オブジェクト。pointerleave から呼び出された場合は null。
 * @param {Function} enableControls - OrbitControls有効化コールバック関数。
 */
export function handleDragTransformPointerUp(event, enableControls) {
    // ドラッグ中でなければ何もしない
    if (!dragState.isDragging) return;
    // event があり、それが左ボタン以外なら無視 (誤動作防止)
    if (event && event.button !== 0) return;

    console.log("[DragHandler] ドラッグ変形終了処理を開始。");

    // --- 変更を確定 ---
    // 最終的な行列はゴースト表示に使っていた丸め・クランプ後の行列
    const finalMatrix = dragState.ghostMatrix.clone();
    const targetBlockData = dragState.targetBlockData;

    // アンドゥ用に、変更前のワールド行列 (位置含む) を取得
    // ★注意: initialBlockMatrix はドラッグ開始時の前景キューブの行列であり、
    //        BlockData の position は含まれていない。ここで改めて取得する。
    const oldPosition = targetBlockData.position.clone();
    const oldRotationMatrix = targetBlockData.rotationMatrix.clone();
    const oldWorldMatrixForHistory = new THREE.Matrix4();
    oldWorldMatrixForHistory.copy(new THREE.Matrix4().makeTranslation(oldPosition.x, oldPosition.y, oldPosition.z)).multiply(oldRotationMatrix);


    // 変更があったか比較 (丸め後なので equals で比較可能)
    if (!oldWorldMatrixForHistory.equals(finalMatrix)) {
        console.log("[DragHandler] 最終的な変形を適用します。");

        // 1. アンドゥ履歴に登録
        addAction({
            type: 'TRANSFORM_BLOCKS', // タイプは単一/複数回転と同じで良い
            transformations: [{
                blockId: targetBlockData.id,
                oldMatrix: oldWorldMatrixForHistory, // 変更前のワールド行列 (位置含む)
                newMatrix: finalMatrix.clone()       // 変更後のワールド行列 (位置含む)
            }]
        });

        // 2. BlockData の position と rotationMatrix を更新
        const newPosition = new THREE.Vector3();
        const newQuaternion = new THREE.Quaternion();
        const newScale = new THREE.Vector3();
        finalMatrix.decompose(newPosition, newQuaternion, newScale); // 位置・回転・スケールを分解
        targetBlockData.position.copy(newPosition); // 新しい位置を設定
        targetBlockData.rotationMatrix.compose(new THREE.Vector3(), newQuaternion, newScale); // 回転・スケールのみで Matrix4 を再構成

        // 3. 前景キューブの行列も最終状態に更新
        if (targetBlockData.foregroundMesh) {
             targetBlockData.foregroundMesh.matrix.copy(finalMatrix);
             targetBlockData.foregroundMesh.matrixWorldNeedsUpdate = true;
        }

        // 4. 背景メッシュ (blockData.mesh) の行列も更新
        //    BlockData の updateMeshMatrix を呼ぶのが正しいため、ここでは不要
        //    (History適用時に renderBlocks が呼ばれ、その中で updateMeshMatrix が呼ばれる)
        // targetBlockData.updateMeshMatrix(); // ここで呼ぶと二度手間になる可能性

        // 5. UI更新イベント発行
        document.dispatchEvent(new CustomEvent('blocktransformupdated', { detail: { blockId: targetBlockData.id } }));
        console.log(`[DragHandler] ブロック ID ${targetBlockData.id} の変形を確定しました。`);

    } else {
        // 変更がなかった場合は、ドラッグ中のリアルタイム変形を元に戻す
        if (targetBlockData.foregroundMesh) {
            targetBlockData.foregroundMesh.matrix.copy(oldWorldMatrixForHistory); // 開始時の行列に戻す
            targetBlockData.foregroundMesh.matrixWorldNeedsUpdate = true;
        }
        console.log("[DragHandler] 実質的な変更がなかったため、変形は適用されませんでした。");
    }

    // --- 状態リセット ---
    hideGhostBlock();   // ゴースト非表示
    resetDragState();   // ドラッグ状態リセット
    enableControls();   // カメラ操作有効化
    document.body.style.cursor = 'default'; // カーソルを元に戻す
    console.log("[DragHandler] ドラッグ状態をリセットしました。");
}