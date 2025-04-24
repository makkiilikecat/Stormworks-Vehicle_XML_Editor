/**
 * @fileoverview 各UIコンポーネントの初期化処理を統括して呼び出します。
 * main.js から呼び出されることを想定しています。
 *
 * 【主な変更点 v4 (UI分割対応)】
 * - uiInteractions.js の削除に伴い、その初期化呼び出しを削除。
 * - 新しく分割された各UIハンドラ (TopToolbar, LeftToolbar, RightToolbar, BottomToolbar, InventoryPanel, XmlPanel) の
 * 初期化関数をインポートし、呼び出すように修正。
 * - 既存の initializeInventory, setupXmlEditListeners の呼び出しを削除 (新しいハンドラに統合されたため)。
 */

// --- 新しいUIハンドラの初期化関数をインポート ---
import { initializeTopToolbar } from './topToolbarHandler.js';
import { initializeLeftToolbar } from './leftToolbarHandler.js';
import { initializeRightToolbar } from './rightToolbarHandler.js';
import { initializeBottomToolbar } from './bottomToolbarHandler.js';
import { initializeInventoryPanel } from './inventoryPanelHandler.js'; // 旧 initializeInventory
import { initializeXmlPanel } from './xmlPanelHandler.js';           // 旧 setupXmlEditListeners を含む
import { initializeHotbar } from './hotbarManager.js';             // ホットバーは変更なし (そのまま)

// --- 他のモジュールから必要な関数をインポート ---
// setPlacementBlock は inventoryPanelHandler 内で直接参照する形に変更したので不要
// import { setPlacementBlock } from '../state/placementState.js';

/**
 * 全てのUI関連モジュールを初期化します。
 * main.js の init 関数から呼び出されることを想定しています。
 * @param {object} appState - アプリケーション状態オブジェクト。
 */
export function initializeAllUI(appState) {
    console.log("[UIInitializer] UIモジュールの初期化を開始します (分割後)...");

    try {
        // 分割された各UIハンドラの初期化関数を呼び出す
        initializeTopToolbar(appState);
        initializeLeftToolbar(appState);
        initializeRightToolbar(appState);
        initializeBottomToolbar(appState);
        initializeInventoryPanel(appState); // 旧 initializeInventory
        initializeXmlPanel(appState);       // 旧 setupXmlEditListeners 含む

        // ホットバーの初期化 (変更なし)
        initializeHotbar();

        console.log("[UIInitializer] UIモジュールの初期化が完了しました (分割後)。");

    } catch (error) {
        console.error("[UIInitializer] UI初期化中にエラーが発生しました:", error);
    }
}