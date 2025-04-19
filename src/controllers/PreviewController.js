import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import { blockGeometry, previewMaterial, snapToGrid } from '../models/BlockUtils.js';
import { BLOCK_SIZE_METERS, ROTATION_ANGLE, X_AXIS, Y_AXIS, Z_AXIS } from '../app/Constants.js';
import { raycastFromMouse } from '../services/RaycastService.js'; // Raycastサービスを利用
import { getAllMeshes, getAllBlocks } from '../models/BlockDataManager.js'; // DataManagerからメッシュ/ブロック取得
import { composeWorldMatrix } from '../models/MatrixUtils.js'; // 行列合成ヘルパー

let scene;
let previewBlock; // THREE.Mesh
const targetPosition = new THREE.Vector3();
const targetOrientationMatrix = new THREE.Matrix4();
const displayPosition = new THREE.Vector3();
const displayOrientationMatrix = new THREE.Matrix4();

let activeTween = null;
const transformMatrix = new THREE.Matrix4();
const q1 = new THREE.Quaternion(); // 計算用
const s1 = new THREE.Vector3();    // 計算用

/**
 * プレビューコントローラーを初期化します。
 * @param {THREE.Scene} scn - シーンオブジェクト
 */
export function initPreviewController(scn) {
    if (!scn) throw new Error("Scene must be provided for PreviewController");
    scene = scn;

    previewBlock = new THREE.Mesh(blockGeometry, previewMaterial.clone()); // 固有マテリアル
    previewBlock.visible = false;
    previewBlock.matrixAutoUpdate = false;
    scene.add(previewBlock);

    targetPosition.set(0, 0, 0);
    targetOrientationMatrix.identity();
    displayPosition.copy(targetPosition);
    displayOrientationMatrix.copy(targetOrientationMatrix);
}

// マウス座標はInputHandlerから注入される想定だったが、直接参照しない形式に
// (updatePreviewBlock内でRaycastServiceを呼ぶため不要になった)
// export function updateMousePosition(clientX, clientY) { /* ... */ }

/**
 * プレビューブロックの位置と表示状態を更新します (毎フレーム呼び出す)。
 * @param {THREE.Vector2} currentMouseCoords - 現在のマウス座標(正規化済)
 */
export function updatePreviewBlock(currentMouseCoords) {
    if (!previewBlock) return;

    const targetMeshes = getAllMeshes(); // DataManagerから現在のメッシュリスト取得
    if (targetMeshes.length === 0) {
        setPreviewVisible(false); return;
    }

    const intersects = raycastFromMouse(currentMouseCoords, targetMeshes); // Raycast実行

    if (intersects.length > 0) {
        const intersection = intersects[0];
        const intersectionPoint = intersection.point;
        const normalVector = intersection.face?.normal;

        if (!normalVector) { setPreviewVisible(false); return; }

        const calculatedPosition = new THREE.Vector3()
            .copy(intersectionPoint)
            .addScaledVector(normalVector, BLOCK_SIZE_METERS / 2);
        const snappedPosition = snapToGrid(calculatedPosition);

        targetPosition.copy(snappedPosition); // 目標位置を更新

        // 重なりチェック (全ブロックデータと比較)
        const allBlocks = getAllBlocks();
        const overlaps = allBlocks.some(blockData =>
            blockData.position.distanceToSquared(targetPosition) < 0.0001
        );

        if (overlaps) {
            setPreviewVisible(false);
        } else {
            if (!activeTween) { // アニメーション中でなければ表示位置も同期
                displayPosition.copy(targetPosition);
                updatePreviewMeshMatrix(); // 表示メッシュ更新
            } else {
                 // アニメーション中はTweenが位置も考慮して更新する
            }
            previewBlock.visible = true;
        }
    } else {
        setPreviewVisible(false);
    }
}

/** 表示位置と表示姿勢からプレビューメッシュのワールド行列を更新 */
function updatePreviewMeshMatrix() {
    if (!previewBlock) return;
    // MatrixUtilsのヘルパー関数を使用
    composeWorldMatrix(displayPosition, displayOrientationMatrix, previewBlock.matrix);
}


/** Tween.jsを使ってアニメーション付きで目標姿勢を回転 */
export function rotatePreview(axis, angle) {
    if (!previewBlock || !previewBlock.visible) return;
    if (activeTween) { activeTween.stop(); }

    // 1. 目標姿勢(targetOrientationMatrix)を計算
    transformMatrix.makeRotationAxis(axis, angle);
    targetOrientationMatrix.premultiply(transformMatrix);

    // 2. アニメーション開始/終了時の姿勢を取得
    const startOrientation = displayOrientationMatrix.clone();
    const startQuat = new THREE.Quaternion();
    const startScale = new THREE.Vector3();
    startOrientation.decompose(new THREE.Vector3(), startQuat, startScale);

    const endOrientation = targetOrientationMatrix.clone();
    const endQuat = new THREE.Quaternion();
    const endScale = new THREE.Vector3();
    endOrientation.decompose(new THREE.Vector3(), endQuat, endScale);

    // 3. Tweenアニメーションを設定
    const interpolator = { t: 0 };
    activeTween = new TWEEN.Tween(interpolator)
        .to({ t: 1 }, 500) // 0.5秒
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate(() => {
            q1.slerpQuaternions(startQuat, endQuat, interpolator.t);
            s1.lerpVectors(startScale, endScale, interpolator.t);
            displayOrientationMatrix.compose(new THREE.Vector3(0,0,0), q1, s1);
            displayPosition.copy(targetPosition); // 表示位置は常に最新の目標位置
            updatePreviewMeshMatrix(); // 表示メッシュ更新
        })
        .onComplete(() => {
            activeTween = null;
            displayOrientationMatrix.copy(targetOrientationMatrix);
            displayPosition.copy(targetPosition);
            updatePreviewMeshMatrix();
        })
        .onStop(() => { activeTween = null; })
        .start();
}

/** 反転はアニメーションなしで即時反映 */
export function flipPreview(axis) {
    if (!previewBlock || !previewBlock.visible) return;
    if (activeTween) {
        activeTween.stop();
        displayOrientationMatrix.copy(targetOrientationMatrix);
    }

    let sx = 1, sy = 1, sz = 1;
    if (axis === 'x') sx = -1; else if (axis === 'y') sy = -1; else if (axis === 'z') sz = -1;
    transformMatrix.makeScale(sx, sy, sz);
    targetOrientationMatrix.premultiply(transformMatrix);

    displayOrientationMatrix.copy(targetOrientationMatrix); // 表示姿勢も即時更新
    displayPosition.copy(targetPosition); // 表示位置も同期
    updatePreviewMeshMatrix(); // 表示メッシュ更新
}

/** 目標の姿勢行列を取得 */
export function getPreviewOrientationMatrix() {
    return previewBlock && previewBlock.visible ? targetOrientationMatrix.clone() : null;
}

/** 目標の位置を取得 */
export function getPreviewPosition() {
    return previewBlock && previewBlock.visible ? targetPosition.clone() : null;
}

/** プレビューの表示/非表示 */
export function setPreviewVisible(visible) {
    if (previewBlock) {
        if (!visible && activeTween) { activeTween.stop(); }
        previewBlock.visible = visible;
    }
}