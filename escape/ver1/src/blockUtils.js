import * as THREE from 'three';

// --- 定数 ---
export const BLOCK_SIZE_METERS = 0.25;
export const DEFAULT_BLOCK_TYPE = '01_block_weight';
export const ANGLE_90_DEG = Math.PI / 2;

// --- ジオメトリ (共有) ---
export const blockGeometry = new THREE.BoxGeometry(
    BLOCK_SIZE_METERS,
    BLOCK_SIZE_METERS,
    BLOCK_SIZE_METERS
);

// --- マテリアル (共有) ---
export const normalBlockMaterial = new THREE.MeshStandardMaterial({
    color: 0xffa500,
    metalness: 0.3,
    roughness: 0.6,
});
export const previewBlockMaterial = new THREE.MeshStandardMaterial({
    color: 0xffcc66,
    metalness: 0.2,
    roughness: 0.7,
    opacity: 0.6,
    transparent: true,
});

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