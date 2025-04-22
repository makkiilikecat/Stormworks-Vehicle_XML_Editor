/**
 * @fileoverview インベントリパネルの表示内容生成、検索フィルタリング、アイテム選択、
 * および配置ブロック状態との表示同期を管理します。
 * uiInitializer.js から initializeInventory が呼び出されます。
 */

// ブロック定義と配置状態設定/取得関数をインポート
import { getAllBlockDefinitions } from '../data/blockDefinitions.js';
import { setPlacementBlock, getCurrentPlacementBlockId } from '../state/placementState.js';

// --- DOM要素キャッシュ ---
let inventoryContentElement = null; // インベントリのコンテンツエリア (.inventory-content)
let inventorySearchInput = null;    // 検索入力フィールド (#inventory-search)
let inventoryPanelElement = null;   // インベントリパネル全体 (#inventory-panel)

// --- 状態 ---
/** @type {Array<HTMLElement>} 生成された全インベントリアイテム要素 (.inventory-item) の参照配列 */
let allInventoryItems = [];
/** @type {Function | null} アイテム選択時に呼び出すコールバック関数 (placementState.setPlacementBlock) */
let itemSelectedCallback = null;

/**
 * インベントリパネルの初期化を行います。
 * HTMLコンテンツの生成、検索機能、アイテム選択のイベントリスナー設定、
 * および配置ブロック状態との表示同期を行います。
 * @param {Function} onItemSelected - アイテム選択時に呼び出すコールバック関数。
 */
export function initializeInventory(onItemSelected) {
    console.log("[InventoryManager] 初期化中...");
    // 必要なDOM要素を取得
    inventoryContentElement = document.querySelector('#inventory-panel .inventory-content');
    inventorySearchInput = document.getElementById('inventory-search');
    inventoryPanelElement = document.getElementById('inventory-panel');
    itemSelectedCallback = onItemSelected; // コールバック関数を保持

    // 要素が見つからない場合はエラーを出して終了
    if (!inventoryContentElement || !inventorySearchInput || !inventoryPanelElement) {
        console.error("[InventoryManager] インベントリ関連のDOM要素が見つかりません。初期化を中断します。");
        return;
    }

    // 1. blockDefinitions からインベントリのHTMLを生成・設定
    populateInventory();

    // 2. 検索入力イベントリスナーを設定
    inventorySearchInput.addEventListener('input', handleInventorySearch);

    // 3. 配置ブロック変更イベントをリッスンしてアクティブ表示を更新
    document.addEventListener('placementblockchanged', handlePlacementBlockChange);

    // 4. 初期のアクティブ表示を設定
    updateActiveInventoryItem();

    console.log("[InventoryManager] 初期化完了。");
}

/**
 * blockDefinitions に基づいてインベントリのHTMLコンテンツを生成・挿入し、
 * 各アイテムにクリックイベントリスナーを設定します。
 * @private
 */
function populateInventory() {
    // コンテンツ要素やコールバックがなければ処理中断
    if (!inventoryContentElement || !itemSelectedCallback) return;

    const definitions = getAllBlockDefinitions();
    const blocksByTag = {}; // タグごとのブロック分類用

    // ブロック定義をループしてタグごとに分類
    for (const blockId in definitions) {
        if (blockId === 'default') continue; // 'default' は表示しない
        const def = definitions[blockId];
        const tags = def.tags && def.tags.length > 0 ? def.tags : ['その他']; // タグがなければ 'その他'
        tags.forEach(tag => {
            if (!blocksByTag[tag]) blocksByTag[tag] = [];
            blocksByTag[tag].push({ id: blockId, ...def });
        });
    }

    // HTML文字列の組み立て
    let html = '';
    const sortedTags = Object.keys(blocksByTag).sort((a, b) => a.localeCompare(b, 'ja'));

    sortedTags.forEach(tag => {
        // カテゴリ見出しとグリッド開始
        html += `<div class="inventory-tag-group" data-tag="${tag}"><h4>${tag}</h4><div class="inventory-grid">`;
        // ブロック名でソート
        const sortedBlocks = blocksByTag[tag].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        // 各アイテムHTML生成
        sortedBlocks.forEach(blockDef => {
            const iconHtml = blockDef.icon ? `<span class="icon-text">${blockDef.icon}</span>` : blockDef.name.substring(0, 1);
            html += `<div class="inventory-item" data-inv-id="${blockDef.id}" title="${blockDef.name}">${iconHtml}</div>`;
        });
        html += `</div></div>`; // グリッドとグループ終了
    });

    // HTML挿入
    inventoryContentElement.innerHTML = html;

    // --- イベントリスナー設定 & 参照保持 ---
    allInventoryItems = []; // 配列クリア
    inventoryContentElement.querySelectorAll('.inventory-item').forEach(item => {
        allInventoryItems.push(item); // 全アイテム参照を保持
        // クリックリスナー設定
        item.addEventListener('click', (event) => {
            const blockId = item.dataset.invId;
            const blockName = item.title;
            if (blockId && blockName && itemSelectedCallback) {
                // コールバック呼び出し (setPlacementBlock) -> これで placementblockchanged が発行される
                itemSelectedCallback(blockId, blockName);
                console.log(`[InventoryManager] アイテムクリック -> ${blockName} (${blockId}) を選択`);
                // ここで直接 active クラスを操作しない (イベントハンドラに任せる)
            }
            event.stopPropagation();
        });
    });
}

/**
 * 検索入力イベントハンドラ。アイテムとカテゴリグループをフィルタリングします。
 * @private
 */
function handleInventorySearch() {
    if (!inventorySearchInput || allInventoryItems.length === 0 || !inventoryContentElement) return;
    const searchTerm = inventorySearchInput.value.toLowerCase().trim();

    // アイテムの表示/非表示切り替え
    allInventoryItems.forEach(item => {
        const itemId = item.dataset.invId || '';
        const itemTitle = item.title || itemId;
        const isMatch = searchTerm === '' || itemId.toLowerCase().includes(searchTerm) || itemTitle.toLowerCase().includes(searchTerm);
        item.style.display = isMatch ? 'flex' : 'none';
    });

    // カテゴリグループの表示/非表示切り替え
    inventoryContentElement.querySelectorAll('.inventory-tag-group').forEach(group => {
        const hasVisibleItems = group.querySelector('.inventory-item:not([style*="display: none"])');
        group.style.display = hasVisibleItems ? 'block' : 'none';
    });
}

/**
 * 配置ブロック変更イベント (`placementblockchanged`) のハンドラ。
 * インベントリのアクティブ表示を更新します。
 * @param {CustomEvent} event - placementblockchanged イベントオブジェクト。
 * @private
 */
function handlePlacementBlockChange(event) {
    // イベント詳細から新しいブロックIDを取得することも可能: const newBlockId = event.detail.newBlockId;
    console.log("[InventoryManager] 配置ブロック変更を検知、インベントリ表示を更新します。");
    updateActiveInventoryItem();
}

/**
 * 現在の配置ブロックIDに基づいて、インベントリアイテムのアクティブ表示 (`active` クラス) を更新します。
 * @private
 */
function updateActiveInventoryItem() {
    if (allInventoryItems.length === 0) return; // アイテム要素がなければ何もしない

    const currentBlockId = getCurrentPlacementBlockId(); // 現在選択中のIDを取得
    console.log(`[InventoryManager] インベントリアクティブ表示更新: ${currentBlockId}`);
    allInventoryItems.forEach(item => {
        // アイテムの data-inv-id が現在のIDと一致するかで active クラスを切り替え
        item.classList.toggle('active', item.dataset.invId === currentBlockId);
    });
}