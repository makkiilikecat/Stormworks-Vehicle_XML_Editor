import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import { blockGeometry, previewMaterial, snapToGrid } from '../models/BlockUtils.js';
import { BLOCK_SIZE_METERS } from '../app/Constants.js';

let camera, scene;
let previewBlock;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const intersectionPoint = new THREE.Vector3();
const normalVector = new THREE.Vector3();

// ★ 修正: 位置と姿勢を分離して管理
const targetPosition = new THREE.Vector3();         // 目標の設置位置 (ワールド座標)
const targetOrientationMatrix = new THREE.Matrix4(); // 目標の姿勢 (回転・スケール、位置(0,0,0))
const displayPosition = new THREE.Vector3();         // 表示中の位置 (アニメーション用)
const displayOrientationMatrix = new THREE.Matrix4(); // 表示中の姿勢 (アニメーション用)

let activeTween = null; // 回転アニメーション用Tween
const transformMatrix = new THREE.Matrix4(); // 回転・反転計算用
const translationMatrix = new THREE.Matrix4(); // 位置適用計算用
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const s1 = new THREE.Vector3();
const s2 = new THREE.Vector3();

export function initPreviewController(cam, scn) {
    camera = cam;
    scene = scn;
    previewBlock = new THREE.Mesh(blockGeometry, previewMaterial);
    previewBlock.visible = false;
    previewBlock.matrixAutoUpdate = false;
    scene.add(previewBlock);

    // ★ 修正: 状態変数を初期化
    targetPosition.set(0, 0, 0);
    targetOrientationMatrix.identity(); // 回転・スケールなし
    displayPosition.copy(targetPosition);
    displayOrientationMatrix.copy(targetOrientationMatrix);
}

export function updateMousePosition(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
}

export function updatePreviewBlock(placedBlocksData) {
    if (!camera || !previewBlock || !placedBlocksData) return;

    const targetMeshes = placedBlocksData.map(data => data.mesh).filter(mesh => !!mesh);
    if (targetMeshes.length === 0) {
        setPreviewVisible(false); return;
    }

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(targetMeshes, false);

    if (intersects.length > 0) {
        const intersection = intersects[0];
        intersectionPoint.copy(intersection.point);
        if (intersection.face && intersection.face.normal) {
            normalVector.copy(intersection.face.normal);
        } else {
            setPreviewVisible(false); return;
        }

        // ★ 修正: 目標位置の計算
        const calculatedPosition = new THREE.Vector3()
            .copy(intersectionPoint)
            .addScaledVector(normalVector, BLOCK_SIZE_METERS / 2);
        const snappedPosition = snapToGrid(calculatedPosition);

        // ★ 修正: targetPosition を更新
        targetPosition.copy(snappedPosition);

        const overlaps = placedBlocksData.some(blockData =>
            blockData.position.distanceToSquared(targetPosition) < 0.0001
        );

        if (overlaps) {
            setPreviewVisible(false);
        } else {
            // ★ 修正: アニメーション中でなければ表示位置も同期
            if (!activeTween) {
                displayPosition.copy(targetPosition);
                // ★ 修正: 表示行列を合成して適用
                updatePreviewMeshMatrix();
            } else {
                // アニメーション中は Tween が displayOrientationMatrix を更新し、
                // updatePreviewMeshMatrix 内で最新の targetPosition と合成される
            }
            previewBlock.visible = true;
        }
    } else {
        setPreviewVisible(false);
    }
}

/** ★ 追加: 表示位置と表示姿勢からプレビューメッシュのワールド行列を更新 */
function updatePreviewMeshMatrix() {
    if (!previewBlock) return;
    translationMatrix.makeTranslation(displayPosition.x, displayPosition.y, displayPosition.z);
    previewBlock.matrix.multiplyMatrices(translationMatrix, displayOrientationMatrix);
}


export function rotatePreview(axis, angle) {
    if (!previewBlock || !previewBlock.visible) return;
    if (activeTween) { activeTween.stop(); }

    // 1. 目標姿勢(targetOrientationMatrix)を計算
    transformMatrix.makeRotationAxis(axis, angle);
    targetOrientationMatrix.premultiply(transformMatrix); // ワールド基準回転

    // 2. アニメーション開始/終了時の姿勢を取得
    const startOrientation = displayOrientationMatrix.clone();
    const startQuat = new THREE.Quaternion();
    const startScale = new THREE.Vector3();
    startOrientation.decompose(new THREE.Vector3(), startQuat, startScale); // 位置は無視

    const endOrientation = targetOrientationMatrix.clone();
    const endQuat = new THREE.Quaternion();
    const endScale = new THREE.Vector3();
    endOrientation.decompose(new THREE.Vector3(), endQuat, endScale); // 位置は無視

    // 3. Tweenアニメーションを設定 (姿勢のみ補間)
    const interpolator = { t: 0 };
    activeTween = new TWEEN.Tween(interpolator)
        .to({ t: 1 }, 500)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate(() => {
            // 表示姿勢(displayOrientationMatrix)を補間
            q1.slerpQuaternions(startQuat, endQuat, interpolator.t);
            s1.lerpVectors(startScale, endScale, interpolator.t);
            // ★ 修正: displayOrientationMatrix を更新 (位置は 0,0,0 のまま)
            displayOrientationMatrix.compose(new THREE.Vector3(0,0,0), q1, s1);
            // ★ 修正: 表示位置は最新の targetPosition を使う
            displayPosition.copy(targetPosition);
            // ★ 修正: メッシュのワールド行列を更新
            updatePreviewMeshMatrix();
        })
        .onComplete(() => {
            activeTween = null;
            displayOrientationMatrix.copy(targetOrientationMatrix); // 最終状態に同期
            displayPosition.copy(targetPosition);
            updatePreviewMeshMatrix(); // 最終状態を適用
            console.log("Rotation tween complete.");
        })
        .onStop(() => {
             activeTween = null;
             // 中断した場合、displayOrientation は最後の onUpdate の状態
             // updatePreviewMeshMatrix(); // 必要なら呼ぶ
             console.log("Rotation tween stopped.");
        })
        .start();
}


export function flipPreview(axis) {
    if (!previewBlock || !previewBlock.visible) return;
    if (activeTween) {
        activeTween.stop();
        displayOrientationMatrix.copy(targetOrientationMatrix); // 停止前に同期
    }

    // 目標姿勢(targetOrientationMatrix)を計算
    let sx = 1, sy = 1, sz = 1;
    if (axis === 'x') sx = -1; else if (axis === 'y') sy = -1; else if (axis === 'z') sz = -1;
    transformMatrix.makeScale(sx, sy, sz);
    targetOrientationMatrix.premultiply(transformMatrix);

    // 表示姿勢(displayOrientationMatrix)も即時更新
    displayOrientationMatrix.copy(targetOrientationMatrix);
    // 表示位置も最新の目標位置に同期
    displayPosition.copy(targetPosition);
    // プレビューメッシュの行列を更新
    updatePreviewMeshMatrix();
}


/** ★ 修正: 目標の姿勢行列を取得 */
export function getPreviewOrientationMatrix() {
    return previewBlock && previewBlock.visible ? targetOrientationMatrix.clone() : null;
}

/** ★ 修正: 目標の位置を取得 */
export function getPreviewPosition() {
    return previewBlock && previewBlock.visible ? targetPosition.clone() : null;
}

export function setPreviewVisible(visible) {
    if (previewBlock) {
        if (!visible && activeTween) {
            activeTween.stop();
        }
        previewBlock.visible = visible;
    }
}