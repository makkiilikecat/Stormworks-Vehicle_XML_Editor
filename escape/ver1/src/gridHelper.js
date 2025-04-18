import * as THREE from 'three';
import { BLOCK_SIZE_METERS } from './sceneSetup.js';

const GRID_SIZE = 20; // グリッド全体のサイズ (メートル)
const GRID_DIVISIONS = GRID_SIZE / BLOCK_SIZE_METERS; // 1ブロック=1分割線

/**
 * グリッドヘルパーと軸ヘルパーを作成してシーンに追加します。
 * @param {THREE.Scene} scene - 追加対象のシーン
 */
function setupHelpers(scene) {
    // グリッドヘルパー (Y=0平面に表示)
    const gridHelper = new THREE.GridHelper(
        GRID_SIZE,
        GRID_DIVISIONS,
        0x888888, // 中心の線の色
        0xcccccc  // 通常の線の色
    );
    scene.add(gridHelper);

    // 軸ヘルパー (X:赤, Y:緑, Z:青)
    const axesHelper = new THREE.AxesHelper(1); // 長さ1m
    scene.add(axesHelper);
}

export { setupHelpers };