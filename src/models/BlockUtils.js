// src/models/BlockUtils.js
import * as THREE from 'three';
import { BLOCK_SIZE_METERS } from '../app/Constants.js';

// --- ジオメトリ (共有) ---
export const blockGeometry = new THREE.BoxGeometry(
    BLOCK_SIZE_METERS, BLOCK_SIZE_METERS, BLOCK_SIZE_METERS
);

// --- マテリアル定義 ---
const createMaterial = (color, opacity = 1) => {
    return new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.3,
        roughness: 0.6,
        opacity: opacity,
        transparent: opacity < 1,
        side: THREE.DoubleSide // 反転対応
    });
};

export const normalMaterial = createMaterial(0xffa500); // 通常
export const previewMaterial = createMaterial(0xffcc66, 0.6); // プレビュー
export const selectedMaterial = createMaterial(0x00ff00); // ★選択中 (緑)

// --- ヘルパー関数 ---
/**
 * ワールド座標をブロックの中心がグリッド交点に来るようにスナップします。
 * @param {THREE.Vector3} worldPosition - スナップするワールド座標 (ブロックの中心座標想定)
 * @returns {THREE.Vector3} スナップされたワールド座標 (ブロックの中心座標)
 */
export function snapToGrid(worldPosition) {
    const snapped = worldPosition.clone();
    // 各軸の値を BLOCK_SIZE_METERS の最も近い倍数に丸める
    snapped.x = Math.round(snapped.x / BLOCK_SIZE_METERS) * BLOCK_SIZE_METERS;
    snapped.y = Math.round(snapped.y / BLOCK_SIZE_METERS) * BLOCK_SIZE_METERS;
    snapped.z = Math.round(snapped.z / BLOCK_SIZE_METERS) * BLOCK_SIZE_METERS;
    // 念のため -0 を 0 に変換
    if (Object.is(snapped.x, -0)) snapped.x = 0;
    if (Object.is(snapped.y, -0)) snapped.y = 0;
    if (Object.is(snapped.z, -0)) snapped.z = 0;
    return snapped;
}