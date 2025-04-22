/**
 * @fileoverview 新しいUI要素の基本的なインタラクション（トグル表示、モード切替など）を管理します。
 * 主に main.js から初期化され、各UI要素にイベントリスナーを設定します。
 */

// --- 状態管理と関連モジュールのインポート ---
import { setFpsLimitMode } from '../main.js'; // mainからFPS設定関数をインポート
import { setStickVisibility } from '../interactions/cameraStickHandler.js'; // スティック表示状態設定関数
import { setEditMode, EditMode } from '../state/editMode.js'; // 編集モード設定関数とモード定義
import { updateModeIndicator } from './modeIndicator.js'; // モード表示更新関数

// --- モジュール内変数 ---

/** @type {object | null} アプリケーション状態への参照 (OrbitControls などにアクセスするため) */
let appState = null;
/** @type {boolean} インベントリパネルが表示されているか */
let inventoryVisible = false;
/** @type {boolean} XML編集パネルが格納されているか */
let xmlPanelCollapsed = false;
/** @type {boolean} カメラ移動スティックが表示されているか */
let stickVisible = true; // 初期状態は表示
/** @type {number} 現在のFPS制限モード (0: Unlimited, 1: 60fps, 2: 30fps) */
let currentFpsLimitMode = 0;

// --- DOM要素キャッシュ (初期化時に設定) ---
let toggleStickButton = null;
let cameraStick = null;
let fullscreenButton = null;
let toggleXmlPanelButton = null;
let xmlEditPanel = null;
let toggleInventoryButton = null;
let inventoryPanel = null;
let inventoryOverlay = null;
let bottomToolbar = null;
let batterySaveButton = null;
/** @type {NodeListOf<HTMLButtonElement> | null} モード切替ボタンのコレクション */
let modeButtons = null;

// --- 関数 ---

/**
 * フルスクリーンモードを切り替えます。
 * ブラウザのFullscreen APIを使用します。
 * @private
 */
function toggleFullScreen() {
    // 現在フルスクリーン表示でない場合
    if (!document.fullscreenElement) {
        // フルスクリーン表示をリクエスト
        document.documentElement.requestFullscreen().catch(err => {
            // 失敗した場合のエラーハンドリング
            console.error(`フルスクリーンモードエラー: ${err.message} (${err.name})`);
            alert(`フルスクリーンモードにできませんでした。`); // ユーザーに通知
        });
        console.log("[UI] フルスクリーン有効化");
    } else {
        // 現在フルスクリーン表示の場合、解除する
        if (document.exitFullscreen) {
            document.exitFullscreen();
            console.log("[UI] フルスクリーン解除");
        }
    }
}

/**
 * カメラ移動スティックの表示/非表示を切り替えます。
 * 対応するボタンのアクティブ状態も更新します。
 * @private
 */
function toggleStickVisibility() {
     stickVisible = !stickVisible; // 表示状態を反転
     cameraStick?.classList.toggle('hidden', !stickVisible); // CSSクラスで表示/非表示
     toggleStickButton?.classList.toggle('active', stickVisible); // ボタンのアクティブ状態更新
     setStickVisibility(stickVisible); // cameraStickHandlerにも状態を通知
     console.log(`[UI] カメラ移動スティック表示: ${stickVisible}`);
     // 注意: スティック非表示時に操作中だった場合の中断処理は setStickVisibility (cameraStickHandler内) で行う想定
}

/**
 * XML編集パネルの格納/展開状態を切り替えます。
 * CSSクラス 'collapsed' を付け外しすることで実現します。
 * @private
 */
function toggleXmlPanel() {
     xmlPanelCollapsed = !xmlPanelCollapsed; // 格納状態を反転
     xmlEditPanel?.classList.toggle('collapsed', xmlPanelCollapsed); // CSSクラスをトグル
     console.log(`[UI] XMLパネル ${xmlPanelCollapsed ? '格納' : '展開'}`);
 }

/**
 * インベントリパネルの表示/非表示を切り替えます。
 * オーバーレイ表示、下部ツールバーの位置調整、カメラコントロールの有効/無効も連動します。
 * @param {boolean | null} [forceState=null] - 特定の状態に強制する場合 (true:表示, false:非表示)。nullの場合はトグル。
 * @private
 */
function toggleInventory(forceState = null) {
    const shouldBeVisible = forceState !== null ? forceState : !inventoryVisible;
    // 現在の状態と同じなら何もしない
    if (shouldBeVisible === inventoryVisible) return;

    // 各要素の表示状態を更新
    inventoryPanel?.classList.toggle('visible', shouldBeVisible);
    inventoryOverlay?.classList.toggle('visible', shouldBeVisible);
    bottomToolbar?.classList.toggle('lowered', shouldBeVisible);
    inventoryVisible = shouldBeVisible; // 状態を更新
    console.log(`[UI] インベントリ表示: ${inventoryVisible}`);

    // インベントリ表示中はカメラコントロールを無効化 (スティック操作も考慮が必要だが、一旦無視)
    if (appState?.controls) {
         const isStickDragging = false; // TODO: cameraStickHandler からドラッグ状態を取得する
         appState.controls.enabled = !inventoryVisible && !isStickDragging;
    }
}


/**
 * FPS制限モードを順次切り替え (∞ -> 60 -> 30 -> ∞)。
 * ボタンの表示を更新し、main.jsに通知します。
 * @private
 */
function cycleFpsLimit() {
    currentFpsLimitMode = (currentFpsLimitMode + 1) % 3; // モードを循環
    let buttonText = '∞';
    let buttonClass = 'fps-unlimited';
    let buttonActive = false;

    // モードに応じて表示テキストとCSSクラスを設定
    switch (currentFpsLimitMode) {
        case 1: // 60 FPS
            buttonText = '60'; buttonClass = 'fps-60'; buttonActive = true; break;
        case 2: // 30 FPS
            buttonText = '30'; buttonClass = 'fps-30'; buttonActive = true; break;
        // case 0: はデフォルト値を使用
    }

    // main.js のFPS制限設定関数を呼び出す
    setFpsLimitMode(currentFpsLimitMode);

    // ボタンの見た目を更新
    if (batterySaveButton) {
        batterySaveButton.textContent = buttonText;
        batterySaveButton.className = `toolbar-button ${buttonClass}`; // 基本クラス + モードクラス
        batterySaveButton.classList.toggle('active', buttonActive); // 制限中は active スタイル適用
    }
    console.log(`[UI] FPS制限モード変更: ${currentFpsLimitMode} (${buttonText} FPS)`);
}


/**
 * ★追加: 編集モード変更時にUI要素の状態（アクティブボタン、パネル表示など）を更新する関数。
 * main.jsのeditmodechangeイベントリスナーから呼び出されることを想定しています。
 * @param {EditMode} newMode - 新しく設定された編集モード。
 */
export function handleModeChangeUI(newMode) {
    console.log(`[UI] モード変更に伴うUI更新実行 -> ${newMode}`);

    // 1. 左ツールバーのモードボタンのアクティブ状態を更新
    //   - 現在のモードに一致する data-mode を持つボタンに 'active' クラスを付与
    //   - 他のボタンからは 'active' クラスを削除
    modeButtons?.forEach(button => {
        button.classList.toggle('active', button.dataset.mode === newMode);
    });

    // 2. 画面右上のモードインジケータのテキストを更新
    updateModeIndicator(newMode);

    // 3. XML編集パネルの表示/非表示と展開状態を制御
    const isXmlEditVisible = (newMode === EditMode.XML_EDIT);
    if (xmlEditPanel) {
        xmlEditPanel.style.display = isXmlEditVisible ? 'block' : 'none';
        // XML編集モードになったら、強制的にパネルを展開状態に戻す (collapsedクラスを削除)
        if (isXmlEditVisible && xmlPanelCollapsed) {
            toggleXmlPanel(); // 内部で collapsed クラスが外れ、状態変数も更新される
        }
    }

    // 4. 範囲選択モード専用UI（右ツールバーの一部ボタン、十字キー）の表示/非表示
    const isRangeSelectVisible = (newMode === EditMode.RANGE_SELECT);
    // '.range-only' クラスを持つ要素（ボタンや区切り線）の表示を切り替え
    document.querySelectorAll('.range-only').forEach(el => {
        // ボタン類は 'flex', 区切り線(HR)は 'block' で表示、それ以外は 'none'
        el.style.display = isRangeSelectVisible ? (el.tagName === 'HR' ? 'block' : 'flex') : 'none';
    });
    // 十字キーの表示を切り替え
    const rangeDpad = document.getElementById('range-adjust-dpad');
    if (rangeDpad) {
        rangeDpad.style.display = isRangeSelectVisible ? 'grid' : 'none';
    }

    // TODO: 必要に応じて他のモード依存UIの表示制御を追加
    // 例: ペイントモード用のカラーパレットなど
}


// --- 初期化関数 ---

/**
 * このモジュールで扱うUI要素への参照を取得し、イベントリスナーを設定します。
 * @param {object} appStateRefParam - アプリケーション状態オブジェクトへの参照。
 */
export function initializeUIInteractions(appStateRefParam) {
    console.log("[UI] UIインタラクション初期化中...");
    appState = appStateRefParam; // appState への参照を保持

    // --- DOM要素を取得 ---
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
    // モードボタン群を取得
    modeButtons = document.querySelectorAll('#left-toolbar .mode-button');

    // --- イベントリスナー設定 ---
    fullscreenButton?.addEventListener('click', toggleFullScreen);
    toggleStickButton?.addEventListener('click', toggleStickVisibility);
    toggleXmlPanelButton?.addEventListener('click', toggleXmlPanel);
    toggleInventoryButton?.addEventListener('click', () => toggleInventory());
    inventoryOverlay?.addEventListener('click', () => toggleInventory(false)); // オーバーレイクリックで閉じる
    batterySaveButton?.addEventListener('click', cycleFpsLimit);

    // ★追加: モードボタンにクリックリスナーを設定
    modeButtons?.forEach(button => {
        button.addEventListener('click', () => {
            const modeToSet = button.dataset.mode; // data-mode属性からモード名を取得
            if (modeToSet && Object.values(EditMode).includes(modeToSet)) {
                // editMode.js の setEditMode を呼び出してアプリケーションの状態を変更
                setEditMode(modeToSet);
                // UIの更新は 'editmodechange' イベントリスナー (main.js またはこのファイル内で設定) に任せる
            } else {
                console.warn(`[UI] 無効なモードがボタンに設定されています: ${modeToSet}`);
            }
        });
    });

    // --- 初期状態設定 ---
    cameraStick?.classList.toggle('hidden', !stickVisible);
    toggleStickButton?.classList.toggle('active', stickVisible);
    xmlEditPanel?.classList.toggle('collapsed', xmlPanelCollapsed);
    // FPSボタン初期表示
    if(batterySaveButton){
         batterySaveButton.textContent = '∞';
         batterySaveButton.className = 'toolbar-button fps-unlimited';
    }
    // handleModeChangeUI(getCurrentMode()); // 初期モードのUI反映はmain.jsのinitで行う

    console.log("[UI] UIインタラクション初期化完了。");
}