/**
 * @fileoverview XML編集モードにおけるドラッグによるブロック変形操作
 * (せん断 - Shear / 伸縮 - Stretch) のイベントハンドリングを担当します。
 * マウスイベント (PointerDown, PointerMove, PointerUp) を捕捉し、
 * 変形計算モジュール (dragTransformCalculations.js) を呼び出します。
 * 操作中は、変形状態を示す 変形プレビューゴースト と、操作対象の 編集キューブ を
 * リアルタイムで更新します。
 * 操作確定時には、BlockData の状態 (position, rotationMatrix) を更新し、
 * アンドゥ履歴に登録します。
 *
 * 依存関係:
 * - selectionState.js: getSelectedBlocks
 * - editMode.js: getCurrentMode, EditMode
 * - ghostBlock.js: showGhostBlock, updateGhostBlockTransform, hideGhostBlock (変形プレビューゴースト用)
 * - mathUtils.js: roundAndClampMatrix, getLocalAxisInfoFromWorldNormal, getFaceCenterWorld
 * - historyManager.js: addAction
 * - dragState.js: dragState, resetDragState (ドラッグ中の状態管理)
 * - dragTransformCalculations.js: applyShearTransform, applyStretchTransform (実際の変形計算)
 */
import * as THREE from 'three';
import { getSelectedBlocks } from './selectionState.js';
import { EditMode, getCurrentMode } from '../state/editMode.js';
import { showGhostBlock, updateGhostBlockTransform, hideGhostBlock } from '../rendering/ghostBlock.js';
import { roundAndClampMatrix, getLocalAxisInfoFromWorldNormal, getFaceCenterWorld } from '../utils/mathUtils.js';
import { addAction } from '../state/historyManager.js';
import { dragState, resetDragState } from './dragState.js';
import { applyShearTransform, applyStretchTransform } from './dragTransformCalculations.js';

// --- Raycasting用 (このモジュール内でのみ使用) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(); // マウス座標 (正規化デバイス座標)

// --- プライベート ヘルパー関数 ---

/**
 * マウスイベントから正規化デバイス座標 (NDC) を取得します。
 * NDC は Three.js の Raycasting で使用され、(-1, -1) が左下、(1, 1) が右上に対応します。
 * @param {PointerEvent} event - マウスイベント (pointerdown, pointermove など)。
 * @param {HTMLElement} domElement - レンダラー (Canvas) の DOM 要素。座標計算の基準。
 * @returns {THREE.Vector2} 正規化デバイス座標。
 * @private
 */
function getMouseNDC(event, domElement) {
    const rect = domElement.getBoundingClientRect(); // Canvas の画面上の位置とサイズを取得
    // マウスのクライアント座標を Canvas 内の相対座標に変換し、さらにNDC(-1~1)に変換
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; // Y軸は上下反転
    return mouse;
}

/**
 * 指定されたマウス座標にある 編集キューブ の面情報を取得します。
 * Raycasting を行い、交差した点の座標、面のワールド法線、ローカル軸情報、面の中心座標を返します。
 * @param {THREE.Vector2} mouseCoords - 正規化デバイス座標。
 * @param {THREE.Camera} camera - シーンのカメラ。Raycasting の起点。
 * @param {BlockData} targetBlockData - 対象のブロックデータ。前景メッシュ (編集キューブ) を使用。
 * @returns {object | null} 面情報 { point, normal, axisInfo, center }。交差しない、または法線が無効な場合は null。
 * @private
 */
function getIntersectedFaceInfo(mouseCoords, camera, targetBlockData) {
    // 編集キューブ (foregroundMesh) がなければ処理不可
    if (!targetBlockData?.foregroundMesh) {
        console.warn("[DragHandler] 変形対象の編集キューブが見つかりません。", targetBlockData);
        return null;
    }
    // Raycaster を設定 (カメラ位置とマウス座標からレイを生成)
    raycaster.setFromCamera(mouseCoords, camera);
    // 編集キューブとの交差判定を実行
    const intersects = raycaster.intersectObject(targetBlockData.foregroundMesh);

    // 交差があり、かつ面情報 (face) が取得できた場合
    if (intersects.length > 0 && intersects[0].face) {
        const intersect = intersects[0]; // 最も手前にある交差情報
        const mesh = targetBlockData.foregroundMesh; // 編集キューブのメッシュ

        // 交差した面のワールド法線を計算
        // face.normal (ローカル座標) をメッシュのワールド行列の回転部分で変換
        const worldNormal = intersect.face.normal.clone()
                              .transformDirection(mesh.matrixWorld) // ワールド空間での向きに変換
                              .normalize();                          // 正規化

        // 法線ベクトルが無効 (NaN やゼロベクトルに近い) でないかチェック
        if (isNaN(worldNormal.x) || worldNormal.lengthSq() < 0.5) {
            console.warn("[DragHandler] 無効な面の法線を検出しました。", worldNormal);
            return null;
        }

        // ワールド法線とオブジェクトの行列から、どのローカル軸に対応するかを判定
        const axisInfo = getLocalAxisInfoFromWorldNormal(worldNormal, mesh.matrix);
        // 対応する面のワールド中心座標を計算
        const faceCenter = getFaceCenterWorld(mesh.matrix, axisInfo);

        // 必要な情報をまとめて返す
        return {
            point: intersect.point, // 交差点 (ワールド座標)
            normal: worldNormal,    // 面のワールド法線ベクトル
            axisInfo: axisInfo,     // { axisIndex: number (0-2), sign: number (+1 or -1) }
            center: faceCenter      // 面の中心 (ワールド座標)
        };
    }
    // 交差がなかった場合
    return null;
}


// --- 公開 イベントハンドラ ---

/**
 * ポインターダウンイベントを処理し、ドラッグ変形を開始します。
 * XML編集モードで、単一ブロックが選択され、かつ編集キューブの面をクリックした場合に開始します。
 * @param {PointerEvent} event - PointerEvent オブジェクト。
 * @param {THREE.Camera} camera - シーンのカメラ。
 * @param {THREE.Scene} scene - シーンオブジェクト (変形プレビューゴースト表示用)。
 * @param {HTMLElement} domElement - レンダラーのDOM要素 (Canvas)。
 * @param {Function} disableControls - OrbitControls を無効化するためのコールバック関数。
 * @returns {boolean} ドラッグ変形を開始した場合は true、それ以外は false。
 */
export function handleDragTransformPointerDown(event, camera, scene, domElement, disableControls) {
    // XML編集モード以外、またはマウスの左ボタン以外の場合は何もしない
    if (getCurrentMode() !== EditMode.XML_EDIT || event.button !== 0) return false;
    // 選択中のブロックを取得
    const selected = getSelectedBlocks();
    // 選択数が1でない場合は何もしない
    if (selected.length !== 1) return false;

    const targetBlockData = selected[0]; // 変形対象のブロックデータ
    const mouseNDC = getMouseNDC(event, domElement); // マウス座標をNDCに変換
    // マウスカーソル下の面情報を取得
    const faceInfo = getIntersectedFaceInfo(mouseNDC, camera, targetBlockData);

    // 有効な面がクリックされた場合のみドラッグ開始処理へ
    if (faceInfo) {
        console.log("[DragHandler] ドラッグ変形開始");

        // --- ドラッグ状態 (dragState) を初期化 ---
        dragState.isDragging = true; // ドラッグ中フラグを立てる
        dragState.mode = event.shiftKey ? 'stretch' : 'shear'; // Shiftキーで伸縮モード、なければせん断モード
        dragState.targetBlockData = targetBlockData; // 対象ブロックデータを保持
        dragState.startPointWorld.copy(faceInfo.point); // ドラッグ開始点のワールド座標
        dragState.startMouseNDC.copy(mouseNDC);       // ドラッグ開始時のマウスNDC
        dragState.currentMouseNDC.copy(mouseNDC);     // 現在のマウスNDC (初期値は開始時と同じ)
        dragState.lastMouseNDC.copy(mouseNDC);        // 前回のマウスNDC (初期値は開始時と同じ)
        dragState.faceInfo = faceInfo;                // クリックされた面の情報

        // 変形計算の基準となる、ドラッグ開始時の行列を保存
        // (編集キューブの現在の行列を使用)
        dragState.initialBlockMatrix.copy(targetBlockData.foregroundMesh.matrix);
        // 変形中の行列も初期状態にリセット
        dragState.currentTransformedMatrix.copy(dragState.initialBlockMatrix);

        // せん断モードの場合、ドラッグ操作用の平面を計算
        if (dragState.mode === 'shear') {
            // カメラの前方ベクトルを計算
            const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            // カメラに垂直で、クリックされた面の中心を通る平面を定義
            dragState.dragPlaneCameraNormal.setFromNormalAndCoplanarPoint(cameraForward, faceInfo.center);
            // マウスカーソルのレイがこの平面と交差する点を計算し、ドラッグ開始点とする
            raycaster.setFromCamera(mouseNDC, camera);
            raycaster.ray.intersectPlane(dragState.dragPlaneCameraNormal, dragState.dragStartPointOnPlane);
        }

        // 変形プレビューゴーストの表示を開始
        // 開始時の行列を元に、整数座標にスナップした状態を表示
        dragState.ghostMatrix.copy(dragState.initialBlockMatrix);
        roundAndClampMatrix(dragState.ghostMatrix); // 整数座標に丸め、最小厚みを保証
        showGhostBlock(scene, dragState.ghostMatrix); // ゴースト表示

        // 操作開始の準備
        disableControls(); // カメラコントロール(OrbitControls)を無効化
        document.body.style.cursor = 'grabbing'; // マウスカーソルを変更
        console.log(`[DragHandler] ドラッグモード: ${dragState.mode}, 対象ブロックID: ${targetBlockData.id}`);
        return true; // ドラッグ開始成功
    }

    // 有効な面をクリックしなかった場合
    console.log("[DragHandler] 有効な面が見つからなかったため、ドラッグを開始できません。");
    return false; // ドラッグ開始失敗
}

/**
 * ポインタームーブイベントを処理し、ドラッグ中の変形を適用・表示更新します。
 * 編集キューブ (リアルタイムの非スナップ状態) と
 * 変形プレビューゴースト (スナップ後の状態) の両方を更新します。
 * @param {PointerEvent} event - PointerEvent オブジェクト。
 * @param {THREE.Camera} camera - シーンのカメラ。
 * @param {HTMLElement} domElement - レンダラーのDOM要素 (Canvas)。
 * @param {THREE.Scene} scene - シーンオブジェクト (ゴースト表示用だが、直接は使わない)。
 */
export function handleDragTransformPointerMove(event, camera, domElement, scene) {
    // ドラッグ中でなければ何もしない
    if (!dragState.isDragging) return;

    // マウス座標を更新
    const mouseNDC = getMouseNDC(event, domElement);
    dragState.lastMouseNDC.copy(dragState.currentMouseNDC); // 前回座標を保存
    dragState.currentMouseNDC.copy(mouseNDC);             // 現在座標を更新

    // マウス移動量に基づいて変形計算を実行
    // (dragState.currentTransformedMatrix が内部で更新される)
    if (dragState.mode === 'shear') {
        applyShearTransform(camera); // せん断変形計算
    } else if (dragState.mode === 'stretch') {
        applyStretchTransform(camera); // 伸縮変形計算
    }

    // 編集キューブ の行列をリアルタイムで更新 (スナップ前)
    if (dragState.targetBlockData?.foregroundMesh) {
        dragState.targetBlockData.foregroundMesh.matrix.copy(dragState.currentTransformedMatrix);
        dragState.targetBlockData.foregroundMesh.matrixWorldNeedsUpdate = true;
    }

    // 変形プレビューゴースト の表示を更新 (スナップ後)
    dragState.ghostMatrix.copy(dragState.currentTransformedMatrix); // 最新の変形行列をコピー
    roundAndClampMatrix(dragState.ghostMatrix);                 // 丸め＆クランプ
    updateGhostBlockTransform(dragState.ghostMatrix);           // ゴーストの行列を更新

}


/**
 * ポインターアップイベントを処理し、ドラッグ変形を終了・確定します。
 * 最終的な状態を BlockData に適用し、アンドゥ履歴に登録します。
 * @param {PointerEvent | null} event - PointerEvent オブジェクト。pointerleave などで null の場合あり。
 * @param {Function} enableControls - OrbitControls を有効化するためのコールバック関数。
 */
export function handleDragTransformPointerUp(event, enableControls) {
    // ドラッグ中でなければ終了
    if (!dragState.isDragging) return;
    // event が存在し、それが左ボタンのリリースでなければ終了 (誤動作防止)
    if (event && event.button !== 0) return;

    console.log("[DragHandler] ドラッグ変形終了処理を開始。");

    // --- 変更を確定 ---
    // 最終的な姿勢は、変形プレビューゴーストが表示していた、丸め・クランプ後の行列
    const finalWorldMatrix = dragState.ghostMatrix.clone();
    const targetBlockData = dragState.targetBlockData; // 操作対象のBlockData

    // --- アンドゥ用に、操作前の BlockData 状態を保存 ---
    const oldPosition = targetBlockData.position.clone();
    const oldRotationMatrix = targetBlockData.rotationMatrix.clone();

    // 変更があったかどうかを確認するために、操作前のワールド行列も計算
    // (BlockDataのpositionとrotationMatrixから計算)
    const _tmpMatrix = new THREE.Matrix4();
    const oldWorldMatrixCheck = _tmpMatrix.copy(new THREE.Matrix4().makeTranslation(oldPosition.x, oldPosition.y, oldPosition.z)).multiply(oldRotationMatrix);

    // 最終的な行列 (finalWorldMatrix) と操作前の行列 (oldWorldMatrixCheck) を比較
    if (!oldWorldMatrixCheck.equals(finalWorldMatrix)) {
        console.log("[DragHandler] 変更あり。最終的な変形を適用します。");

        // 1. 最終ワールド行列から、BlockData に保存するための新しい position と rotationMatrix を計算
        const newPosition = new THREE.Vector3();
        const newQuaternion = new THREE.Quaternion();
        const newScale = new THREE.Vector3(); // スケール/せん断成分
        finalWorldMatrix.decompose(newPosition, newQuaternion, newScale); // 分解

        // 新しい rotationMatrix (回転 + スケール/せん断) を作成
        // decompose で得た Quaternion と Scale から Matrix4 を再構成
        const newRotationMatrix = new THREE.Matrix4().compose(
            new THREE.Vector3(), // 位置は(0,0,0)で
            newQuaternion,       // 回転
            newScale             // スケール/せん断
        );

        // 2. ★修正: アンドゥ履歴に BlockData の position/rotationMatrix の変化を登録
        addAction({
            type: 'TRANSFORM_BLOCKS', // アクションタイプ
            transformations: [{       // 変更内容の配列 (今回は単一ブロック)
                blockId: targetBlockData.id, // 対象ブロックID
                // 操作前の状態
                oldPosition: oldPosition,             // 操作前の Vector3
                oldRotationMatrix: oldRotationMatrix, // 操作前の Matrix4
                // 操作後の状態
                newPosition: newPosition.clone(),       // 操作後の Vector3
                newRotationMatrix: newRotationMatrix.clone() // 操作後の Matrix4
            }]
        });
        console.log("[DragHandler] アンドゥ履歴に TRANSFORM_BLOCKS を登録しました。");

        // 3. BlockData の position と rotationMatrix を新しい値で更新
        targetBlockData.position.copy(newPosition);
        targetBlockData.rotationMatrix.copy(newRotationMatrix);
        console.log(`[DragHandler] Block ID ${targetBlockData.id} の position, rotationMatrix を更新しました。`);

        // 4. 表示更新 (編集キューブと背景ゴーストの両方)
        // BlockData の updateMeshMatrix を呼び出すことで、関連する両方のメッシュ行列が更新される
        targetBlockData.updateMeshMatrix();
        console.log(`[DragHandler] Block ID ${targetBlockData.id} の updateMeshMatrix を呼び出し、表示を更新。`);

        // 5. UI更新イベント発行 (XML編集パネルなどが反応できるように)
        document.dispatchEvent(new CustomEvent('blocktransformupdated', { detail: { blockId: targetBlockData.id } }));
        console.log(`[DragHandler] ブロック ID ${targetBlockData.id} の変形を確定しました。`);

    } else {
        // 変更がなかった場合 (例: クリックしただけ、元の位置に戻した)
        // ドラッグ中にリアルタイムで動いていた編集キューブの表示を、操作開始時の状態に戻す
        if (targetBlockData.foregroundMesh) {
            targetBlockData.foregroundMesh.matrix.copy(oldWorldMatrixCheck);
            targetBlockData.foregroundMesh.matrixWorldNeedsUpdate = true;
        }
        console.log("[DragHandler] 実質的な変更がなかったため、変形は適用されませんでした。");
    }

    // --- 状態リセット ---
    hideGhostBlock();       // 変形プレビューゴーストを非表示
    resetDragState();       // ドラッグ関連の状態変数をリセット
    enableControls();       // カメラ操作を有効化
    document.body.style.cursor = 'default'; // マウスカーソルをデフォルトに戻す
    console.log("[DragHandler] ドラッグ状態をリセットしました。");
}