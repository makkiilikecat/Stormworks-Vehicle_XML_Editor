import { setPlacementBlock, getCurrentPlacementBlockName } from '../state/placementState.js';

// UI要素への参照
const blockSelectButtons = document.querySelectorAll('.block-select-button');
const currentPlacementBlockElement = document.getElementById('current-placement-block');

/**
 * インベントリUI（ブロック選択ボタン）のイベントリスナーを設定します。
 */
export function setupInventoryUI() {
    blockSelectButtons.forEach(button => {
        button.addEventListener('click', () => {
            const blockId = button.dataset.blockId; // data-block-id属性からID取得
            const blockName = button.textContent;   // ボタンのテキストを名前として使用
            setPlacementBlock(blockId, blockName);
            updatePlacementIndicator(); // 選択中表示を更新
        });
    });

    // 初期表示を更新
    updatePlacementIndicator();
}

/**
 * 現在選択中の配置ブロック表示を更新します。
 */
export function updatePlacementIndicator() {
     if (currentPlacementBlockElement) {
        currentPlacementBlockElement.textContent = `選択中: ${getCurrentPlacementBlockName()}`;
     }
}

// 初期化時にUI設定を実行するようにリスナーを追加してもよいし、main.jsから呼び出してもよい
// document.addEventListener('DOMContentLoaded', setupInventoryUI); // 例