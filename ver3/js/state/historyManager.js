// historyManager.js
// アンドゥ・リドゥのスタック管理と、アクション実行の呼び出しを担当します。

import { executeUndo, executeRedo } from './historyActions.js'; // アクション実行ロジックをインポート
import { clearBlocks, renderBlocks } from '../rendering/blockRenderer.js'; // 再描画用

// --- 定数 ---
const MAX_HISTORY_SIZE = 100; // 保持する履歴の最大数

// --- 状態変数 ---
const undoStack = []; // 元に戻す操作の履歴
const redoStack = []; // やり直す操作の履歴

// --- 外部モジュールへの参照 (main.jsから設定) ---
let currentScene = null;
let currentLoadedBlocks = null;

/**
 * HistoryManagerで使用するシーンとブロックデータ配列への参照を設定します。
 * main.jsの初期化時やファイル読み込み時に呼び出されます。
 * @param {THREE.Scene} scene - 操作対象のシーン。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列。
 */
export function setupHistoryManager(scene, loadedBlocks) {
    currentScene = scene;
    currentLoadedBlocks = loadedBlocks;
    // 初期化時にスタックをクリア
    undoStack.length = 0;
    redoStack.length = 0;
    console.log("HistoryManager initialized.");
}

/**
 * 新しいアクション（操作履歴）をアンドゥスタックに追加します。
 * リドゥスタックはクリアされます。
 * @param {object} action - 履歴に追加するアクションオブジェクト。
 * 例: { type: 'ADD_BLOCK', blockData: BlockData }
 * { type: 'DELETE_BLOCK', blockData: CopiedBlockData }
 * { type: 'TRANSFORM_BLOCKS', transformations: [...] }
 * { type: 'SET_PROPERTIES', changes: [...] }
 */
export function addAction(action) {
    if (!currentScene || !currentLoadedBlocks) {
        console.error("HistoryManagerが初期化されていません。setupHistoryManagerを呼び出してください。");
        return;
    }
    undoStack.push(action);
    // スタックサイズ制限
    if (undoStack.length > MAX_HISTORY_SIZE) {
        undoStack.shift(); // 古いものから削除
    }
    // 新しい操作が行われたら、やり直し履歴はクリア
    if (redoStack.length > 0) {
         console.log("Clearing redo stack.");
         redoStack.length = 0;
    }
    console.log('Action added:', action.type, '- Undo stack size:', undoStack.length);
    // 必要なら、履歴が追加されたことを示すイベントを発行
    // document.dispatchEvent(new CustomEvent('historyupdated'));
}

/**
 * 直前の操作を元に戻します (アンドゥ)。
 * 実際の操作は historyActions.js に委譲し、その後シーンを再描画します。
 */
export function undo() {
    if (undoStack.length === 0) {
        console.log("Undo stack is empty.");
        return; // 元に戻す操作がない
    }
    if (!currentScene || !currentLoadedBlocks) {
         console.error("HistoryManager not initialized for Undo.");
         return; // 未初期化
    }

    const action = undoStack.pop(); // スタックから最新のアクションを取り出す

    // historyActionsに実際のUndo処理を依頼
    const success = executeUndo(action, currentLoadedBlocks, currentScene);

    if (success) {
        // 成功したらシーン全体を再描画 (メッシュの再生成/更新を含む)
        // TODO: パフォーマンスが問題になる場合は、差分更新を検討
        clearBlocks(currentScene);
        renderBlocks(currentScene, currentLoadedBlocks);

        // 元に戻した操作をリドゥスタックに追加
        redoStack.push(action);
        console.log('Undo successful. Redo stack size:', redoStack.length);
        // アンドゥ操作が完了したことを示すイベントを発行 (UI更新などに利用)
        document.dispatchEvent(new CustomEvent('historyundone', { detail: { action } }));
    } else {
        // 失敗したアクションはスタックに戻さない方が安全かもしれない
        console.warn("Undo failed for action:", action.type);
        // undoStack.push(action); // スタックに戻すと無限ループのリスク
    }
}

/**
 * 元に戻した操作をやり直します (リドゥ)。
 * 実際の操作は historyActions.js に委譲し、その後シーンを再描画します。
 */
export function redo() {
    if (redoStack.length === 0) {
        console.log("Redo stack is empty.");
        return; // やり直す操作がない
    }
     if (!currentScene || !currentLoadedBlocks) {
         console.error("HistoryManager not initialized for Redo.");
         return; // 未初期化
     }

    const action = redoStack.pop(); // リドゥスタックからアクションを取り出す

    // historyActionsに実際のRedo処理を依頼
    const success = executeRedo(action, currentLoadedBlocks, currentScene);

    if (success) {
        // 成功したらシーン全体を再描画
        clearBlocks(currentScene);
        renderBlocks(currentScene, currentLoadedBlocks);

        // やり直した操作をアンドゥスタックに戻す
        undoStack.push(action);
        console.log('Redo successful. Undo stack size:', undoStack.length);
        // リドゥ操作が完了したことを示すイベントを発行
         document.dispatchEvent(new CustomEvent('historyredone', { detail: { action } }));
    } else {
        console.warn("Redo failed for action:", action.type);
        // redoStack.push(action); // スタックに戻さない
    }
}