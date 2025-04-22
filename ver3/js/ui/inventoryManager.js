/**
 * @fileoverview インベントリパネルの表示内容生成、検索フィルタリング、アイテム選択を管理します。
 * uiInitializer.js から initializeInventory が呼び出されます。
 */

// ブロック定義と配置状態設定関数をインポート
import { getAllBlockDefinitions } from '../data/blockDefinitions.js';
// import { setPlacementBlock } from '../state/placementState.js'; // <<< コールバックとして受け取る

// --- DOM要素キャッシュ ---
let inventoryContentElement = null;
let inventorySearchInput = null;
let inventoryPanelElement = null; // パネル自体の参照も保持 (フィルタリングでの表示制御用)

// --- 状態 ---
/** @type {Array<HTMLElement>} 生成された全インベントリアイテム要素の参照配列 */
let allInventoryItems = [];
/** @type {Function | null} アイテム選択時に呼び出すコールバック関数 */
let itemSelectedCallback = null;

/**
 * インベントリパネルの初期化、DOM生成、イベントリスナー設定を行います。
 * @param {Function} onItemSelected - アイテム選択時に呼び出すコールバック関数 (通常は placementState.setPlacementBlock)。
 */
export function initializeInventory(onItemSelected) {
    console.log("[InventoryManager] 初期化中...");
    inventoryContentElement = document.querySelector('#inventory-panel .inventory-content');
    inventorySearchInput = document.getElementById('inventory-search');
    inventoryPanelElement = document.getElementById('inventory-panel'); // パネル要素取得
    itemSelectedCallback = onItemSelected; // コールバックを保持

    if (!inventoryContentElement || !inventorySearchInput || !inventoryPanelElement) {
        console.error("[InventoryManager] インベントリ関連のDOM要素が見つかりません。");
        return;
    }

    // ブロック定義からインベントリのHTMLを生成・設定
    populateInventory();

    // 検索入力イベントリスナーを設定
    inventorySearchInput.addEventListener('input', handleInventorySearch);

    console.log("[InventoryManager] 初期化完了。");
}

/**
 * blockDefinitions に基づいてインベントリのHTMLコンテンツを生成・挿入し、
 * イベントリスナーを設定します。
 * @private
 */
function populateInventory() {
    if (!inventoryContentElement || !itemSelectedCallback) return;

    const definitions = getAllBlockDefinitions();
    // タグごとにブロックをグループ化するためのオブジェクト
    const blocksByTag = {};

    // ブロック定義をループしてタグごとに分類
    for (const blockId in definitions) {
        // 'default' 定義はインベントリに表示しない
        if (blockId === 'default') continue;

        const def = definitions[blockId];
        // タグ情報がない場合は 'その他' タグに分類
        const tags = def.tags && def.tags.length > 0 ? def.tags : ['その他'];

        tags.forEach(tag => {
            if (!blocksByTag[tag]) {
                blocksByTag[tag] = []; // タグがなければ新しい配列を作成
            }
            // ブロックIDもデータに含めて配列に追加
            blocksByTag[tag].push({ id: blockId, ...def });
        });
    }

    // HTML文字列を組み立てる
    let html = '';
    // タグ名でアルファベット順にソートして表示
    const sortedTags = Object.keys(blocksByTag).sort((a, b) => a.localeCompare(b, 'ja')); // 日本語考慮ソート

    sortedTags.forEach(tag => {
        // カテゴリ見出しとグリッドコンテナ開始
        html += `
            <div class="inventory-tag-group" data-tag="${tag}">
                <h4>${tag}</h4>
                <div class="inventory-grid">
        `;
        // カテゴリ内のブロックをブロック名でソート
        const sortedBlocks = blocksByTag[tag].sort((a, b) => a.name.localeCompare(b.name, 'ja'));

        // 各ブロックアイテムのHTMLを生成
        sortedBlocks.forEach(blockDef => {
            // アイコンがあればアイコンを、なければ名前の最初の文字を表示
            const iconHtml = blockDef.icon ? `<span class="icon-text">${blockDef.icon}</span>` : blockDef.name.substring(0, 1);
            // data-inv-id属性にブロックID、title属性にブロック名を設定
            html += `
                <div class="inventory-item" data-inv-id="${blockDef.id}" title="${blockDef.name}">
                    ${iconHtml}
                </div>
            `;
        });
        // グリッドコンテナ終了
        html += `
                </div>
            </div>
        `;
    });

    // 生成したHTMLをインベントリのコンテンツエリアに挿入
    inventoryContentElement.innerHTML = html;

    // --- イベントリスナー設定 & 参照保持 ---
    allInventoryItems = []; // 既存の参照をクリア
    inventoryContentElement.querySelectorAll('.inventory-item').forEach(item => {
        allInventoryItems.push(item); // フィルタリング用に全てのアイテム参照を保持

        // 各アイテムにクリックイベントリスナーを設定
        item.addEventListener('click', (event) => {
            const blockId = item.dataset.invId;
            const blockName = item.title;
            if (blockId && blockName && itemSelectedCallback) {
                // 他のアイテムのアクティブ状態を解除
                allInventoryItems.forEach(el => el.classList.remove('active'));
                // クリックされたアイテムをアクティブにする
                item.classList.add('active');
                // 登録されたコールバック関数（setPlacementBlock）を呼び出す
                itemSelectedCallback(blockId, blockName);
                console.log(`[InventoryManager] アイテム選択: ${blockName} (${blockId})`);
                // TODO: ダブルタップでのインベントリ非表示は uiInteractions.js に任せるか要調整
            }
            event.stopPropagation();
        });
    });
}

/**
 * 検索入力イベントハンドラ。入力値に基づいてアイテムとカテゴリをフィルタリングします。
 * @private
 */
function handleInventorySearch() {
    if (!inventorySearchInput || allInventoryItems.length === 0 || !inventoryContentElement) return;

    const searchTerm = inventorySearchInput.value.toLowerCase().trim(); // 入力値を整形
    // console.log(`[InventoryManager] 検索実行: "${searchTerm}"`);

    // --- 各アイテムの表示/非表示を切り替え ---
    allInventoryItems.forEach(item => {
        const itemId = item.dataset.invId || '';
        const itemTitle = item.title || itemId;
        // ID または 名前に検索語が含まれているか (検索語が空なら常にtrue)
        const isMatch = searchTerm === '' ||
                        itemId.toLowerCase().includes(searchTerm) ||
                        itemTitle.toLowerCase().includes(searchTerm);
        // マッチすれば表示(flex)、しなければ非表示(none)
        item.style.display = isMatch ? 'flex' : 'none';
    });

    // --- アイテムが一つもないカテゴリ見出しを非表示にする ---
    inventoryContentElement.querySelectorAll('.inventory-tag-group').forEach(group => {
        // グループ内で表示されている('.inventory-item' かつ display !== 'none')アイテムを探す
        const hasVisibleItems = group.querySelector('.inventory-item:not([style*="display: none"])');
        // 表示されているアイテムがない場合はグループ全体を非表示にする
        group.style.display = hasVisibleItems ? 'block' : 'none';
        // (タグ名自体でのフィルタリングはここでは行わない)
    });
}