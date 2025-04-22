/**
 * @fileoverview 新しいUI要素の基本的なインタラクション（トグル表示、フルスクリーン、FPS制限など）を管理します。
 * 主に main.js から初期化され、各UI要素にイベントリスナーを設定します。
 * @version 1.1 (Stage 2.3 FPSリミッター連携追加)
 */

// main.js からFPS制限設定関数をインポート
import { setFpsLimitMode } from '../main.js';
// cameraStickHandler からスティック表示状態設定関数をインポート
import { setStickVisibility } from '../interactions/cameraStickHandler.js';

// --- モジュール内変数 ---

/**
 * アプリケーション状態オブジェクトへの参照。
 * OrbitControls などにアクセスするために保持します。
 * @type {object | null}
 */
let appState = null;

/**
 * インベントリパネルが表示されているかどうかを示すフラグ。
 * @type {boolean}
 */
let inventoryVisible = false;

/**
 * XML編集パネルが格納されている（折りたたまれている）かどうかを示すフラグ。
 * @type {boolean}
 */
let xmlPanelCollapsed = false;

/**
 * カメラ移動スティックが表示されているかどうかを示すフラグ。
 * @type {boolean}
 */
let stickVisible = true; // 初期状態は表示

/**
 * 現在のFPS制限モード。
 * 0: 無制限 (∞)
 * 1: 60 FPS
 * 2: 30 FPS
 * @type {number}
 */
let currentFpsLimitMode = 0; // 初期状態は無制限

// --- DOM要素キャッシュ ---
// initializeUIInteractions 関数内で初期化されます。
/** @type {HTMLButtonElement | null} スティック表示切替ボタン */
let toggleStickButton = null;
/** @type {HTMLElement | null} カメラ移動スティック要素 */
let cameraStick = null;
/** @type {HTMLButtonElement | null} フルスクリーン切替ボタン */
let fullscreenButton = null;
/** @type {HTMLButtonElement | null} XMLパネル格納ボタン */
let toggleXmlPanelButton = null;
/** @type {HTMLElement | null} XML編集パネル要素 */
let xmlEditPanel = null;
/** @type {HTMLButtonElement | null} インベントリ開閉ボタン */
let toggleInventoryButton = null;
/** @type {HTMLElement | null} インベントリパネル要素 */
let inventoryPanel = null;
/** @type {HTMLElement | null} インベントリ背景オーバーレイ要素 */
let inventoryOverlay = null;
/** @type {HTMLElement | null} 下部ツールバー要素 */
let bottomToolbar = null;
/** @type {HTMLButtonElement | null} バッテリーセーブ（FPS制限）ボタン */
let batterySaveButton = null;

// --- UI操作関数 ---

/**
 * フルスクリーンモードの有効/無効を切り替えます。
 * @private
 */
function toggleFullScreen() {
    // 現在フルスクリーンでない場合
    if (!document.fullscreenElement) {
        // ドキュメントのルート要素でフルスクリーンを要求
        document.documentElement.requestFullscreen()
            .then(() => console.log("[UI] フルスクリーン有効化"))
            .catch(err => {
                // 失敗した場合、ユーザーに通知
                console.error(`フルスクリーンモードエラー: ${err.message} (${err.name})`);
                alert(`フルスクリーンモードにできませんでした。\n(${err.message})`);
            });
    } else {
        // 現在フルスクリーン状態の場合
        if (document.exitFullscreen) {
            document.exitFullscreen()
                .then(() => console.log("[UI] フルスクリーン解除"))
                .catch(err => console.error(`フルスクリーン解除エラー: ${err.message} (${err.name})`));
        }
    }
}

/**
 * カメラ移動スティックの表示/非表示を切り替えます。
 * 同時にスティック制御モジュールにも状態を通知します。
 * @private
 */
function toggleStickVisibility() {
     stickVisible = !stickVisible; // 状態を反転
     // CSSクラスを付け外しして表示を切り替え
     cameraStick?.classList.toggle('hidden', !stickVisible);
     // ボタンのアクティブ状態も切り替え
     toggleStickButton?.classList.toggle('active', stickVisible);
     // cameraStickHandler モジュールに表示状態を通知
     setStickVisibility(stickVisible);
     console.log(`[UI] カメラ移動スティック表示: ${stickVisible}`);
     // 注意: 非表示時にスティック操作中だった場合の中断処理は setStickVisibility 内で行われる想定
}

/**
 * XML編集パネルの格納/展開状態を切り替えます。
 * @private
 */
function toggleXmlPanel() {
     xmlPanelCollapsed = !xmlPanelCollapsed; // 状態反転
     // CSSクラスを付け外ししてスタイルを切り替え (高さやpaddingのアニメーション)
     xmlEditPanel?.classList.toggle('collapsed', xmlPanelCollapsed);
     console.log(`[UI] XMLパネル ${xmlPanelCollapsed ? '格納' : '展開'}`);
 }

/**
 * インベントリパネルと背景オーバーレイの表示/非表示を切り替えます。
 * 下部ツールバーの位置も調整し、カメラコントロールの有効/無効も制御します。
 * @param {boolean | null} [forceState=null] - 強制的に設定する状態 (true:表示, false:非表示)。nullの場合は現在の状態を反転。
 * @private
 */
function toggleInventory(forceState = null) {
    // 目標とする表示状態を決定
    const shouldBeVisible = forceState !== null ? forceState : !inventoryVisible;
    // 状態が変わらない場合は何もしない
    if (shouldBeVisible === inventoryVisible) return;

    // 各要素のCSSクラスを付け外しして表示状態を変更
    inventoryPanel?.classList.toggle('visible', shouldBeVisible);
    inventoryOverlay?.classList.toggle('visible', shouldBeVisible);
    bottomToolbar?.classList.toggle('lowered', shouldBeVisible); // 下部ツールバーを上下させる

    // 内部の状態を更新
    inventoryVisible = shouldBeVisible;
    console.log(`[UI] インベントリ表示: ${inventoryVisible}`);

    // カメラコントロールの有効/無効を切り替え
    if (appState?.controls) {
         const isStickDragging = false; // TODO: スティック操作状態を取得する手段が必要
         appState.controls.enabled = !inventoryVisible && !isStickDragging;
         console.log(`[UI] OrbitControls ${appState.controls.enabled ? '有効' : '無効'}`);
    }
}


/**
 * FPS制限モードを順次（無制限→60→30→無制限）切り替えます。
 * ボタンの表示を更新し、main.jsに制限モードを通知します。
 * @private
 */
function cycleFpsLimit() {
    // モードを 0, 1, 2 の順でループさせる
    currentFpsLimitMode = (currentFpsLimitMode + 1) % 3;

    let buttonText = '∞'; // ボタンのテキスト
    let buttonClass = 'fps-unlimited'; // ボタンに適用するCSSクラス
    let buttonActive = false; // ボタンをアクティブ表示にするか

    // 新しいモードに応じてテキストとクラスを設定
    switch (currentFpsLimitMode) {
        case 1: // 60 FPS
            buttonText = '60'; buttonClass = 'fps-60'; buttonActive = true; break;
        case 2: // 30 FPS
            buttonText = '30'; buttonClass = 'fps-30'; buttonActive = true; break;
        // case 0: はデフォルト値を使用
    }

    // main.js の FPS 制限ロジックに新しいモードを通知
    setFpsLimitMode(currentFpsLimitMode);

    // ボタンの表示を更新
    if (batterySaveButton) {
        batterySaveButton.textContent = buttonText;
        // クラス名を一度リセットしてから新しいクラスを設定
        batterySaveButton.className = `toolbar-button ${buttonClass}`;
        // 制限がかかっているモードでは 'active' クラスを追加
        batterySaveButton.classList.toggle('active', buttonActive);
    }
    console.log(`[UI] FPS制限モード変更: ${currentFpsLimitMode} (${buttonText} FPS)`);
}


// --- 初期化関数 ---

/**
 * このモジュールで扱うUI要素のイベントリスナーを設定し、初期状態を適用します。
 * main.js の init 関数から呼び出されます。
 * @param {object} appStateRefParam - アプリケーション状態オブジェクトへの参照。
 */
export function initializeUIInteractions(appStateRefParam) {
    console.log("[UI] UIインタラクション初期化中...");
    // アプリケーション状態への参照を保持
    appState = appStateRefParam;
    if(!appState) {
        console.error("[UI] 初期化エラー: appState が無効です。");
        return;
    }

    // --- DOM要素を取得し、モジュール内変数にキャッシュ ---
    toggleStickButton = document.getElementById('toggle-stick-button');
    cameraStick = document.getElementById('camera-stick');
    fullscreenButton = document.getElementById('fullscreen-button');
    toggleXmlPanelButton = document.getElementById('toggle-xml-panel');
    xmlEditPanel = document.getElementById('xml-edit-panel');
    toggleInventoryButton = document.getElementById('toggle-inventory-button');
    inventoryPanel = document.getElementById('inventory-panel');
    inventoryOverlay = document.getElementById('inventory-overlay');
    bottomToolbar = document.getElementById('bottom-toolbar');
    batterySaveButton = document.getElementById('battery-save-button');

    // --- 各ボタンにクリックイベントリスナーを設定 ---
    fullscreenButton?.addEventListener('click', toggleFullScreen);
    toggleStickButton?.addEventListener('click', toggleStickVisibility);
    toggleXmlPanelButton?.addEventListener('click', toggleXmlPanel);
    toggleInventoryButton?.addEventListener('click', () => toggleInventory());
    inventoryOverlay?.addEventListener('click', () => toggleInventory(false));
    batterySaveButton?.addEventListener('click', cycleFpsLimit);

    // --- UI要素の初期状態を設定 ---
    // スティック表示状態
    if (cameraStick) cameraStick.classList.toggle('hidden', !stickVisible);
    if (toggleStickButton) toggleStickButton.classList.toggle('active', stickVisible);
    // XMLパネル格納状態
    if (xmlEditPanel) xmlEditPanel.classList.toggle('collapsed', xmlPanelCollapsed);
    // FPSボタン初期表示
    if (batterySaveButton) {
         batterySaveButton.textContent = '∞';
         batterySaveButton.className = 'toolbar-button fps-unlimited';
         // 必要なら currentFpsLimitMode の初期値に応じて active クラスも設定
    }
    // インベントリはCSSで初期非表示になっている想定

    console.log("[UI] UIインタラクション初期化完了。");
}