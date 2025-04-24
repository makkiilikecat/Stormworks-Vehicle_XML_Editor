/**
 * @fileoverview 上ツールバー (#top-toolbar) のUI要素とインタラクションを管理します。
 * モード切替ボタン、スティック表示切替ボタンなどを扱います。
 */

// --- 必要なモジュールや関数をインポート ---
import { setEditMode, EditMode } from '../state/editMode.js';
import { setStickVisibility } from '../interactions/cameraStickHandler.js';
import { updateModeIndicator } from './modeIndicator.js'; // モード表示更新も連携

// --- モジュール内変数 ---
let appState = null;
let stickVisible = true; // スティックの初期表示状態 (uiInteractionsから移動)

// --- DOM要素キャッシュ ---
let topToolbar = null;
let modeButtons = null; // NodeListOf<Element>
let toggleStickButton = null;
let cameraStick = null; // スティック要素自体の参照も必要

/**
 * 上ツールバーの初期化を行います。DOM要素への参照取得とイベントリスナー設定。
 * @param {object} appStateRef - アプリケーション状態オブジェクトへの参照。
 */
export function initializeTopToolbar(appStateRef) {
    console.log("[TopToolbarHandler] 初期化中...");
    appState = appStateRef;

    // --- DOM要素を取得 ---
    topToolbar = document.getElementById('top-toolbar');
    modeButtons = topToolbar?.querySelectorAll('.mode-button');
    toggleStickButton = document.getElementById('toggle-stick-button');
    cameraStick = document.getElementById('camera-stick'); // スティック要素も取得

    // --- イベントリスナー設定 ---
    // モード切替ボタン
    modeButtons?.forEach(button => {
        button.addEventListener('click', () => {
            const modeToSet = button.dataset.mode;
            if (modeToSet && Object.values(EditMode).includes(modeToSet)) {
                setEditMode(modeToSet); // editMode.js の関数を呼び出してモード変更
                // モードボタンのアクティブ状態更新は editmodechange イベントリスナー (例: main.js) で行う想定
            }
        });
    });

    // スティック表示切替ボタン
    toggleStickButton?.addEventListener('click', toggleStickVisibilityHandler); // ヘルパー関数を呼び出す

    // --- 初期状態設定 ---
    // スティックの初期表示状態を反映
    cameraStick?.classList.toggle('hidden', !stickVisible);
    toggleStickButton?.classList.toggle('active', stickVisible);
    // モードボタンの初期アクティブ状態は editmodechange イベントで設定される想定

    console.log("[TopToolbarHandler] 初期化完了。");
}

/**
 * スティック表示切替ボタンのクリックイベントハンドラ。
 * @private
 */
function toggleStickVisibilityHandler() {
    stickVisible = !stickVisible;
    cameraStick?.classList.toggle('hidden', !stickVisible);
    toggleStickButton?.classList.toggle('active', stickVisible);
    // cameraStickHandler に状態を通知
    setStickVisibility(stickVisible);
    console.log(`[TopToolbarHandler] カメラ移動スティック表示: ${stickVisible}`);
}

/**
 * 編集モード変更時に上ツールバーのUI（主にモードボタンのアクティブ状態）を更新します。
 * main.js などから 'editmodechange' イベントに応じて呼び出されることを想定。
 * @param {EditMode} newMode - 新しい編集モード。
 */
export function updateTopToolbarUI(newMode) {
    modeButtons?.forEach(button => {
        button.classList.toggle('active', button.dataset.mode === newMode);
    });
     // モードインジケータ更新は modeIndicator.js が担当
}