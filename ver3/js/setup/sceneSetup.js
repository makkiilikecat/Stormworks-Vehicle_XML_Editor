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
    const camera = new THREE.PerspectiveCamera(
        75, // 視野角
        window.innerWidth / window.innerHeight, // アスペクト比
        0.1, // Near clip
        1000 // Far clip
    );
    // --- 修正点: カメラの初期位置を調整 ---
    // 原点の「左(-X)」「上(+Y)」「前(-Z)」から見る位置に設定
    camera.position.set(-15, 12, -18); // X:左, Y:上, Z:前(奥)
    camera.lookAt(0, 0, 0); // カメラは常に原点を見つめる

    // レンダラーを作成 (WebGL)
    const canvas = document.querySelector('#workbench-canvas');
    const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    // ライトを作成
    // 1. 環境光 (全体を均一に照らす)
    const ambientLight = new THREE.AmbientLight(0x808080);
    scene.add(ambientLight);

    // 2. 平行光 (太陽光のような光源)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    // --- 修正点: 光源の位置を調整 ---
    // 原点の「左前上空」あたりから照らすように設定
    directionalLight.position.set(-10, 15, -10); // やや左上前方から
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