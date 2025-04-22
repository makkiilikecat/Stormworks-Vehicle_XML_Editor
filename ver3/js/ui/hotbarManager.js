/**
 * @fileoverview 下部ホットバーのアイテム選択と状態表示を管理します。
 */

import { setPlacementBlock, getCurrentPlacementBlockId } from '../state/placementState.js';

// --- DOM要素キャッシュ ---
let hotbarElement = null;
let hotbarItems = []; // ホットバーアイテム要素の配列

/**
 * ホットバーの初期化、イベントリスナー設定を行います。
 */
export function initializeHotbar() {
    console.log("[HotbarManager] 初期化中...");
    hotbarElement = document.getElementById('bottom-toolbar');
    if (!hotbarElement) {
        console.error("[HotbarManager] ホットバー要素 (#bottom-toolbar) が見つかりません。");
        return;
    }
    // ホットバー内の .hotbar-item 要素を取得
    hotbarItems = Array.from(hotbarElement.querySelectorAll('.hotbar-item'));
    if (hotbarItems.length === 0) {
        console.warn("[HotbarManager] ホットバーアイテムが見つかりません。");
        // 将来的に動的に生成する場合はここで処理
    }

    // --- イベントリスナー設定 ---
    // 各ホットバーアイテムにクリックリスナーを設定
    hotbarItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            const blockId = item.dataset.blockId;
            const blockName = item.title || `アイテム ${index + 1}`; // titleがなければ仮の名前
            if (blockId) {
                // placementState を更新する
                setPlacementBlock(blockId, blockName);
                // 通常モードへの強制切り替えは行わない (呼び出し元で制御)
                // setMode('NORMAL');
                // アクティブ表示は placementblockchanged イベントで行う
            } else {
                console.warn("[HotbarManager] クリックされたアイテムに blockId がありません。", item);
            }
        });
    });

    // 配置ブロック変更イベントをリッスンしてアクティブ表示を更新
    document.addEventListener('placementblockchanged', handlePlacementBlockChange);

    // 初期のアクティブ表示を設定
    updateActiveHotbarItem();

    console.log("[HotbarManager] 初期化完了。");
}

/**
 * 配置ブロック変更イベントのハンドラ。ホットバーのアクティブ表示を更新します。
 * @param {CustomEvent} event - placementblockchanged イベントオブジェクト。
 * @private
 */
function handlePlacementBlockChange(event) {
    console.log("[HotbarManager] 配置ブロック変更を検知、ホットバー表示を更新します。");
    updateActiveHotbarItem();
}

/**
 * 現在の配置ブロックIDに基づいて、ホットバーアイテムのアクティブ表示を更新します。
 * @private
 */
function updateActiveHotbarItem() {
    const currentBlockId = getCurrentPlacementBlockId();
    hotbarItems.forEach(item => {
        item.classList.toggle('active', item.dataset.blockId === currentBlockId);
    });
     console.log(`[HotbarManager] ホットバーのアクティブ表示を更新 (${currentBlockId})`);
}