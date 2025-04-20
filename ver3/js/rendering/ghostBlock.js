import * as THREE from 'three';

// ゴースト用マテリアル (半透明、色や不透明度は調整可能)
const ghostMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ffff, // シアンなど
    transparent: true,
    opacity: 0.4,
    depthWrite: false, // 他のオブジェクトに隠れないように
    side: THREE.DoubleSide, // 裏面も見えるように (任意)
});

// ゴースト用ジオメトリ (Box固定)
const ghostGeometry = new THREE.BoxGeometry(1, 1, 1);

let ghostMesh = null; // ゴーストメッシュのインスタンス

/**
 * ゴーストブロックのメッシュを取得または作成します。
 * @param {THREE.Scene} scene - シーンオブジェクト。
 * @returns {THREE.Mesh} ゴーストブロックのメッシュ。
 * @private
 */
function getOrCreateGhostMesh(scene) {
    if (!ghostMesh) {
        ghostMesh = new THREE.Mesh(ghostGeometry, ghostMaterial);
        ghostMesh.matrixAutoUpdate = false; // 行列を手動管理
        ghostMesh.visible = false;        // 最初は非表示
        scene.add(ghostMesh);
        console.log("Ghost block created.");
    }
    return ghostMesh;
}

/**
 * ゴーストブロックを指定された行列で表示します。
 * 位置は行列に含まれるものを使用します。
 * @param {THREE.Scene} scene - シーンオブジェクト。
 * @param {THREE.Matrix4} matrix - 表示する行列 (位置・回転・スケールを含む)。
 */
export function showGhostBlock(scene, matrix) {
    const mesh = getOrCreateGhostMesh(scene);
    mesh.matrix.copy(matrix);
    mesh.updateMatrixWorld(true); // ワールド行列を更新
    mesh.visible = true;
}

/**
 * ゴーストブロックのトランスフォーム（行列）を更新します。
 * @param {THREE.Matrix4} matrix - 新しい行列。
 */
export function updateGhostBlockTransform(matrix) {
    if (ghostMesh && ghostMesh.visible) {
        ghostMesh.matrix.copy(matrix);
        ghostMesh.updateMatrixWorld(true);
    }
}

/**
 * ゴーストブロックを非表示にします。
 */
export function hideGhostBlock() {
    if (ghostMesh) {
        ghostMesh.visible = false;
    }
}