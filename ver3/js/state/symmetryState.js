/**
 * @fileoverview 対称編集モードの状態 (X, Y, Z軸の有効/無効) を管理し、
 * 対称な位置や回転を計算するユーティリティを提供します。
 */

import * as THREE from 'three';

// --- 状態変数 ---
const symmetryEnabled = {
    x: false,
    y: false,
    z: false,
};

// --- 計算用一時変数 ---
const _pos = new THREE.Vector3();
const _mat = new THREE.Matrix4();
// X, Y, Z 軸反転用の行列 (定数)
const reflectX = new THREE.Matrix4().makeScale(-1, 1, 1);
const reflectY = new THREE.Matrix4().makeScale(1, -1, 1);
const reflectZ = new THREE.Matrix4().makeScale(1, 1, -1);

// --- 公開関数 ---

/**
 * 指定された軸の対称編集モードの有効/無効を切り替えます。
 * 状態変更後に 'symmetrystatechange' イベントを発行します。
 * @param {'x' | 'y' | 'z'} axis - 切り替える軸。
 */
export function toggleSymmetryAxis(axis) {
    if (axis in symmetryEnabled) {
        symmetryEnabled[axis] = !symmetryEnabled[axis];
        console.log(`[SymmetryState] 対称編集 ${axis.toUpperCase()}軸 を ${symmetryEnabled[axis] ? '有効' : '無効'} にしました。`);
        // 状態変更イベントを発行
        document.dispatchEvent(new CustomEvent('symmetrystatechange', {
            detail: { ...symmetryEnabled } // 現在の全軸の状態を渡す
        }));
    } else {
        console.warn(`[SymmetryState] 無効な対称軸が指定されました: ${axis}`);
    }
}

/**
 * 指定された軸の対称編集が現在有効かどうかを返します。
 * @param {'x' | 'y' | 'z'} axis - 確認する軸。
 * @returns {boolean} 有効な場合は true。
 */
export function isSymmetryEnabled(axis) {
    return symmetryEnabled[axis] || false;
}

/**
 * 現在有効になっている対称軸の配列を返します。
 * @returns {Array<'x' | 'y' | 'z'>} 有効な軸の配列 (例: ['x', 'z'])。
 */
export function getActiveSymmetryAxes() {
    return Object.keys(symmetryEnabled).filter(axis => symmetryEnabled[axis]);
}

/**
 * 指定された位置ベクトルを、指定された軸に対して対称な位置に変換します。
 * @param {THREE.Vector3} position - 元の位置ベクトル。
 * @param {'x' | 'y' | 'z'} axis - 対称軸。
 * @returns {THREE.Vector3} 対称な位置ベクトル (新しいインスタンス)。
 */
export function getSymmetricPosition(position, axis) {
    _pos.copy(position);
    if (axis === 'x') _pos.x *= -1;
    else if (axis === 'y') _pos.y *= -1;
    else if (axis === 'z') _pos.z *= -1;
    return _pos.clone(); // クローンを返す
}

/**
 * 指定された回転行列を、指定された軸に対して対称な向きに変換します。
 * これは複雑な操作であり、ブロックの種類や期待する動作によって実装が変わります。
 * ここでは単純な例として、軸反転行列を適用する基本的な実装を示します。
 * 注意: これが Stormworks の対称編集と完全に一致するとは限りません。
 * @param {THREE.Matrix4} rotationMatrix - 元の回転行列。
 * @param {'x' | 'y' | 'z'} axis - 対称軸。
 * @returns {THREE.Matrix4} 対称な向きを表す回転行列 (新しいインスタンス)。
 */
export function getSymmetricRotation(rotationMatrix, axis) {
    _mat.copy(rotationMatrix); // 元の行列をコピー

    // 対称軸に応じた反転行列を選択
    let reflectionMatrix;
    if (axis === 'x') reflectionMatrix = reflectX;
    else if (axis === 'y') reflectionMatrix = reflectY;
    else if (axis === 'z') reflectionMatrix = reflectZ;
    else return _mat.clone(); // 不明な軸ならコピーをそのまま返す

    // TODO: より正確な対称回転の実装
    // 単純に反転行列を掛けるだけでは、意図した向きにならない場合がある。
    // 例: X軸対称の場合、Y軸周りの回転とZ軸周りの回転の向きを反転させる必要があるかもしれない。
    // reflect(M) = R * M * R^{-1} (Rは反転行列)のような計算が必要になる場合もある。
    // ここではまず、元の回転をそのまま使う（位置のみ対称にする）実装とする。
    // 必要に応じてロジックを追加・修正する。
    // _mat.premultiply(reflectionMatrix); // 例: X軸反転を左から掛ける
    // _mat.multiply(reflectionMatrix); // 例: 右から掛ける (どちらが適切かは要検証)

    return _mat.clone(); // クローンを返す (現状はコピーのみ)
}