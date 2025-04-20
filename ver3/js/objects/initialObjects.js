import * as THREE from 'three';
import { BlockData } from '../data/blockData.js'; // BlockDataをインポート

/**
 * ワークベンチの原点(0,0,0)に対応する BlockData を作成し、
 * それに関連付けられたメッシュをシーンに追加します。
 * @param {THREE.Scene} scene - ブロックを追加するシーン。
 * @returns {BlockData} 作成された原点ブロックのBlockDataインスタンス。
 */
export function createOriginBlockData(scene) {
    // --- BlockDataを生成 ---
    const originPositionXml = { x: 0, y: 0, z: 0 }; // XML座標系での原点
    const originRotationString = "1,0,0,0,1,0,0,0,1"; // 単位行列
    const originColorString = "0"; // デフォルト色
    const originBlockData = new BlockData(
        '01_block', // 通常ブロックとして生成
        originPositionXml,
        originRotationString,
        originColorString
    );
    // --------------------------

    // メッシュを作成
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    // マテリアルはクローンして使う（他のブロックと共有しないため）
    const material = new THREE.MeshStandardMaterial({
        color: 0xcccccc, // 原点ブロックの色 (やや明るい灰色)
        roughness: 0.8,
        metalness: 0.2
     }).clone(); // 念のためクローンしておく

    const mesh = new THREE.Mesh(geometry, material);

    // メッシュの位置と向きは BlockData (Three.js座標系) から設定
    mesh.position.copy(originBlockData.position);
    mesh.matrix.copy(originBlockData.rotationMatrix);
    mesh.matrix.setPosition(originBlockData.position);
    mesh.matrixAutoUpdate = false; // 行列は手動で管理
    mesh.matrixWorldNeedsUpdate = true; // ワールド行列の更新を指示

    // 作成したメッシュをBlockDataに紐付け
    originBlockData.mesh = mesh;

    // --- ユーザーデータを追加して識別しやすくする ---
    // (blockRenderer.js と同じ形式で設定)
    mesh.userData.isBlockMesh = true;
    mesh.userData.blockId = originBlockData.id;
    // ---------------------------------------------

    // シーンに追加
    scene.add(mesh);
    console.log("Origin block created and added to scene.");

    // BlockDataインスタンスを返す
    return originBlockData;
}