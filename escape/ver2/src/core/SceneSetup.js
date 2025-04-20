import * as THREE from 'three';
import { BLOCK_SIZE_METERS } from '../app/Constants.js';

/**
 * Three.jsの基本的なシーン、カメラ、レンダラー、光源を初期化します。
 * @param {HTMLCanvasElement} canvas - 描画対象のCanvas要素
 * @returns {object} { scene, camera, renderer }
 */
function initializeScene(canvas) {
    // シーン
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcccccc);

    // カメラ (遠近法)
    const camera = new THREE.PerspectiveCamera(
        75, // 視野角 (FOV)
        window.innerWidth / window.innerHeight, // アスペクト比
        0.1, // Nearクリッピングプレーン
        1000 // Farクリッピングプレーン
    );
    camera.position.set(2, 2, 3); // 初期カメラ位置
    camera.lookAt(0, 0, 0); // 原点を見る

    // レンダラー
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // 高解像度ディスプレイ対応

    // 光源
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // 環境光 (全体を明るく)
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // 平行光源 (影を作る)
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);
    // オプション: 影を有効にする場合
    // renderer.shadowMap.enabled = true;
    // directionalLight.castShadow = true;

    return { scene, camera, renderer };
}

export { initializeScene, BLOCK_SIZE_METERS };