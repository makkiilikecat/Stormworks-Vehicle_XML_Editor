/**
 * @fileoverview インベントリパネルの表示内容生成、検索フィルタリング、アイテム選択、
 * および配置ブロック状態との表示同期を管理します。 (旧 inventoryManager.js)
 */

// ブロック定義と配置状態設定/取得関数をインポート
import { getAllBlockDefinitions } from '../data/blockDefinitions.js';
import { setPlacementBlock, getCurrentPlacementBlockId } from '../state/placementState.js';

// --- DOM要素キャッシュ ---
let inventoryContentElement = null; // インベントリのコンテンツエリア (.inventory-content)
let inventorySearchInput = null;    // 検索入力フィールド (#inventory-search)
let inventoryPanelElement = null;   // インベントリパネル全体 (#inventory-panel)

// --- 状態 ---
let allInventoryItems = []; // HTMLElement[]
let itemSelectedCallback = null; // Function | null

/**
 * インベントリパネルの初期化を行います。(旧 initializeInventory)
 * @param {object} appStateRef - アプリケーション状態 (現状未使用だが将来のため)。
 */
export function initializeInventoryPanel(appStateRef) {
    console.log("[InventoryPanelHandler] 初期化中...");
    // 必要なDOM要素を取得
    inventoryContentElement = document.querySelector('#inventory-panel .inventory-content');
    inventorySearchInput = document.getElementById('inventory-search');
    inventoryPanelElement = document.getElementById('inventory-panel');
    itemSelectedCallback = setPlacementBlock; // ★ 配置ブロック設定関数を直接参照

    if (!inventoryContentElement || !inventorySearchInput || !inventoryPanelElement || !itemSelectedCallback) {
        console.error("[InventoryPanelHandler] インベントリ関連のDOM要素またはコールバックが見つかりません。");
        return;
    }

    populateInventory(); // HTML生成
    inventorySearchInput.addEventListener('input', handleInventorySearch); // 検索リスナー
    document.addEventListener('placementblockchanged', handlePlacementBlockChange); // 状態同期リスナー
    updateActiveInventoryItem(); // 初期アクティブ表示

    console.log("[InventoryPanelHandler] 初期化完了。");
}

/** @private インベントリHTML生成とイベントリスナー設定 */
function populateInventory() {
    if (!inventoryContentElement || !itemSelectedCallback) return;
    const definitions = getAllBlockDefinitions(); // ★ getAllBlockDefinitions を使用
    const blocksByTag = {};
    // Object.values で定義オブジェクトを直接ループ
    Object.values(definitions).forEach(def => {
        if (def.id === 'default') return; // default は除外 (idプロパティがあると仮定)
        const tags = def.tags && def.tags.length > 0 ? def.tags : ['その他'];
        tags.forEach(tag => {
            if (!blocksByTag[tag]) blocksByTag[tag] = [];
            // idプロパティは既にdefに含まれているはず
            blocksByTag[tag].push(def);
        });
    });

    let html = '';
    const sortedTags = Object.keys(blocksByTag).sort((a, b) => a.localeCompare(b, 'ja'));
    sortedTags.forEach(tag => {
        html += `<div class="inventory-tag-group" data-tag="${tag}"><h4>${tag}</h4><div class="inventory-grid">`;
        const sortedBlocks = blocksByTag[tag].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        sortedBlocks.forEach(blockDef => {
            const iconHtml = blockDef.icon ? `<span class="icon-text">${blockDef.icon}</span>` : blockDef.name.substring(0, 1);
            // blockDef.id を使用
            html += `<div class="inventory-item" data-inv-id="${blockDef.id}" title="${blockDef.name}">${iconHtml}</div>`;
        });
        html += `</div></div>`;
    });
    inventoryContentElement.innerHTML = html;

    allInventoryItems = [];
    inventoryContentElement.querySelectorAll('.inventory-item').forEach(item => {
        allInventoryItems.push(item);
        item.addEventListener('click', (event) => {
            const blockId = item.dataset.invId;
            const blockName = item.title;
            if (blockId && blockName && itemSelectedCallback) {
                itemSelectedCallback(blockId, blockName); // setPlacementBlockを呼び出す
            }
            event.stopPropagation();
        });
    });
}

/** @private 検索入力イベントハンドラ */
function handleInventorySearch() {
    if (!inventorySearchInput || allInventoryItems.length === 0 || !inventoryContentElement) return;
    const searchTerm = inventorySearchInput.value.toLowerCase().trim();
    allInventoryItems.forEach(item => {
        const itemId = item.dataset.invId || '';
        const itemTitle = item.title || itemId;
        const isMatch = searchTerm === '' || itemId.toLowerCase().includes(searchTerm) || itemTitle.toLowerCase().includes(searchTerm);
        item.style.display = isMatch ? 'flex' : 'none';
    });
    inventoryContentElement.querySelectorAll('.inventory-tag-group').forEach(group => {
        const hasVisibleItems = group.querySelector('.inventory-item:not([style*="display: none"])');
        group.style.display = hasVisibleItems ? 'block' : 'none';
    });
}

/** @private 配置ブロック変更イベントハンドラ */
function handlePlacementBlockChange(event) {
    updateActiveInventoryItem();
}

/** @private アクティブ表示更新 */
function updateActiveInventoryItem() {
    if (allInventoryItems.length === 0) return;
    const currentBlockId = getCurrentPlacementBlockId();
    allInventoryItems.forEach(item => {
        item.classList.toggle('active', item.dataset.invId === currentBlockId);
    });
}

// インベントリの表示/非表示状態を管理する関数 (bottomToolbarHandler と連携用)
// export function isInventoryVisible() { return inventoryPanelElement?.classList.contains('visible'); }
// export function setInventoryVisibility(visible) { inventoryPanelElement?.classList.toggle('visible', visible); }