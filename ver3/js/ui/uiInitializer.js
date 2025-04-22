/**
 * @fileoverview 各UIコンポーネントの初期化処理を統括して呼び出します。
 * main.js から呼び出されることを想定しています。
 */

// --- 必要な初期化関数をインポート ---
// 基本的なUIトグルやボタンのイベントリスナー設定
import { initializeUIInteractions } from './uiInteractions.js';
// インベントリパネルのコンテンツ生成とアイテム選択処理
import { initializeInventory } from './inventoryManager.js';
// ★追加: 下部ホットバーのアイテム選択処理
import { initializeHotbar } from './hotbarManager.js';
// import { initializeXmlEditPanel } from './xmlEditUI.js'; // XMLパネル専用の初期化があれば追加
// import { initializeModeIndicator } from './modeIndicator.js'; // モード表示専用の初期化があれば追加

// --- 他のモジュールから必要な関数をインポート ---
// initializeInventory に渡すコールバック関数
import { setPlacementBlock } from '../state/placementState.js';

/**
 * 全てのUI関連モジュールを初期化します。
 * main.js の init 関数から呼び出されることを想定しています。
 * @param {object} appState - アプリケーション状態オブジェクト。一部のUI初期化で必要になる場合がある。
 */
export function initializeAllUI(appState) {
    console.log("[UIInitializer] UIモジュールの初期化を開始します...");

    try {
        // ツールバーボタン (フルスクリーン, スティック表示など)、パネル開閉などの基本的なUI操作
        initializeUIInteractions(appState);

        // インベントリパネルの内容生成とアイテム選択イベントリスナー設定
        // 引数として、アイテム選択時に呼び出すコールバック関数 (setPlacementBlock) を渡す
        initializeInventory(setPlacementBlock);

        // ★追加: 下部ホットバーのアイテム選択イベントリスナー設定
        initializeHotbar();

        // TODO: 他に必要なUIコンポーネントの初期化呼び出しを追加
        // 例: XML編集パネルに特化した初期化処理など
        // initializeXmlEditPanel(appState);

        console.log("[UIInitializer] UIモジュールの初期化が完了しました。");

    } catch (error) {
        console.error("[UIInitializer] UI初期化中にエラーが発生しました:", error);
        // 必要に応じてエラー処理を追加
    }
}