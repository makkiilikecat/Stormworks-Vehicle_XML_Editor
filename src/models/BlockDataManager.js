// src/models/BlockDataManager.js
import * as THREE from 'three';
import { DEFAULT_BLOCK_TYPE, BLOCK_SIZE_METERS } from '../app/Constants.js';
import { blockGeometry, normalMaterial } from './BlockUtils.js';
import { composeWorldMatrix } from './MatrixUtils.js'; // 行列合成ヘルパー

let scene;
const placedBlocks = []; // データ {id, type, position, orientation}
const blockMeshes = new Map(); // IDとMeshのマップ <id, mesh>

// --- イベントエミッター ---
const listeners = {
    blockAdded: [],
    blockRemoved: [],
    blockUpdated: [],
};
function emit(eventName, data) {
    if (listeners[eventName]) {
        listeners[eventName].forEach(listener => listener(data));
    }
}
export function addEventListener(eventName, listener) {
    if (listeners[eventName]) {
        listeners[eventName].push(listener);
    }
}
// ----------------------

export function initBlockDataManager(scn) {
    if (!scn) throw new Error("Scene must be provided for BlockDataManager");
    scene = scn;
    // 必要なら localStorage から初期データを読み込む処理を追加
}

/**
 * 新しいブロックを追加します。
 * @param {object} blockInfo - { position, orientation, type? }
 */
export function addBlock(blockInfo) {
    const { position, orientation, type = DEFAULT_BLOCK_TYPE } = blockInfo;
    if (!position || !orientation) {
        console.error("Position and orientation are required to add a block.");
        return null;
    }

    const id = THREE.MathUtils.generateUUID();
    const newBlockData = {
        id: id,
        type: type,
        position: position.clone(),
        orientation: orientation.clone(),
    };
    placedBlocks.push(newBlockData);

    // メッシュを作成してシーンに追加
    const mesh = createMeshForBlock(newBlockData);
    blockMeshes.set(id, mesh);
    scene.add(mesh);

    console.log(`Block added: ${id}. Total: ${placedBlocks.length}`);
    emit('blockAdded', { ...newBlockData }); // イベント発行 (データのコピーを渡す)
    return newBlockData.id;
}

/**
 * 指定されたIDのブロックを削除します。
 * @param {string} blockId
 */
export function removeBlock(blockId) {
    const index = placedBlocks.findIndex(b => b.id === blockId);
    if (index === -1) return false; // 見つからない

    const [removedData] = placedBlocks.splice(index, 1);
    const mesh = blockMeshes.get(blockId);

    if (mesh) {
        scene.remove(mesh);
        disposeMeshResources(mesh); // リソース解放
        blockMeshes.delete(blockId);
        console.log(`Block removed: ${blockId}. Total: ${placedBlocks.length}`);
        emit('blockRemoved', { id: blockId }); // イベント発行
        return true;
    }
    return false;
}

/**
 * 指定されたIDのブロックのTransformを更新します。
 * @param {string} blockId
 * @param {THREE.Vector3} newPosition
 * @param {THREE.Matrix4} newOrientation
 */
export function updateBlockTransform(blockId, newPosition, newOrientation) {
    const blockData = getBlockById(blockId);
    if (!blockData) return false;

    blockData.position.copy(newPosition);
    blockData.orientation.copy(newOrientation);

    emit('blockUpdated', { id: blockId, position: newPosition, orientation: newOrientation }); // イベント発行
    return true;
}


// --- データ取得系 ---
export function getBlockById(blockId) {
    return placedBlocks.find(b => b.id === blockId);
}
export function getAllBlocks() {
    return [...placedBlocks]; // 配列のコピーを返す
}
export function getAllMeshes() {
    return Array.from(blockMeshes.values());
}
export function getMeshById(blockId) {
    return blockMeshes.get(blockId);
}

// --- 内部ヘルパー ---
function createMeshForBlock(blockData) {
    const geometry = blockGeometry.clone(); // 固有のジオメトリ
    const material = normalMaterial.clone(); // 固有のマテリアル (色変更のため)
    material.side = THREE.DoubleSide;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.blockId = blockData.id; // IDをメッシュにも保持
    mesh.matrixAutoUpdate = false;
    // ワールド行列を設定
    composeWorldMatrix(blockData.position, blockData.orientation, mesh.matrix);

    return mesh;
}

function disposeMeshResources(mesh) {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
        } else {
            mesh.material.dispose();
        }
    }
    console.log(`Resources disposed for mesh: ${mesh.userData.blockId}`);
}