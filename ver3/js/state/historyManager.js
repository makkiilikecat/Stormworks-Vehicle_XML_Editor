/**
 * @fileoverview アプリケーションのアンドゥ・リドゥ機能を提供します。
 * 操作履歴 (アクション) をスタックで管理し、元に戻す/やり直す処理を実行します。
 * 実際の状態変更ロジックは historyActions.js に委譲します。
 * アンドゥ/リドゥの可否状態が変わった際には 'historystatuschange' イベントを発行します。
 *
 * @dependency historyActions.js - executeUndo, executeRedo
 * @dependency blockRenderer.js - clearBlocks, renderBlocks (シーン再描画のため)
 */

import { executeUndo, executeRedo } from './historyActions.js'; // アクション実行ロジック
import { clearBlocks, renderBlocks } from '../rendering/blockRenderer.js'; // シーン再描画用

// --- 定数 ---

/** 保持する履歴の最大数 */
const MAX_HISTORY_SIZE = 100;

// --- モジュール内変数 ---

/** @type {Array<object>} 元に戻す操作の履歴を保持するスタック (アクションオブジェクトの配列) */
const undoStack = [];
/** @type {Array<object>} やり直す操作の履歴を保持するスタック (アクションオブジェクトの配列) */
const redoStack = [];

/** @type {THREE.Scene | null} 操作対象のThree.jsシーンへの参照 */
let currentScene = null;
/** @type {Array<BlockData> | null} 現在編集中のブロックデータ配列への参照 */
let currentLoadedBlocks = null;

// --- プライベート関数 ---

/**
 * 現在のアンドゥ/リドゥ可能状態を通知するカスタムイベントを発行します。
 * UI要素 (アンドゥ/リドゥボタン) の活性/非活性制御などに利用されます。
 * @private
 */
function dispatchStatusUpdate() {
    const canUndo = undoStack.length > 0; // アンドゥスタックに何かあればアンドゥ可能
    const canRedo = redoStack.length > 0; // リドゥスタックに何かあればリドゥ可能
    // console.log(`[HistoryManager] Status Update: canUndo=${canUndo}, canRedo=${canRedo}`);
    document.dispatchEvent(new CustomEvent('historystatuschange', {
        detail: { canUndo, canRedo } // イベントの詳細情報として可否状態を渡す
    }));
}

// --- 初期化 ---

/**
 * HistoryManager を初期化します。
 * 操作対象となるシーンとブロックデータ配列への参照を設定し、履歴スタックを空にします。
 * アプリケーション起動時やファイル読み込み成功時に呼び出す必要があります。
 * @param {THREE.Scene} scene - 操作対象のシーン。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列。
 */
export function setupHistoryManager(scene, loadedBlocks) {
    console.log("[HistoryManager] 初期化中...");
    // 引数の検証
    if (!scene || !Array.isArray(loadedBlocks)) {
        console.error("[HistoryManager] 初期化失敗: 無効な引数です。SceneとBlockData配列が必要です。");
        return;
    }
    // 参照を保持
    currentScene = scene;
    currentLoadedBlocks = loadedBlocks;
    // 履歴スタックをクリア
    undoStack.length = 0;
    redoStack.length = 0;
    // 初期の状態 (アンドゥ/リドゥ不可) を通知
    dispatchStatusUpdate();
    console.log("[HistoryManager] 初期化完了。アンドゥ/リドゥスタックをクリアしました。");
}

// --- 履歴操作 ---

/**
 * 新しいアクション（ユーザーが行った操作）をアンドゥスタックに追加します。
 * 履歴が追加されると、リドゥスタックはクリアされます（新しい操作線が始まるため）。
 * スタックサイズが上限を超えた場合は、最も古い履歴が削除されます。
 * @param {object} action - 履歴に追加するアクションオブジェクト。
 * 最低限 `type` プロパティを持つ必要があります。
 * 例: { type: 'ADD_BLOCK', blockData: {...} }
 */
export function addAction(action) {
    // 初期化されているか、アクションが有効か確認
    if (!currentScene || !currentLoadedBlocks) {
        console.error("[HistoryManager] 初期化されていません。アクションを追加できません。");
        return;
    }
    if (!action?.type) {
        console.error("[HistoryManager] 無効なアクションオブジェクトです ('type' 不明)。", action);
        return;
    }

    // アンドゥスタックに追加
    undoStack.push(action);

    // スタックサイズの上限チェック
    if (undoStack.length > MAX_HISTORY_SIZE) {
        undoStack.shift(); // 先頭（最も古い要素）を削除
        console.log("[HistoryManager] アンドゥスタックが上限に達したため、最も古いアクションを削除しました。");
    }

    // 新しいアクションが追加されたら、リドゥは不可能になるためクリア
    if (redoStack.length > 0) {
        console.log("[HistoryManager] 新しいアクションが追加されたため、リドゥスタックをクリアします。");
        redoStack.length = 0;
    }

    console.log(`[HistoryManager] アクション追加: ${action.type}, Undo可能数: ${undoStack.length}`);
    // アンドゥ/リドゥ状態の変化を通知
    dispatchStatusUpdate();
}

/**
 * 直前の操作を元に戻します (アンドゥ)。
 * 実際の状態変更は `historyActions.executeUndo` に委譲し、
 * その後シーンを再描画して変更を反映させます。
 */
export function undo() {
    // アンドゥ可能かチェック
    if (undoStack.length === 0) {
        console.log("[HistoryManager] アンドゥする操作がありません。");
        showPopup("これ以上元に戻せません", "info", 1500); // ユーザー通知
        return;
    }
    // 初期化チェック
    if (!currentScene || !currentLoadedBlocks) {
        console.error("[HistoryManager] 初期化されていません。アンドゥを実行できません。");
        return;
    }

    // アンドゥスタックから最新のアクションを取り出す
    const action = undoStack.pop();
    console.log(`[HistoryManager] アンドゥ試行: ${action.type}`);

    // 実際の状態変更処理を実行
    const success = executeUndo(action, currentLoadedBlocks, currentScene);

    if (success) {
        // 成功した場合:
        console.log("[HistoryManager] アンドゥ成功。シーンを再描画します...");
        // 1. シーン全体を再描画 (状態変更を反映)
        //    注意: 大規模なシーンではパフォーマンスに影響する可能性があるため、
        //         変更があったブロックのみを更新する方が効率的。
        clearBlocks(currentScene);
        renderBlocks(currentScene, currentLoadedBlocks);

        // 2. 元に戻した操作をリドゥスタックに追加
        redoStack.push(action);

        // 3. アンドゥ完了イベントを発行 (他のモジュールが利用する可能性あり)
        document.dispatchEvent(new CustomEvent('historyundone', { detail: action }));
        console.log(`[HistoryManager] アンドゥ完了。Redo可能数: ${redoStack.length}`);

    } else {
        // 失敗した場合:
        console.warn(`[HistoryManager] アンドゥ操作 (${action.type}) に失敗しました。アクションをスタックに戻します。`);
        // 失敗したアクションをアンドゥスタックに戻す（エラーが続く可能性があるため注意）
        undoStack.push(action);
        showPopup("元に戻す操作に失敗しました", "error");
    }
    // アンドゥ/リドゥ状態の変化を通知
    dispatchStatusUpdate();
}

/**
 * 元に戻した操作をやり直します (リドゥ)。
 * 実際の状態変更は `historyActions.executeRedo` に委譲し、
 * その後シーンを再描画して変更を反映させます。
 */
export function redo() {
    // リドゥ可能かチェック
    if (redoStack.length === 0) {
        console.log("[HistoryManager] リドゥする操作がありません。");
        showPopup("これ以上やり直せません", "info", 1500);
        return;
    }
    // 初期化チェック
    if (!currentScene || !currentLoadedBlocks) {
        console.error("[HistoryManager] 初期化されていません。リドゥを実行できません。");
        return;
    }

    // リドゥスタックからアクションを取り出す
    const action = redoStack.pop();
    console.log(`[HistoryManager] リドゥ試行: ${action.type}`);

    // 実際の状態変更処理を実行
    const success = executeRedo(action, currentLoadedBlocks, currentScene);

    if (success) {
        // 成功した場合:
        console.log("[HistoryManager] リドゥ成功。シーンを再描画します...");
        // 1. シーン全体を再描画
        clearBlocks(currentScene);
        renderBlocks(currentScene, currentLoadedBlocks);

        // 2. やり直した操作をアンドゥスタックに戻す
        undoStack.push(action);

        // 3. リドゥ完了イベントを発行
        document.dispatchEvent(new CustomEvent('historyredone', { detail: action }));
        console.log(`[HistoryManager] リドゥ完了。Undo可能数: ${undoStack.length}`);

    } else {
        // 失敗した場合:
        console.warn(`[HistoryManager] リドゥ操作 (${action.type}) に失敗しました。アクションをスタックに戻します。`);
        // 失敗したアクションをリドゥスタックに戻す（エラーが続く可能性あり）
        redoStack.push(action);
        showPopup("やり直す操作に失敗しました", "error");
    }
    // アンドゥ/リドゥ状態の変化を通知
    dispatchStatusUpdate();
}