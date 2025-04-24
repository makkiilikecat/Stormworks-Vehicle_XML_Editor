/**
 * @fileoverview XML編集パネルの表示/非表示を制御します。
 * 元の xmlEditUI.js から分離。
 * パネル表示時に内容更新とイベントリスナー初期化をトリガーします。
 */

// --- UI要素への参照 ---
const panel = document.getElementById('xml-edit-panel');

// --- 外部モジュールの関数 ---
// パネル表示時に内容を更新するためにインポート
import { updateXmlEditUI } from './xmlEditPanelContent.js';
// 初回表示時にイベントリスナーを設定するためにインポート
import { setupXmlEditListeners } from './xmlEditPanelHandler.js';

// --- 状態変数 ---
let isInitialized = false; // イベントリスナー初期化済みフラグ

/**
 * XML編集パネルを表示します。
 * 初回表示時にイベントリスナーを設定し、常に現在の選択状態で内容を更新します。
 */
export function showXmlEditPanel() {
    if (!panel) {
        console.error("[XmlEditPanelVisibility] #xml-edit-panel が見つかりません。");
        return;
    }
    panel.style.display = 'block';
    updateXmlEditUI(); // 分離先の関数を呼び出して内容を更新

    // イベントリスナーを初期化 (初回のみ)
    if (!isInitialized) {
        setupXmlEditListeners(); // 分離先の関数を呼び出してリスナーを設定
        isInitialized = true;
    }
}

/**
 * XML編集パネルを非表示にします。
 */
export function hideXmlEditPanel() {
    if (panel) {
        panel.style.display = 'none';
    }
}