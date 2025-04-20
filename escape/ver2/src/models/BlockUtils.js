// src/models/BlockUtils.js
import * as THREE from 'three';
import { BLOCK_SIZE_METERS, GHOST_OPACITY } from '../app/Constants.js';

// --- ジオメトリ (共有) ---
export const blockGeometry = new THREE.BoxGeometry(
    BLOCK_SIZE_METERS, BLOCK_SIZE_METERS, BLOCK_SIZE_METERS
);

// --- マテリアル定義 ---
const createMaterial = (color, opacity = 1, wireframe = false) => {
    // clone() 時に共有されないプロパティはここで設定
    const mat = new THREE.MeshStandardMaterial({
        color: color, metalness: 0.3, roughness: 0.6,
        opacity: opacity, transparent: opacity < 1,
        side: THREE.DoubleSide, wireframe: wireframe,
        polygonOffset: wireframe, // Optional: ワイヤーフレームが面と重ならないように
        polygonOffsetFactor: wireframe ? 1 : 0,
        polygonOffsetUnits: wireframe ? 1 : 0
    });
    return mat;
};

export const normalMaterial = createMaterial(0xffa500); // 通常
export const previewMaterial = createMaterial(0xffcc66, 0.6); // プレビュー
export const selectedMaterial = createMaterial(0x00ff00); // ★選択中 (緑)
export const faceHighlightMaterial = createMaterial(0xffff00, 0.7); // 面ハイライト時

// --- ヘルパー関数 ---
/**
 * ★ 新規: ゴースト表示用のマテリアル配列を作成します。
 * @param {Array<THREE.Material> | THREE.Material} baseMaterial - 複製元のマテリアル(配列または単体)
 * @returns {Array<THREE.Material>} ゴースト用マテリアルの配列
 */
export function createGhostMaterials(baseMaterial) {
    const ghostMaterials = [];
    const materials = Array.isArray(baseMaterial) ? baseMaterial : [baseMaterial];
    for (let i = 0; i < 6; i++) {
        // BoxGeometryは6つのマテリアルインデックスを持つ想定
        const originalMat = materials[i % materials.length]; // 元マテリアルを循環参照
        const ghostMat = originalMat.clone();
        ghostMat.opacity = GHOST_OPACITY;
        ghostMat.transparent = true;
        ghostMat.depthWrite = false; // 半透明オブジェクトの描画順問題を緩和
        ghostMat.needsUpdate = true;
        ghostMaterials.push(ghostMat);
    }
    return ghostMaterials;
}

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