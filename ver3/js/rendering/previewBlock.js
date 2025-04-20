import * as THREE from 'three';

// プレビュー用マテリアル (半透明)
const previewMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff00, // 緑色など
    transparent: true,
    opacity: 0.5,
    depthWrite: false, // 他のオブジェクトの裏に隠れないように
});

// プレビュー用ジオメトリ (配置ブロックの種類に応じて変更できるように拡張可能)
const previewGeometry = new THREE.BoxGeometry(1, 1, 1);

let previewMesh = null; // プレビュー用メッシュのインスタンス

/**
 * プレビューブロックのメッシュを作成または取得します。
 * @param {THREE.Scene} scene - シーンオブジェクト。
 * @returns {THREE.Mesh} プレビューブロックのメッシュ。
 * @private
 */
function getOrCreatePreviewMesh(scene) {
    if (!previewMesh) {
        previewMesh = new THREE.Mesh(previewGeometry, previewMaterial);
        previewMesh.visible = false; // 最初は非表示
        scene.add(previewMesh);
        console.log("プレビューブロックを作成しました。");
    }
    return previewMesh;
}

/**
 * プレビューブロックを指定された位置と回転で表示します。
 * @param {THREE.Scene} scene - シーンオブジェクト。
 * @param {THREE.Vector3} position - 表示する位置 (Three.js座標系、整数座標)。
 * @param {THREE.Matrix4} orientationMatrix - 表示する向き (Matrix4)。
 */
export function showPreviewBlock(scene, position, orientationMatrix) {
    const mesh = getOrCreatePreviewMesh(scene);

    // Matrix4から位置・回転・スケールを設定
    // decompose は matrixAutoUpdate=true を仮定する場合があるため、
    // position, quaternion, scale を個別に設定する方が確実
    orientationMatrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    // 位置を引数のものに設定
    mesh.position.copy(position);
    mesh.matrixAutoUpdate = false; // 手動更新フラグ
    mesh.updateMatrix();           // ローカル行列を更新
    mesh.updateMatrixWorld(true);  // ワールド行列も強制更新

    mesh.visible = true; // 表示
}

/**
 * プレビューブロックを非表示にします。
 */
export function hidePreviewBlock() {
    if (previewMesh) {
        previewMesh.visible = false;
    }
}

/**
 * プレビューブロックの向きを更新します。
 * @param {THREE.Matrix4} orientationMatrix - 新しい向き (Matrix4)。
 */
export function updatePreviewOrientation(orientationMatrix) {
    if (previewMesh && previewMesh.visible) {
        const currentPos = previewMesh.position.clone(); // 現在の位置を保持
        // --- 修正点: decompose後に位置を戻し、行列を更新 ---
        orientationMatrix.decompose(previewMesh.position, previewMesh.quaternion, previewMesh.scale);
        previewMesh.position.copy(currentPos); // 位置を元に戻す
        previewMesh.matrixAutoUpdate = false;
        previewMesh.updateMatrix();           // ローカル行列を更新
        previewMesh.updateMatrixWorld(true);  // ワールド行列も強制更新
        // ---------------------------------------------
    }
}