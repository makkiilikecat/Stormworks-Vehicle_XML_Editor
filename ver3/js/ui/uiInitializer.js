/**
 * @fileoverview 各UIコンポーネントの初期化処理を統括して呼び出します。
 */

// --- 必要な初期化関数をインポート ---
import { initializeUIInteractions } from './uiInteractions.js';
import { initializeInventory } from './inventoryManager.js';
// import { initializeXmlEditPanel } from './xmlEditUI.js'; // 必要に応じて追加
// import { initializeModeIndicator } from './modeIndicator.js'; // 必要に応じて追加

// --- 状態設定関数など、他のモジュールから必要なものをインポート ---
import { setPlacementBlock } from '../state/placementState.js'; // inventoryManagerに渡すため

/**
 * 全てのUI関連モジュールを初期化します。
 * main.js の init 関数から呼び出されることを想定しています。
 * @param {object} appState - アプリケーション状態オブジェクト。一部のUI初期化で必要になる場合がある。
 */
export function initializeAllUI(appState) {
    console.log("[UIInitializer] UIモジュールの初期化を開始します...");

    try {
        // ツールバーボタンやパネル開閉などの基本的なUI操作
        initializeUIInteractions(appState);

        // インベントリパネルの内容生成とイベントリスナー設定
        // 引数として、アイテム選択時に呼び出すコールバック関数を渡す
        initializeInventory(setPlacementBlock);

        // XML編集パネルの初期化 (必要なら)
        // initializeXmlEditPanel(appState);

        // モードインジケータの初期化 (これも分離する場合)
        // initializeModeIndicator();

        // TODO: 他に必要なUIコンポーネントの初期化呼び出しを追加

        console.log("[UIInitializer] UIモジュールの初期化が完了しました。");

    } catch (error) {
        console.error("[UIInitializer] UI初期化中にエラーが発生しました:", error);
        // エラーが発生しても処理を止めない方が良い場合もある
    }
}