/**
 * @fileoverview Three.jsの基本的なシーン、カメラ、レンダラー、ライトをセットアップします。
 */

import * as THREE from 'three';

/**
 * Three.jsの基本的なシーン、カメラ、レンダラー、ライトをセットアップします。
 * @returns {{scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer}} シーン、カメラ、レンダラーを含むオブジェクト。
 */
export function setupSceneEnvironment() {
    // シーンを作成
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x3d434f); // 背景色

    // カメラを作成
    const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
    camera.position.set(-15, 12, -18); // 初期位置調整済み
    camera.lookAt(0, 0, 0);

    // レンダラーを作成
    // querySelector の ID を新しいHTMLに合わせて変更
    const canvas = document.querySelector('#three-canvas');
    // キャンバス要素が見つからない場合のエラーハンドリングを追加
    if (!canvas) {
        console.error("レンダラーの初期化に失敗しました: Canvas 要素 '#three-canvas' が見つかりません。");
        // アプリケーションの初期化を中断するなど、適切なエラー処理を行う
        throw new Error("Canvas element #three-canvas not found.");
    }
    const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    // ライトを作成
    const ambientLight = new THREE.AmbientLight(0xa0a0a0);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(-100, 100, -100); // 位置調整済み
    scene.add(directionalLight);

    console.log("[SceneSetup] シーン環境をセットアップしました。");
    return { scene, camera, renderer };
}

/**
 * ウィンドウリサイズ時にカメラとレンダラーの設定を更新します。
 * @param {THREE.PerspectiveCamera} camera - 更新するカメラ。
 * @param {THREE.WebGLRenderer} renderer - 更新するレンダラー。
 */
export function handleWindowResize(camera, renderer) {
    // camera や renderer が null の可能性を考慮 (より安全に)
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        console.log("[SceneSetup] ウィンドウリサイズに対応しました。");
    }
}