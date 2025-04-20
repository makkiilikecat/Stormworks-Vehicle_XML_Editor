import * as THREE from 'three'; // Matrix4を使うため

// デフォルトで配置するブロックの種類ID
let currentPlacementBlockId = '01_block';
let currentPlacementBlockName = '基本ブロック';

// --- Stage 2.4 追加: プレビューブロックの向き ---
// 初期状態は単位行列 (回転・反転なし)
let previewOrientationMatrix = new THREE.Matrix4();
// ------------------------------------------

/**
 * 現在配置対象として選択されているブロックの種類IDを取得します。
 * @returns {string} ブロック定義ID。
 */
export function getCurrentPlacementBlockId() { return currentPlacementBlockId; }

/**
 * 現在配置対象として選択されているブロック名を取得します。
 * @returns {string} ブロック名。
 */
export function getCurrentPlacementBlockName() { return currentPlacementBlockName; }

/**
 * 配置対象のブロック種類を設定します。
 * 種類が変わったら向きもリセットする。
 * @param {string} blockId - 設定するブロック定義ID。
 * @param {string} blockName - 設定するブロック名。
 */
export function setPlacementBlock(blockId, blockName) {
    console.log(`配置ブロック変更: ${blockName} (${blockId})`);
    currentPlacementBlockId = blockId;
    currentPlacementBlockName = blockName;
    resetPreviewOrientation(); // ブロック種類が変わったら向きをリセット
    // UI更新イベント発行など
}

// --- Stage 2.4 追加 ---
/**
 * プレビューブロックの現在の向き（回転行列）を取得します。
 * @returns {THREE.Matrix4} 向きを表すMatrix4。
 */
export function getPreviewOrientation() {
    return previewOrientationMatrix;
}

/**
 * プレビューブロックの向き（回転行列）を更新します。
 * @param {THREE.Matrix4} newMatrix - 新しい向きを表すMatrix4。
 */
export function setPreviewOrientation(newMatrix) {
    previewOrientationMatrix.copy(newMatrix);
    // TODO: 向き変更イベントを発行してプレビュー更新をトリガー
    // document.dispatchEvent(new CustomEvent('previeworientationchange'));
}

/**
 * プレビューブロックの向きを初期状態（単位行列）に戻します。
 */
export function resetPreviewOrientation() {
    previewOrientationMatrix.identity();
     // TODO: 向き変更イベントを発行してプレビュー更新をトリガー
}
// --------------------