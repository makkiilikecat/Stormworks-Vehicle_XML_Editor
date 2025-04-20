import * as THREE from 'three';

// パフォーマンス向上のため、ジオメトリとマテリアルは共有する
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const blockMaterial = new THREE.MeshStandardMaterial({
    color: 0x999999, // デフォルトのブロック色 (灰色)
    roughness: 0.7,
    metalness: 0.2,
    // vertexColors: true // Stage 4.1 (ペイント) で使う可能性あり
});

// 現在シーンに追加されているブロックメッシュの管理用 (クリア処理用)
let currentBlockMeshes = [];

/**
 * シーンに現在表示されている全てのブロックメッシュを削除します。
 * 原点ブロックは削除しません（必要であれば別途削除）。
 * @param {THREE.Scene} scene - 操作対象のシーン。
 */
export function clearBlocks(scene) {
    console.log(`Clearing ${currentBlockMeshes.length} block meshes from scene.`);
    currentBlockMeshes.forEach(mesh => {
        // メッシュをシーンから削除
        scene.remove(mesh);
        // ジオメトリとマテリアルは共有しているので dispose しない
        // mesh.geometry.dispose();
        // mesh.material.dispose(); // 共有マテリアルなので個別にdisposeしない
    });
    // 管理用配列を空にする
    currentBlockMeshes = [];
}

/**
 * BlockDataの配列に基づいて、3Dブロックメッシュを作成しシーンに追加します。
 * @param {THREE.Scene} scene - メッシュを追加するシーン。
 * @param {BlockData[]} blockDataArray - 表示するブロックデータの配列。
 */
export function renderBlocks(scene, blockDataArray) {
    console.log(`Rendering ${blockDataArray.length} blocks...`);
    const newMeshes = []; // この関数で新たに追加するメッシュを一時保存

    blockDataArray.forEach(blockData => {
        // TODO: Stage 2以降で、ブロック種類(blockData.definitionId)に応じて
        // ジオメトリやマテリアルを切り替える処理を追加する

        // メッシュを作成 (共有ジオメトリとマテリアルを使用)
        const mesh = new THREE.Mesh(blockGeometry, blockMaterial);

        // --- 位置と回転/スケールを行列で設定 ---
        // 1. 位置を設定 (BlockDataのpositionは整数座標)
        mesh.position.copy(blockData.position);
        // 2. 回転/スケール行列を適用 (BlockDataのrotationMatrix)
        mesh.matrix.copy(blockData.rotationMatrix);
        // 3. positionを行列に適用 (matrix * translate)
        mesh.matrix.setPosition(blockData.position);
        // 4. Three.jsに手動で行列を更新することを伝える
        mesh.matrixAutoUpdate = false;
        mesh.matrixWorldNeedsUpdate = true; // ワールド行列の更新も強制する

        // TODO: Stage 4.1 (ペイント) で、ブロックの色をマテリアルに反映させる
        // 例: vertex color や個別のマテリアルインスタンスを使うなど

        // 作成したメッシュをシーンに追加
        scene.add(mesh);
        // BlockDataにメッシュへの参照を保持させる (選択処理などで使用)
        blockData.mesh = mesh;
        // 管理用配列にも追加
        newMeshes.push(mesh);
    });

    // 新しく追加したメッシュを管理用配列に設定
    currentBlockMeshes = newMeshes;
    console.log(`${currentBlockMeshes.length} block meshes added to scene.`);
}