import * as THREE from 'three';

// --- 状態変数 ---
// 元のマテリアル情報を保持するMap (キー: block.id, 値: クローンした元のマテリアル)
const originalMaterials = new Map();

// --- 設定 ---
const highlightColor = new THREE.Color(0xffff00); // ハイライト色 (黄色)
const highlightEmissiveIntensity = 0.5; // 発光強度

/**
 * 指定されたBlockDataのメッシュをハイライトします。
 * @param {BlockData} blockData - ハイライトするブロックのデータ。
 */
export function highlightMesh(blockData) {
    if (!blockData?.mesh?.material || Array.isArray(blockData.mesh.material)) return;
    const mesh = blockData.mesh;
    if (originalMaterials.has(blockData.id)) return;

    originalMaterials.set(blockData.id, mesh.material.clone());
    mesh.material.emissive.set(highlightColor);
    mesh.material.emissiveIntensity = highlightEmissiveIntensity;
}

/**
 * 指定されたBlockDataのメッシュのハイライトを解除します。
 * @param {BlockData} blockData - ハイライト解除するブロックのデータ。
 */
export function unhighlightMesh(blockData) {
    if (!blockData?.mesh?.material || Array.isArray(blockData.mesh.material)) return;
    if (!originalMaterials.has(blockData.id)) return;

    const mesh = blockData.mesh;
    const originalMat = originalMaterials.get(blockData.id);
    mesh.material.emissive.copy(originalMat.emissive);
    mesh.material.emissiveIntensity = originalMat.emissiveIntensity || 0;
    originalMaterials.delete(blockData.id);
    originalMat.dispose();
}

/**
 * 全てのハイライトを解除します。
 * @param {BlockData[]} currentlySelectedBlocks - 現在選択中のブロック配列。
 */
export function clearAllHighlights(currentlySelectedBlocks) {
     console.log("Clearing all highlights.");
     currentlySelectedBlocks.forEach(blockData => {
         unhighlightMesh(blockData); // Mapから削除も行われる
     });
     // 念のためMapをクリア（選択リストと同期が取れていれば不要なはず）
     if (originalMaterials.size > 0) {
         console.warn("Highlight Map was not empty after clearing selected blocks.");
         originalMaterials.forEach(mat => mat.dispose()); // 残っているマテリアルも破棄
         originalMaterials.clear();
     }
}

/**
 * 指定されたブロックが現在ハイライトされているか確認します。
 * @param {BlockData} blockData
 * @returns {boolean}
 */
export function isHighlighted(blockData) {
    return originalMaterials.has(blockData?.id);
}