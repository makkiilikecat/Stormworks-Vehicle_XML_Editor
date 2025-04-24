/**
 * @fileoverview カスタムイベントリスナーを設定し、UIの更新をトリガーする。
 */

import { updateXmlEditUI } from '../ui/xmlEditPanelContent.js'; // パス確認
import { getCurrentMode, EditMode } from '../state/editMode.js';

/**
 * UI更新に関連するカスタムイベントリスナーを初期化します。
 * @param {object} appState - アプリケーションの状態オブジェクト (現状未使用だが必要に応じて渡す)。
 */
export function initializeUIUpdateHandlers(appState) {
    console.log("Initializing UI update handlers...");

    // 選択状態変更時 (selectionHandler から発行 or main.js のクリック後など)
    // 現状は main.js の handleCanvasPointerUp/Down や clearSelection から直接呼んでいる

    // アンドゥ/リドゥ実行後
    document.addEventListener('historyundone', handleHistoryChange);
    document.addEventListener('historyredone', handleHistoryChange);

    // ブロック変形完了後 (dragTransformHandler から発行)
    document.addEventListener('blocktransformupdated', handleHistoryChange);

    // 配置ブロック変更時 (placementState から発行 - TODO: イベント発行機能追加)
    // document.addEventListener('placementblockchange', updatePlacementIndicator);

     console.log("UI update handlers initialized.");
}

/**
 * 履歴変更やブロック変形完了時にUIを更新する共通ハンドラ。
 * @private
 */
function handleHistoryChange() {
    console.log("History changed or transform updated, updating UI.");
    // 現在XML編集モードであれば、パネルの内容を更新
    if (getCurrentMode() === EditMode.XML_EDIT) {
        updateXmlEditUI();
    }
    // 必要であれば他のUI更新もここで行う
    // updatePlacementIndicator();
}