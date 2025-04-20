import * as THREE from 'three';
import { setupSceneEnvironment, handleWindowResize } from './setup/sceneSetup.js';
import { setupOrbitControls } from './setup/controlsSetup.js';
import { setupHelpers } from './setup/helpersSetup.js';
import { createOriginBlock } from './objects/initialObjects.js';
import { loadFileAsText, parseVehicleXml } from './io/fileHandler.js';
import { BlockData } from './data/blockData.js';
// --- Stage 1.3 追加 ---
import { clearBlocks, renderBlocks } from './rendering/blockRenderer.js';
// ----------------------

// --- グローバル変数 ---
let scene, camera, renderer, controls;
let originBlock; // 原点ブロックへの参照

let loadedBlocks = []; // 読み込んだブロックデータを格納する配列
let selectedFile = null; // ユーザーが選択したファイルを保持

// --- UI要素への参照 ---
const fileInput = document.getElementById('fileInput');
const loadButton = document.getElementById('loadButton');
const loadStatus = document.getElementById('load-status');

/**
 * アプリケーションの初期化処理
 */
function init() {
    // シーン、カメラ、レンダラーをセットアップ
    const sceneEnv = setupSceneEnvironment();
    scene = sceneEnv.scene;
    camera = sceneEnv.camera;
    renderer = sceneEnv.renderer;

    // 視点操作コントロールをセットアップ
    controls = setupOrbitControls(camera, renderer.domElement);

    // グリッドと軸ヘルパーをセットアップ
    setupHelpers(scene);

    // 原点ブロックを作成してシーンに追加
    originBlock = createOriginBlock(scene); // 初期状態では表示

    // イベントリスナー設定
    setupEventListeners();

    // ウィンドウリサイズイベントに対応
    window.addEventListener('resize', () => handleWindowResize(camera, renderer));

    // アニメーションループを開始
    animate();
}

/**
 * UI要素にイベントリスナーを設定します。
 */
function setupEventListeners() {
    // ファイルが選択されたときの処理
    fileInput.addEventListener('change', (event) => {
        selectedFile = event.target.files[0];
        if (selectedFile) {
            loadStatus.textContent = `ファイル選択中: ${selectedFile.name}`;
            loadStatus.style.color = '#eee';
        } else {
            loadStatus.textContent = '';
            selectedFile = null;
        }
    });

    // 読み込みボタンがクリックされたときの処理
    loadButton.addEventListener('click', async () => {
        if (!selectedFile) {
            alert('先にXMLファイルを選択してください。');
            loadStatus.textContent = 'ファイルが選択されていません';
            loadStatus.style.color = 'orange';
            return;
        }

        loadStatus.textContent = '読み込み中...';
        loadStatus.style.color = '#eee';

        try {
            // 1. ファイルをテキストとして読み込む
            const xmlString = await loadFileAsText(selectedFile);
            // 2. XML文字列を解析してブロックデータ配列を取得
            const parsedBlocks = parseVehicleXml(xmlString);

            // --- Stage 1.3 変更点 ---
            // 3. 既存のブロックメッシュをクリア (原点ブロックは残す)
            clearBlocks(scene);
            // 4. 解析結果をグローバル変数に格納
            loadedBlocks = parsedBlocks;
            // 5. 新しいブロックデータを3Dシーンに描画
            renderBlocks(scene, loadedBlocks);
            // ----------------------

            loadStatus.textContent = `読み込み完了: ${loadedBlocks.length} ブロック`;
            loadStatus.style.color = 'lightgreen';

        } catch (error) {
            console.error('ファイル読み込みまたは解析エラー:', error);
            loadStatus.textContent = `エラー: ${error.message}`;
            loadStatus.style.color = 'tomato';
            // エラー時は表示されているブロックをクリアし、データを空にする
            clearBlocks(scene);
            loadedBlocks = [];
        } finally {
            // 読み込み処理後、ファイル選択をリセット (任意)
            // fileInput.value = '';
            // selectedFile = null;
        }
    });
}

/**
 * アニメーションループ (フレームごとに実行)
 */
function animate() {
    // 次のフレームでのアニメーション実行を要求
    requestAnimationFrame(animate);

    // カメラコントロールを更新 (慣性などを適用)
    controls.update();

    // シーンを描画
    renderer.render(scene, camera);
}

// --- アプリケーション開始 ---
init();