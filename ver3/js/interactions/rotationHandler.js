import * as THREE from 'three';

// --- 定数 ---
const DEG90 = Math.PI / 2; // 90度をラジアンで

// --- 回転行列の事前計算 (ローカル座標での回転) ---
// J: ピッチ (X軸周り -90度)
const rotJMatrix = new THREE.Matrix4().makeRotationX(-DEG90);
// K: ヨー (Y軸周り -90度)
const rotKMatrix = new THREE.Matrix4().makeRotationY(-DEG90);
// L: ロール (Z軸周り -90度)
const rotLMatrix = new THREE.Matrix4().makeRotationZ(-DEG90);

// --- 反転行列の事前計算 (ローカル座標でのスケーリング) ---
// U: 左右反転 (X軸)
const flipUMatrix = new THREE.Matrix4().makeScale(-1, 1, 1);
// I: 上下反転 (Y軸)
const flipIMatrix = new THREE.Matrix4().makeScale(1, -1, 1);
// O: 前後反転 (Z軸)
const flipOMatrix = new THREE.Matrix4().makeScale(1, 1, -1);


/**
 * 指定された行列に、ローカル座標系での回転を適用します (指定キーに対応)。
 * @param {THREE.Matrix4} currentMatrix - 現在の向きを表す行列 (これが変更されます)。
 * @param {'J' | 'K' | 'L'} key - 回転キー ('J', 'K', 'L')。
 */
export function applyRotation(currentMatrix, key) {
    let rotationMatrix;
    switch (key) {
        case 'J': rotationMatrix = rotJMatrix; break;
        case 'K': rotationMatrix = rotKMatrix; break;
        case 'L': rotationMatrix = rotLMatrix; break;
        default: return; // 不明なキーは無視
    }
    // 現在の行列にローカル回転を左から乗算 (Rotate in object space)
    currentMatrix.premultiply(rotationMatrix);
}

/**
 * 指定された行列に、ローカル座標系での反転を適用します (指定キーに対応)。
 * @param {THREE.Matrix4} currentMatrix - 現在の向きを表す行列 (これが変更されます)。
 * @param {'U' | 'I' | 'O'} key - 反転キー ('U', 'I', 'O')。
 */
export function applyFlip(currentMatrix, key) {
    let flipMatrix;
    switch (key) {
        case 'U': flipMatrix = flipUMatrix; break;
        case 'I': flipMatrix = flipIMatrix; break;
        case 'O': flipMatrix = flipOMatrix; break;
        default: return; // 不明なキーは無視
    }
    // 現在の行列にローカル反転(スケーリング)を左から乗算
    currentMatrix.premultiply(flipMatrix);
}