// src/app/Constants.js
import * as THREE from 'three';

/** ブロック1辺の長さ (メートル) */
export const BLOCK_SIZE_METERS = 0.25;

/** グリッド全体のサイズ (メートル) */
export const GRID_SIZE = 20;

/** デフォルトのブロックタイプID */
export const DEFAULT_BLOCK_TYPE = '01_block_weight';

/** 回転角度 (90度) */
export const ROTATION_ANGLE = Math.PI / 2;

/** X軸ベクトル */
export const X_AXIS = Object.freeze(new THREE.Vector3(1, 0, 0));
/** Y軸ベクトル */
export const Y_AXIS = Object.freeze(new THREE.Vector3(0, 1, 0));
/** Z軸ベクトル */
export const Z_AXIS = Object.freeze(new THREE.Vector3(0, 0, 1));

// 必要に応じて他の定数を追加