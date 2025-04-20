import * as THREE from 'three';

/**
 * ワークベンチのグリッドヘルパーと軸ヘルパーをセットアップし、シーンに追加します。
 * @param {THREE.Scene} scene - ヘルパーを追加するシーン。
 */
export function setupHelpers(scene) {
    // グリッドヘルパーを作成
    // - size: グリッド全体のサイズ
    // - divisions: グリッドの分割数
    // - colorCenterLine: 中央線の色
    // - colorGrid: グリッド線の色
    const gridSize = 100; // 十分な大きさのグリッド
    const gridDivisions = 100; // 1ブロック単位の線になるように (100ブロック四方)
    const gridHelper = new THREE.GridHelper(
        gridSize,
        gridDivisions,
        0x888888, // 中央線は少し濃い灰色
        0x666666  // グリッド線は灰色
    );
    // グリッドはY=0の平面に配置される
    scene.add(gridHelper);

    // 軸ヘルパーを作成 (デバッグや方向確認用)
    // - size: 軸の長さ
    const axesHelper = new THREE.AxesHelper(5); // 長さ5ブロック分の軸
    scene.add(axesHelper); // X(赤), Y(緑), Z(青) を表示
}