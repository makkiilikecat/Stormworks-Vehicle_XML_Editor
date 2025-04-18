// src/controllers/BlockTransformController.js
import * as THREE from 'three';
import { getSelectedBlockId, isXmlEditModeActive } from '../app/AppState.js';
import { X_AXIS, Y_AXIS, Z_AXIS, ROTATION_ANGLE } from '../app/Constants.js';

let placedBlocksData = []; // データ配列への参照
const rotationMatrix = new THREE.Matrix4();
const translationMatrix = new THREE.Matrix4();

export function initBlockTransformController(blocksData) {
    placedBlocksData = blocksData;
}

// JKLキーに対応する回転処理
export function handleRotationInput(keyCode) {
    if (!isXmlEditModeActive()) return false; // XML編集モードでのみ有効
    const selectedId = getSelectedBlockId();
    if (!selectedId) return false; // ブロックが選択されていないと無効

    const blockData = placedBlocksData.find(d => d.id === selectedId);
    if (!blockData) return false;

    let axis = null;
    let angle = 0;

    switch (keyCode) {
        case 'KeyJ': axis = X_AXIS; angle = -ROTATION_ANGLE; break; // Pitch
        case 'KeyK': axis = Y_AXIS; angle = ROTATION_ANGLE; break;  // Yaw
        case 'KeyL': axis = Z_AXIS; angle = ROTATION_ANGLE; break;  // Roll
        default: return false; // JKL以外は無視
    }

    console.log(`Rotating block ${selectedId} around ${keyCode}`);
    rotateBlock(blockData, axis, angle);
    return true; // 回転が実行された
}

// 選択されたブロックの姿勢を更新する
function rotateBlock(blockData, axis, angle) {
    // 回転行列を作成
    rotationMatrix.makeRotationAxis(axis, angle);
    // 現在の姿勢に左から乗算 (ワールド基準回転)
    blockData.orientation.premultiply(rotationMatrix);
    // メッシュのワールド行列も更新
    updateMeshMatrix(blockData);
}

// ブロックデータに基づいてメッシュのワールド行列を更新
function updateMeshMatrix(blockData) {
    if (blockData && blockData.mesh) {
        translationMatrix.makeTranslation(blockData.position.x, blockData.position.y, blockData.position.z);
        blockData.mesh.matrix.multiplyMatrices(translationMatrix, blockData.orientation);
        // matrixAutoUpdate は false のはず
    }
}