import * as THREE from 'three';

/**
 * Three.jsの基本的なシーン、カメラ、レンダラー、ライトをセットアップします。
 * @returns {object} シーン、カメラ、レンダラーを含むオブジェクト。
 */
export function setupSceneEnvironment() {
    // シーンを作成
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x3d434f); // Stormworksのワークベンチに近い背景色

    // カメラを作成 (PerspectiveCamera)
    // -視野角(fov), アスペクト比(aspect), 近クリップ面(near), 遠クリップ面(far)
    const camera = new THREE.PerspectiveCamera(
        75, // 視野角を広めに
        window.innerWidth / window.innerHeight, // アスペクト比はウィンドウサイズに合わせる
        0.1, // 近いオブジェクトの描画開始距離
        1000 // 遠いオブジェクトの描画終了距離
    );
    // 初期カメラ位置を設定 (少し上から斜めに見る感じ)
    camera.position.set(10, 15, 20);
    camera.lookAt(0, 0, 0); // 原点を見つめる

    // レンダラーを作成 (WebGL)
    const canvas = document.querySelector('#workbench-canvas');
    const renderer = new THREE.WebGLRenderer({
        canvas: canvas, // 描画対象のCanvas要素を指定
        antialias: true // アンチエイリアスを有効化 (線のギザギザを軽減)
    });
    renderer.setPixelRatio(window.devicePixelRatio); // デバイスのピクセル比に合わせて解像度を調整
    renderer.setSize(window.innerWidth, window.innerHeight); // レンダラーのサイズをウィンドウに合わせる

    // ライトを作成
    // 1. 環境光 (全体を均一に照らす)
    const ambientLight = new THREE.AmbientLight(0x808080); // 光の色 (灰色)
    scene.add(ambientLight);

    // 2. 平行光 (太陽光のような光源)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // 光の色 (白), 強さ
    directionalLight.position.set(5, 10, 7); // 光の方向を設定
    scene.add(directionalLight);

    // 作成した要素をオブジェクトとして返す
    return { scene, camera, renderer };
}

/**
 * ウィンドウリサイズ時にカメラとレンダラーの設定を更新します。
 * @param {THREE.PerspectiveCamera} camera - 更新するカメラ。
 * @param {THREE.WebGLRenderer} renderer - 更新するレンダラー。
 */
export function handleWindowResize(camera, renderer) {
    camera.aspect = window.innerWidth / window.innerHeight; // カメラのアスペクト比を更新
    camera.updateProjectionMatrix(); // カメラの投影行列を再計算
    renderer.setSize(window.innerWidth, window.innerHeight); // レンダラーのサイズを更新
}