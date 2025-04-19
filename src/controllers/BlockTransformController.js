// src/controllers/BlockTransformController.js
import * as THREE from 'three';
import { getSelectedBlockId, isXmlEditModeActive } from '../app/AppState.js';
import { X_AXIS, Y_AXIS, Z_AXIS, ROTATION_ANGLE } from '../app/Constants.js';
import { getBlockById, updateBlockTransform } from '../models/BlockDataManager.js'; // DataManager利用

const rotationMatrix = new THREE.Matrix4(); // 計算用

/**
 * BlockTransformControllerを初期化します。
 */
export function initBlockTransformController() {
    // 特に初期化処理は不要だが、将来的な拡張のために用意
    console.log("BlockTransformController initialized.");
}

/**
 * JKLキー入力に基づいて、選択中のブロックを回転させます。
 * @param {string} keyCode - 押されたキーのコード ('KeyJ', 'KeyK', 'KeyL')
 * @returns {boolean} 回転が実行されたかどうか
 */
export function handleRotationInput(keyCode) {
    if (!isXmlEditModeActive()) return false; // XML編集モードでのみ有効
    const selectedId = getSelectedBlockId();
    if (!selectedId) return false; // ブロック未選択

    const blockData = getBlockById(selectedId); // DataManagerからデータ取得
    if (!blockData) return false;

    let axis = null;
    let angle = 0;

    switch (keyCode) {
        case 'KeyJ': axis = X_AXIS; angle = -ROTATION_ANGLE; break; // Pitch
        case 'KeyK': axis = Y_AXIS; angle = ROTATION_ANGLE; break;  // Yaw
        case 'KeyL': axis = Z_AXIS; angle = ROTATION_ANGLE; break;  // Roll
        default: return false;
    }

    console.log(`Rotating block ${selectedId} around ${keyCode}`);

    // 新しい姿勢を計算
    const newOrientation = blockData.orientation.clone(); // 現在の姿勢をコピー
    rotationMatrix.makeRotationAxis(axis, angle);
    newOrientation.premultiply(rotationMatrix); // ワールド基準で回転

    // ★ DataManager に更新を依頼 (ViewUpdaterがメッシュ更新を担当)
    updateBlockTransform(selectedId, blockData.position, newOrientation);

    return true; // 回転実行
}

// メッシュ更新は ViewUpdater が行うため、このコントローラーでは不要になった
// function updateMeshMatrix(blockData) { /* ... */ }