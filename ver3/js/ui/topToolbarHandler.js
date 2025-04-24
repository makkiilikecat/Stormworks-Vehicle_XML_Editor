/**
 * @fileoverview 上ツールバー (#top-toolbar) のUI要素とインタラクションを管理します。
 * モード切替ボタン、スティック表示切替ボタン、背景色切替ボタンなどを扱います。
 *
 * @version 4.2 - 背景色切替機能を追加
 */

// --- 必要なモジュールや関数をインポート ---
import * as THREE from 'three'; // 背景色設定のため THREE.Color を使用
import { setEditMode, EditMode } from '../state/editMode.js'; // モード設定・定義
import { setStickVisibility } from '../interactions/cameraStickHandler.js'; // スティック表示/非表示連携
// import { updateModeIndicator } from './modeIndicator.js'; // モード表示更新 (このモジュールからは直接呼ばない)

// --- 定数 ---
/** @const {number} ダークテーマの背景色 (16進数) */
const DARK_BACKGROUND_COLOR = 0x3d434f; // デフォルトのダーク色
/** @const {number} ライトテーマの背景色 (16進数) */
const LIGHT_BACKGROUND_COLOR = 0x56B4D3; // ライトテーマの色 (白に近い灰色)

// --- モジュール内変数 ---
/**
 * アプリケーション全体の状態オブジェクトへの参照。
 * シーンオブジェクト (`scene`) にアクセスするために必要。
 * @type {object | null}
 */
let appState = null;
/**
 * カメラ移動スティックが表示されているかどうかの状態。
 * @type {boolean}
 */
let stickVisible = true; // スティックの初期表示状態
/**
 * 現在ライトテーマが有効かどうかの状態。
 * @type {boolean}
 */
let isLightThemeActive = false; // 初期状態はダークテーマ

// --- DOM要素キャッシュ ---
/** @type {HTMLElement | null} 上ツールバーのメイン要素 */
let topToolbar = null;
/** @type {NodeListOf<Element> | null} モード切替ボタンのコレクション */
let modeButtons = null;
/** @type {HTMLElement | null} スティック表示/非表示切替ボタン */
let toggleStickButton = null;
/** @type {HTMLElement | null} カメラ移動スティック要素 (表示/非表示クラス操作用) */
let cameraStick = null;
/** @type {HTMLElement | null} 背景色切替ボタン */
let toggleBgButton = null;

/**
 * 上ツールバー関連の初期化を行います。
 * DOM要素への参照取得、イベントリスナーの設定、初期UI状態の設定を実行します。
 * uiInitializer.js から呼び出されることを想定しています。
 * @param {object} appStateRef - アプリケーション状態オブジェクトへの参照。`scene` を含む必要があります。
 */
export function initializeTopToolbar(appStateRef) {
    console.log("[TopToolbarHandler] 初期化中...");
    appState = appStateRef; // アプリケーション状態への参照を保持

    // --- DOM要素を取得 ---
    topToolbar = document.getElementById('top-toolbar');
    if (!topToolbar) {
        console.error("[TopToolbarHandler] 上ツールバー要素 (#top-toolbar) が見つかりません。");
        // return; // 致命的エラーとして中断する方が良い場合もある
    }
    modeButtons = topToolbar?.querySelectorAll('.mode-button');
    toggleStickButton = document.getElementById('toggle-stick-button');
    cameraStick = document.getElementById('camera-stick'); // スティック本体の表示切替用
    toggleBgButton = document.getElementById('toggle-bg-button'); // 背景色切替ボタン

    // --- イベントリスナー設定 ---

    // モード切替ボタン (各ボタンにリスナーを設定)
    modeButtons?.forEach(button => {
        button.addEventListener('click', () => {
            const modeToSet = button.dataset.mode; // data-mode属性からモード名を取得
            // EditModeに存在するモードか確認してから設定
            if (modeToSet && Object.values(EditMode).includes(modeToSet)) {
                setEditMode(modeToSet); // editMode.js の状態変更関数を呼び出す
                // ボタンのアクティブ状態の更新は、'editmodechange' イベントをリッスンする
                // updateTopToolbarUI 関数で行われます。
            } else {
                console.warn(`[TopToolbarHandler] 不明なモードが指定されました: ${modeToSet}`);
            }
        });
    });

    // スティック表示切替ボタン
    toggleStickButton?.addEventListener('click', handleToggleStickVisibility);

    // 背景色切替ボタン
    toggleBgButton?.addEventListener('click', handleToggleBackgroundTheme);

    // --- 初期状態設定 ---
    // スティックの初期表示状態を反映
    if (cameraStick) cameraStick.classList.toggle('hidden', !stickVisible);
    if (toggleStickButton) toggleStickButton.classList.toggle('active', stickVisible);
    // 背景色ボタンと実際の背景色の初期状態を設定 (デフォルトはダークテーマ)
    updateBackgroundThemeUI();

    console.log("[TopToolbarHandler] 初期化完了。");
}

/**
 * スティック表示切替ボタンがクリックされたときの処理。
 * スティック要素の表示/非表示クラス、ボタンのアクティブ状態を切り替え、
 * cameraStickHandlerに状態を通知します。
 * @private
 */
function handleToggleStickVisibility() {
    stickVisible = !stickVisible; // 状態を反転
    // スティック本体の表示/非表示
    cameraStick?.classList.toggle('hidden', !stickVisible);
    // ボタン自体の見た目（アクティブ状態）
    toggleStickButton?.classList.toggle('active', stickVisible);
    // cameraStickHandler モジュールに現在の表示状態を伝える
    setStickVisibility(stickVisible);
    console.log(`[TopToolbarHandler] カメラ移動スティック表示: ${stickVisible}`);
}

/**
 * 背景色切替ボタンがクリックされたときの処理。
 * テーマ状態をトグルし、UI（ボタンとシーン背景）を更新します。
 * @private
 */
function handleToggleBackgroundTheme() {
    isLightThemeActive = !isLightThemeActive; // テーマ状態を反転
    updateBackgroundThemeUI(); // UI更新関数を呼び出す
    console.log(`[TopToolbarHandler] 背景テーマを ${isLightThemeActive ? 'ライト' : 'ダーク'} に切り替えました。`);
}

/**
 * 現在のテーマ状態 (`isLightThemeActive`) に基づいて、
 * 背景色切替ボタンの表示 (アクティブクラス、アイコン) と
 * シーンの実際の背景色を更新します。
 * @private
 */
function updateBackgroundThemeUI() {
    // 必要なオブジェクトや要素が存在するか確認
    if (!appState?.scene) {
        console.error("[TopToolbarHandler] 背景色更新エラー: シーンオブジェクトが見つかりません。");
        return;
    }
    if (!toggleBgButton) {
        // ボタン要素が見つからない場合は警告のみ（処理は続行しない）
        console.warn("[TopToolbarHandler] 背景切替ボタンが見つからないため、ボタンUIを更新できません。");
        // return; // ここで return すると背景色も更新されないため注意
    }

    // 1. ボタンの表示を更新
    if (toggleBgButton) {
        // isLightThemeActive が true なら 'active' クラスを追加、false なら削除
        toggleBgButton.classList.toggle('active', isLightThemeActive);
        // ボタン内のアイコン要素を探す
        const iconSpan = toggleBgButton.querySelector('.icon-text');
        if (iconSpan) {
            // テーマに応じてアイコンを変更
            iconSpan.textContent = isLightThemeActive ? '☀️' : '🌓'; // ライトなら太陽、ダークなら月
        }
    }

    // 2. シーンの背景色を更新
    // テーマ状態に応じて目標の色を決定
    const targetColorValue = isLightThemeActive ? LIGHT_BACKGROUND_COLOR : DARK_BACKGROUND_COLOR;
    // THREE.Color オブジェクトを作成してシーンの背景に設定
    appState.scene.background = new THREE.Color(targetColorValue);
}


/**
 * 編集モード変更イベント (`editmodechange`) に応じて呼び出され、
 * 上ツールバーのUI（主にモードボタンのアクティブ状態）を更新します。
 * main.js などから呼び出されることを想定しています。
 * @param {EditMode} newMode - 新しく設定された編集モード。
 */
export function updateTopToolbarUI(newMode) {
    // 全てのモードボタンに対してループ
    modeButtons?.forEach(button => {
        // ボタンの data-mode 属性が新しいモードと一致するかどうかで
        // 'active' クラスを付け外しする
        button.classList.toggle('active', button.dataset.mode === newMode);
    });
    // モード表示テキストの更新は modeIndicator.js が担当するため、ここでは行わない
    // console.log(`[TopToolbarHandler] モードボタンUI更新完了 (新モード: ${newMode})`);
}