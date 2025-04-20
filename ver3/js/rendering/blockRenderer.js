import * as THREE from 'three';

// 共有する基本マテリアルを定義 (これをクローンして使う)
const baseBlockMaterial = new THREE.MeshStandardMaterial({
    color: 0x999999, // デフォルトのブロック色 (灰色)
    roughness: 0.7,
    metalness: 0.2,
    emissive: 0x000000, // デフォルトの発光色は黒 (非発光)
    emissiveIntensity: 0 // デフォルトの発光強度
});

// 共有するジオメトリ
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);

/**
 * シーンに現在表示されている全ての *データブロックに関連付けられた* メッシュを削除します。
 * メッシュに 'isBlockMesh' というユーザーデータを付与して識別します。
 * @param {THREE.Scene} scene - 操作対象のシーン。
 */
export function clearBlocks(scene) {
    const objectsToRemove = [];
    // シーングラフを探索し、削除対象のメッシュを探す
    scene.traverse((object) => {
        // userData を使ってブロックメッシュかどうかを判断
        if (object.isMesh && object.userData.isBlockMesh) {
            objectsToRemove.push(object);
        }
    });

    console.log(`Clearing ${objectsToRemove.length} block meshes from scene.`);
    objectsToRemove.forEach(mesh => {
        // シーンから削除
        scene.remove(mesh);
        // マテリアルは個別のインスタンスなので dispose する
        if (!Array.isArray(mesh.material)) {
            mesh.material.dispose();
        } else {
            // 配列の場合も考慮 (通常はないはず)
            mesh.material.forEach(m => m.dispose());
        }
        // ジオメトリは共有なので dispose しない
    });
}

/**
 * BlockDataの配列に基づいて、3Dブロックメッシュを作成または更新しシーンに追加します。
 * 既存のメッシュがあればそれを更新し、なければ新規作成します。
 * マテリアルのハイライト状態（emissive）もリセットします。
 * @param {THREE.Scene} scene - メッシュを追加/更新するシーン。
 * @param {BlockData[]} blockDataArray - 表示するブロックデータの配列。
 */
export function renderBlocks(scene, blockDataArray) {
    console.log(`Rendering/Updating ${blockDataArray.length} blocks...`);
    let addedCount = 0;
    let updatedCount = 0;

    blockDataArray.forEach(blockData => {
        let mesh = blockData.mesh; // 既存のメッシュ参照を取得
        let materialInstance; // マテリアル参照用

        // メッシュが存在しないか、シーンに存在しない場合は新規作成
        if (!mesh || !scene.getObjectById(mesh.id)) {
            materialInstance = baseBlockMaterial.clone(); // クローンして新しいインスタンス作成
            mesh = new THREE.Mesh(blockGeometry, materialInstance);
            // ユーザーデータを追加して識別しやすくする
            mesh.userData.isBlockMesh = true;
            mesh.userData.blockId = blockData.id; // BlockDataのIDを紐付け
            scene.add(mesh); // シーンに追加
            blockData.mesh = mesh; // 新しいメッシュ参照を保存
            addedCount++;
        } else {
            // 既存メッシュが見つかった場合はそれを更新
            materialInstance = mesh.material; // 既存のマテリアル参照
            updatedCount++;
        }

        // マテリアルのハイライト状態をリセット
        // (renderBlocksはアンドゥ/リドゥ後など、状態が不確かな時に呼ばれる可能性があるため)
        if (!Array.isArray(materialInstance)) {
             materialInstance.emissive.setHex(baseBlockMaterial.emissive.getHex());
             materialInstance.emissiveIntensity = baseBlockMaterial.emissiveIntensity || 0;
        } else {
            // 配列の場合は全ての要素をリセット (通常はないはず)
            materialInstance.forEach(m => {
                m.emissive.setHex(baseBlockMaterial.emissive.getHex());
                m.emissiveIntensity = baseBlockMaterial.emissiveIntensity || 0;
            });
        }

        // 位置と向きを設定 (BlockDataのThree.js座標系データを使用)
        mesh.position.copy(blockData.position);
        mesh.matrix.copy(blockData.rotationMatrix);
        mesh.matrix.setPosition(blockData.position); // 行列に位置を適用
        mesh.matrixAutoUpdate = false; // Three.jsによる自動更新を無効化
        mesh.matrixWorldNeedsUpdate = true; // ワールド行列の更新を強制

        // TODO: Stage 4.1 で blockData.colorIndices に基づいて
        // materialInstance.color などを設定する
    });

    console.log(`${addedCount} block meshes added, ${updatedCount} updated.`);
}