import * as THREE from 'three';
import { blockGeometry, normalBlockMaterial, DEFAULT_BLOCK_TYPE, BLOCK_SIZE_METERS } from './blockUtils.js'; // BLOCK_SIZE_METERS をインポート

let scene;
let placedBlocksData = [];
const translationMatrix = new THREE.Matrix4(); // ヘルパー

export function initPlacementController(scn, blocksDataArray) {
    scene = scn;
    placedBlocksData = blocksDataArray;
}

/**
 * ★ 修正: 指定された位置と姿勢(回転・スケール)で新しいブロックを配置します。
 * @param {THREE.Vector3} position - 配置するブロックの中心のワールド座標
 * @param {THREE.Matrix4} orientationMatrix - 配置するブロックの姿勢(回転・スケール、位置は(0,0,0)想定)
 */
export function placeBlock(position, orientationMatrix) {
    if (!scene || !position || !orientationMatrix) return;

    console.log('Attempting to place block at:', position);

    const newGeometry = blockGeometry.clone();
    const newMaterial = normalBlockMaterial.clone();
    newMaterial.side = THREE.DoubleSide;

    const newBlockMesh = new THREE.Mesh(newGeometry, newMaterial);

    // ★ 修正: ワールド行列を位置と姿勢から合成
    translationMatrix.makeTranslation(position.x, position.y, position.z);
    newBlockMesh.matrix.multiplyMatrices(translationMatrix, orientationMatrix);
    newBlockMesh.matrixAutoUpdate = false;

    newBlockMesh.userData.blockId = THREE.MathUtils.generateUUID();
    scene.add(newBlockMesh);

    // ★ 修正: データ構造を変更 (XMLエクスポートを意識)
    const newBlockData = {
        id: newBlockMesh.userData.blockId,
        type: DEFAULT_BLOCK_TYPE,
        // ワールド座標 position をボクセル座標 vp に変換して保持するのが理想だが、
        // ここでは一旦ワールド座標 position と orientationMatrix をそのまま保持する
        // ※ XML保存時に変換が必要
        position: position.clone(),            // ワールド座標の中心位置
        orientation: orientationMatrix.clone(), // 回転・スケール行列
        mesh: newBlockMesh
    };
    placedBlocksData.push(newBlockData);

    console.log('Block placed. Total blocks:', placedBlocksData.length);
}