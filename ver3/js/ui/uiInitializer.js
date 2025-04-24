/**
 * @fileoverview 各UIコンポーネントの初期化処理を統括して呼び出します。
 * main.js から呼び出されることを想定しています。
 * 【主な変更点】
 * - xmlEditPanelHandler から setupXmlEditListeners をインポートして呼び出す。
 */

// --- 必要な初期化関数をインポート ---
import { initializeUIInteractions } from './uiInteractions.js';
import { initializeInventory } from './inventoryManager.js';
import { initializeHotbar } from './hotbarManager.js';
// ★追加: XML編集パネルのイベントリスナー設定関数
import { setupXmlEditListeners } from './xmlEditPanelHandler.js';
// --- 他のモジュールから必要な関数をインポート ---
import { setPlacementBlock } from '../state/placementState.js';

/**
 * 全てのUI関連モジュールを初期化します。
 * main.js の init 関数から呼び出されることを想定しています。
 * @param {object} appState - アプリケーション状態オブジェクト。
 */
export function initializeAllUI(appState) {
    console.log("[UIInitializer] UIモジュールの初期化を開始します...");

    try {
        // 基本的なUI操作の初期化
        initializeUIInteractions(appState);

        // インベントリの初期化
        initializeInventory(setPlacementBlock);

        // ホットバーの初期化
        initializeHotbar();

        // ★追加: XML編集パネルのイベントリスナー設定
        setupXmlEditListeners();

        console.log("[UIInitializer] UIモジュールの初期化が完了しました。");

    } catch (error) {
        console.error("[UIInitializer] UI初期化中にエラーが発生しました:", error);
    }
}