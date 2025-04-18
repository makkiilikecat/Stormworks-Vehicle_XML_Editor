import * as THREE from 'three';

let scene;
let placedBlocksData = []; // main.js の配列への参照

/**
 * 削除コントローラーを初期化します。
 * @param {THREE.Scene} scn
 * @param {Array} blocksDataArray - ブロックデータを格納する配列への参照
 */
export function initDeletionController(scn, blocksDataArray) {
    scene = scn;
    placedBlocksData = blocksDataArray;
}

/**
 * 指定されたメッシュオブジェクトに対応するブロックを削除します。
 * @param {THREE.Mesh} intersectedMesh - Raycastで検出された削除対象のメッシュ
 */
export function deleteBlock(intersectedMesh) {
    if (!scene || !intersectedMesh || !intersectedMesh.userData.blockId) {
        console.warn("Deletion target is invalid:", intersectedMesh);
        return;
    }

    const blockIdToDelete = intersectedMesh.userData.blockId;
    console.log("Attempting to delete block with ID:", blockIdToDelete);

    // placedBlocksData 配列から該当するブロックデータを検索
    const indexToDelete = placedBlocksData.findIndex(data => data.id === blockIdToDelete);

    if (indexToDelete !== -1) {
        // データ配列から削除
        const [deletedData] = placedBlocksData.splice(indexToDelete, 1);
        console.log("Block data removed from array.");

        // シーンからメッシュを削除
        scene.remove(deletedData.mesh);
        console.log("Mesh removed from scene.");

        // ★ ジオメトリとマテリアルのメモリを解放
        if (deletedData.mesh.geometry) {
            deletedData.mesh.geometry.dispose();
            console.log("Geometry disposed.");
        }
        if (deletedData.mesh.material) {
            // マテリアルが配列の場合も考慮 (MultiMaterialなど)
            if (Array.isArray(deletedData.mesh.material)) {
                deletedData.mesh.material.forEach(material => material.dispose());
            } else {
                deletedData.mesh.material.dispose();
            }
            console.log("Material disposed.");
        }

        console.log('Block deleted successfully. Total blocks:', placedBlocksData.length);

    } else {
        console.error("Could not find block data to delete for mesh:", intersectedMesh);
        // シーンにメッシュが存在するのにデータがない場合、強制的にシーンから削除することも検討
        // scene.remove(intersectedMesh);
    }
}