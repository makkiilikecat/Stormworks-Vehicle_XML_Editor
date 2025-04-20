/**
 * @fileoverview DOMイベントリスナーを設定し、対応するハンドラ関数を呼び出すマネージャー。
 */

import { handleLoadButtonClick } from '../handlers/fileHandlers.js';
import { handleSaveButtonClick } from '../handlers/fileHandlers.js';
import { initializeKeyboardInput } from '../handlers/keyboardInputHandler.js';
import { handleCanvasPointerDown, handleCanvasPointerMove, handleCanvasPointerUp, handleCanvasPointerLeave } from '../handlers/mouseInteractionHandler.js';
import { initializeUIUpdateHandlers } from '../handlers/uiUpdateHandlers.js';
import { handleWindowResize } from '../setup/sceneSetup.js'; // setupからインポート

// アプリケーションの主要なインスタンスへの参照 (main.jsから設定)
let appState = null;

/**
 * アプリケーションの状態オブジェクトへの参照を設定します。
 * これにより、イベントハンドラが必要な情報（scene, camera, loadedBlocksなど）にアクセスできます。
 * @param {object} state - main.jsで管理される状態オブジェクト。
 */
export function setApplicationState(state) {
    appState = state;
}

/**
 * 主要なDOMイベントリスナーを初期化します。
 * main.js の init から呼び出されます。
 */
export function initializeEventListeners() {
    if (!appState?.renderer || !appState?.canvas || !appState?.camera) {
        console.error("イベントリスナー初期化エラー: アプリケーション状態が設定されていません。");
        return;
    }
    console.log("Initializing event listeners...");

    const { renderer, canvas, camera } = appState;

    // --- ファイル操作 ---
    const fileInput = document.getElementById('fileInput');
    const loadButton = document.getElementById('loadButton');
    const saveButton = document.getElementById('saveButton');

    // ファイル選択イベント (変更内容は fileHandlers 内で参照)
    fileInput?.addEventListener('change', (event) => {
        appState.selectedFile = event.target.files[0];
        const fileStatus = document.getElementById('file-status');
        if (fileStatus) {
             fileStatus.textContent = appState.selectedFile ? `ファイル選択中: ${appState.selectedFile.name}` : '';
             fileStatus.style.color = '#eee';
        }
    });
    // 読み込みボタンクリック
    loadButton?.addEventListener('click', () => handleLoadButtonClick(appState));
    // 保存ボタンクリック
    saveButton?.addEventListener('click', () => handleSaveButtonClick(appState));

    // --- キーボード入力 ---
    initializeKeyboardInput(appState); // キーボードハンドラ初期化

    // --- マウス操作 (Canvas) ---
    canvas.addEventListener('pointerdown', (event) => handleCanvasPointerDown(event, appState));
    canvas.addEventListener('pointermove', (event) => handleCanvasPointerMove(event, appState));
    canvas.addEventListener('pointerup', (event) => handleCanvasPointerUp(event, appState));
    canvas.addEventListener('pointerleave', () => handleCanvasPointerLeave(appState));
    // 右クリックメニュー抑制
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    // --- ウィンドウリサイズ ---
    window.addEventListener('resize', () => handleWindowResize(camera, renderer));

    // --- UI更新ハンドラ ---
    initializeUIUpdateHandlers(appState); // カスタムイベントリスナーなどを設定

    console.log("Event listeners initialized.");
}