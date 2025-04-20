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

export const STRETCH_SENSITIVITY = 10.0; // ストレッチ感度 (サンプルより)
export const SHEAR_SENSITIVITY = 4.0;   // せん断感度 (既存のものを流用・調整)
export const MIN_THICKNESS = 0.001;     // 最小許容厚み (サンプルより)
export const MIN_VOLUME_THRESHOLD = 1e-4; // 最小許容体積 (サンプルより)
export const GHOST_OPACITY = 0.4;       // ゴースト表示の不透明度 (サンプルより)