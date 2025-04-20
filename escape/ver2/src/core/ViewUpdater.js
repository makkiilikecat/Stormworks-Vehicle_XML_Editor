// src/core/ViewUpdater.js
import { addEventListener as addDataListener, getMeshById } from '../models/BlockDataManager.js';
import { composeWorldMatrix } from '../models/MatrixUtils.js';

export function initViewUpdater() {
    addDataListener('blockUpdated', handleBlockUpdate);
    // blockAdded, blockRemoved は DataManager がメッシュ操作するので不要
    console.log("ViewUpdater initialized and listening for data changes.");
}

function handleBlockUpdate(updatedData) {
    const { id, position, orientation } = updatedData;
    console.log(`ViewUpdater received update for block: ${id}`);
    const mesh = getMeshById(id);
    if (mesh) {
        // メッシュのワールド行列を更新
        composeWorldMatrix(position, orientation, mesh.matrix);
        console.log(`Mesh matrix updated for block: ${id}`);
    } else {
        console.warn(`Mesh not found for updated block: ${id}`);
    }
}