import * as THREE from 'three';

/**
 * ワークベンチの原点(0,0,0)に初期ブロックを作成し、シーンに追加します。
 * @param {THREE.Scene} scene - ブロックを追加するシーン。
 * @returns {THREE.Mesh} 作成された原点ブロックのメッシュ。
 */
export function createOriginBlock(scene) {
    // ブロックのジオメトリ (形状) を定義 (1x1x1の立方体)
    // Stormworksのブロックサイズは 0.25m x 0.25m x 0.25m なので、
    // Three.js上でのサイズを1とすると、座標の1単位が1ブロックに対応する。
    const geometry = new THREE.BoxGeometry(1, 1, 1);

    // ブロックのマテリアル (見た目) を定義
    const material = new THREE.MeshStandardMaterial({
        color: 0xcccccc, // 初期ブロックは明るい灰色など
        roughness: 0.8,  // 表面の粗さ
        metalness: 0.2   // 金属っぽさ
    });

    // ジオメトリとマテリアルからメッシュを作成
    const originBlock = new THREE.Mesh(geometry, material);

    // 位置を設定 (原点)
    // BoxGeometryは中心が原点なので、position(0,0,0)でY=0平面が中心を通る
    originBlock.position.set(0, 0, 0); // <<<--- 修正点: Y座標を0に変更

    // シーンに追加
    scene.add(originBlock);

    // 作成したブロックを返す (後で参照する可能性があるため)
    return originBlock;
}