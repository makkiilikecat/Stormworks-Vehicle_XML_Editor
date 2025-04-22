/**
 * @fileoverview アンドゥ・リドゥ機能の履歴スタック管理と実行を担当します。
 * 実際の操作実行は historyActions.js に委譲します。
 *
 * 依存関係:
 * - historyActions.js: executeUndo, executeRedo をインポートして使用。
 * - blockRenderer.js: clearBlocks, renderBlocks をインポートしてシーン再描画に使用。
 * - main.js: setupHistoryManager で初期化され、シーンとブロックリストへの参照を受け取る。
 * - 各アクション実行モジュール (blockActions, rotationHandler, xmlEditUI等): addAction をインポートして使用。
 */

import { executeUndo, executeRedo } from './historyActions.js'; // <<< アクション実行ロジックをインポート
import { clearBlocks, renderBlocks } from '../rendering/blockRenderer.js'; // <<< シーン再描画用

// --- 定数 ---

/** 保持する履歴の最大数 */
const MAX_HISTORY_SIZE = 100;

// --- 状態変数 ---

/** 元に戻す操作の履歴を保持するスタック */
const undoStack = [];
/** やり直す操作の履歴を保持するスタック */
const redoStack = [];

/** 操作対象のThree.jsシーンへの参照 */
let currentScene = null;
/** 現在編集中のブロックデータ配列への参照 */
let currentLoadedBlocks = null;

// --- 初期化 ---

/**
 * HistoryManagerで使用するシーンとブロックデータ配列への参照を設定し、履歴を初期化します。
 * アプリケーション初期化時やファイル読み込み時に main.js から呼び出す必要があります。
 * @param {THREE.Scene} scene - 操作対象のシーン。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列。
 */
export function setupHistoryManager(scene, loadedBlocks) {
    console.log("Initializing History Manager...");
    if (!scene || !Array.isArray(loadedBlocks)) {
        console.error("HistoryManager初期化失敗: 無効な引数です。");
        return;
    }
    currentScene = scene;
    currentLoadedBlocks = loadedBlocks;
    // 初期化時にスタックをクリア
    undoStack.length = 0;
    redoStack.length = 0;
    console.log("History Manager initialized. Undo/Redo stacks cleared.");
}

// --- 履歴操作 ---

/**
 * 新しいアクション（操作履歴）をアンドゥスタックに追加します。
 * 履歴が追加されると、リドゥスタックはクリアされます。
 * @param {object} action - 履歴に追加するアクションオブジェクト。
 * 最低限 `type` プロパティを持つ必要があります。
 * 例: { type: 'ADD_BLOCK', blockData: BlockData }
 * { type: 'DELETE_BLOCK', blockData: CopiedBlockData }
 * { type: 'TRANSFORM_GROUP', transformations: [...] }
 * { type: 'SET_PROPERTIES', changes: [...] }
 */
export function addAction(action) {
    // 初期化チェック
    if (!currentScene || !currentLoadedBlocks) {
        console.error("HistoryManagerが初期化されていません。アクションを追加できません。");
        return;
    }
    if (!action || !action.type) {
        console.error("無効なアクションオブジェクトです。'type' プロパティが必要です。", action);
        return;
    }

    // アンドゥスタックに追加
    undoStack.push(action);

    // スタックサイズが最大値を超えたら、古いものから削除
    if (undoStack.length > MAX_HISTORY_SIZE) {
        undoStack.shift();
        console.log("Undo stack reached max size, oldest action removed.");
    }

    // 新しい操作が行われたら、やり直し履歴は無意味になるのでクリア
    if (redoStack.length > 0) {
        console.log("Clearing redo stack due to new action.");
        redoStack.length = 0;
    }

    console.log('Action added:', action.type, '- Undo stack size:', undoStack.length);
    // 必要であれば、アンドゥ/リドゥ可能状態の変化をUIに通知するイベントを発行
    // document.dispatchEvent(new CustomEvent('historystatuschange', { detail: { canUndo: true, canRedo: false } }));
}

/**
 * 直前の操作を元に戻します (アンドゥ)。
 * 実際の操作は executeUndo (historyActions.js) に委譲します。
 */
export function undo() {
    // アンドゥ可能かチェック
    if (undoStack.length === 0) {
        console.log("Undo stack is empty.");
        return; // 元に戻す操作がない
    }
    // 初期化チェック
    if (!currentScene || !currentLoadedBlocks) {
        console.error("HistoryManagerが初期化されていません。アンドゥを実行できません。");
        return;
    }

    // スタックから最新のアクションを取り出す
    const action = undoStack.pop();
    console.log('Attempting to undo action:', action.type);

    // historyActions.js に実際の操作を委譲
    const success = executeUndo(action, currentLoadedBlocks, currentScene);

    if (success) {
        // 成功した場合:
        // 1. シーン全体を再描画して変更を反映 (簡易的な方法)
        //    より効率的な方法: 影響を受けたブロックだけを更新する
        console.log("Undo action successful, redrawing scene...");
        clearBlocks(currentScene); // 既存メッシュをクリア
        renderBlocks(currentScene, currentLoadedBlocks); // 更新されたデータで再描画

        // 2. 元に戻した操作をリドゥスタックに追加
        redoStack.push(action);
        console.log('Undo successful. Redo stack size:', redoStack.length);

        // 3. アンドゥ実行完了を通知するイベントを発行 (UI更新などに使う)
        document.dispatchEvent(new CustomEvent('historyundone', { detail: action }));
        // UI状態（アンドゥ/リドゥ可能か）更新イベント
        // document.dispatchEvent(new CustomEvent('historystatuschange', { detail: { canUndo: undoStack.length > 0, canRedo: true } }));

    } else {
        // 失敗した場合 (executeUndoがfalseを返した場合など):
        // アクションをアンドゥスタックに戻す (無限ループのリスクがあるため注意が必要)
        console.warn("Undo action failed, pushing action back to undo stack:", action.type);
        // undoStack.push(action); // ここで戻すと問題が解決しない限り無限ループする可能性があるためコメントアウト
        // UI状態更新イベント
        // document.dispatchEvent(new CustomEvent('historystatuschange', { detail: { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 } }));
    }
}

/**
 * 元に戻した操作をやり直します (リドゥ)。
 * 実際の操作は executeRedo (historyActions.js) に委譲します。
 */
export function redo() {
    // リドゥ可能かチェック
    if (redoStack.length === 0) {
        console.log("Redo stack is empty.");
        return; // やり直す操作がない
    }
    // 初期化チェック
    if (!currentScene || !currentLoadedBlocks) {
        console.error("HistoryManagerが初期化されていません。リドゥを実行できません。");
        return;
    }

    // リドゥスタックからアクションを取り出す
    const action = redoStack.pop();
    console.log('Attempting to redo action:', action.type);

    // historyActions.js に実際の操作を委譲
    const success = executeRedo(action, currentLoadedBlocks, currentScene);

    if (success) {
        // 成功した場合:
        // 1. シーン全体を再描画
        console.log("Redo action successful, redrawing scene...");
        clearBlocks(currentScene);
        renderBlocks(currentScene, currentLoadedBlocks);

        // 2. やり直した操作をアンドゥスタックに戻す
        undoStack.push(action);
        console.log('Redo successful. Undo stack size:', undoStack.length);

        // 3. リドゥ実行完了を通知するイベントを発行
        document.dispatchEvent(new CustomEvent('historyredone', { detail: action }));
        // UI状態更新イベント
        // document.dispatchEvent(new CustomEvent('historystatuschange', { detail: { canUndo: true, canRedo: redoStack.length > 0 } }));
    } else {
        // 失敗した場合:
        // アクションをリドゥスタックに戻す (無限ループ注意)
        console.warn("Redo action failed, pushing action back to redo stack:", action.type);
        // redoStack.push(action); // 無限ループの可能性
        // UI状態更新イベント
        // document.dispatchEvent(new CustomEvent('historystatuschange', { detail: { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 } }));
    }
}