/**
 * @fileoverview アプリケーションのアンドゥ・リドゥ機能（履歴管理）を提供します。
 *
 * 概要:
 * - ユーザーが行った操作（アクション）を Undo/Redo 用のスタックに記録します。
 * - Undo/Redo の実行を管理し、対応するアクションを historyActions モジュールに依頼します。
 * - アクション実行後、シーンの再描画やハイライトの更新など、必要な後処理を行います。
 * - Undo/Redo の可否状態が変化した際に 'historystatuschange' イベントを発行し、UI (ボタンの活性/非活性など) に通知します。
 *
 * 依存モジュール:
 * - historyActions.js: 各アクションタイプに応じた具体的な状態変更ロジック (executeUndo, executeRedo)。
 * - blockRenderer.js: シーンのメッシュをクリア・再描画する機能 (clearBlocks, renderBlocks)。
 * - popupUtils.js: ユーザーへのフィードバック (例:「これ以上戻せません」) を表示する機能 (showPopup)。
 * - editMode.js: 現在の編集モードを取得・判定する機能 (EditMode, getCurrentMode)。
 * - highlightHelper.js: ブロックのハイライト表示を制御する機能 (clearAllHighlights, highlightMesh)。
 * - selectionState.js: 現在選択されているブロックのリストを取得する機能 (getSelectedBlocks)。
 */

// --- 必要なモジュールをインポート ---
import { executeUndo, executeRedo } from './historyActions.js';
import { clearBlocks, renderBlocks } from '../rendering/blockRenderer.js';
import { showPopup } from '../ui/popupUtils.js';
import { EditMode, getCurrentMode } from './editMode.js';
import { clearAllHighlights, highlightMesh } from '../rendering/highlightHelper.js';
import { getSelectedBlocks } from '../interactions/selectionState.js';

// --- 定数 ---
/** 保持する履歴の最大ステップ数 */
const MAX_HISTORY_SIZE = 100;

// --- モジュール内変数 ---
/** @type {Array<object>} Undo 用のアクションオブジェクトを保持するスタック */
const undoStack = [];
/** @type {Array<object>} Redo 用のアクションオブジェクトを保持するスタック */
const redoStack = [];

/** @type {THREE.Scene | null} 操作対象のシーン (setupHistoryManager で設定) */
let currentScene = null;
/** @type {Array<BlockData> | null} 操作対象のブロックデータ配列 (setupHistoryManager で設定) */
let currentLoadedBlocks = null;

// --- プライベート関数 ---

/**
 * 現在の Undo/Redo 可能状態を計算し、'historystatuschange' イベントを発行します。
 * UI はこのイベントを購読してボタンの状態などを更新します。
 * @private
 */
function dispatchStatusUpdate() {
    // 各スタックに要素が存在するかどうかで Undo/Redo の可否を判断
    const canUndo = undoStack.length > 0;
    const canRedo = redoStack.length > 0;
    // カスタムイベントを発行
    document.dispatchEvent(new CustomEvent('historystatuschange', {
        detail: { canUndo, canRedo } // イベントリスナーに状態を渡す
    }));
}

// --- 初期化 ---

/**
 * HistoryManager を初期化またはリセットします。
 * アプリケーション起動時やファイルロード成功時に呼び出す必要があります。
 * @param {THREE.Scene} scene - 操作対象のシーン。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列。
 */
export function setupHistoryManager(scene, loadedBlocks) {
    console.log("[HistoryManager] 初期化処理を開始します...");
    // 引数の基本的な検証
    if (!scene || !Array.isArray(loadedBlocks)) {
        console.error("[HistoryManager] 初期化失敗: scene または loadedBlocks が無効です。");
        return;
    }
    // シーンとブロックリストへの参照を保持
    currentScene = scene;
    currentLoadedBlocks = loadedBlocks;
    // Undo/Redo スタックを空にする
    undoStack.length = 0;
    redoStack.length = 0;
    // UI に初期状態 (Undo/Redo 不可) を通知
    dispatchStatusUpdate();
    console.log("[HistoryManager] 初期化が完了し、履歴スタックがクリアされました。");
}

// --- 履歴操作 ---

/**
 * 新しいアクションを履歴 (Undoスタック) に追加します。
 * ユーザーが何らかの操作 (ブロック追加、削除、変形など) を完了した際に呼び出されます。
 * @param {object} action - 履歴に追加するアクションオブジェクト。
 * 最低限 `type` プロパティを持つ必要があります。
 * 他のプロパティはアクションの種類によって異なります (例: blockData, changes)。
 */
export function addAction(action) {
    // Manager が初期化されているか、アクションが有効かを確認
    if (!currentScene || !currentLoadedBlocks) {
        console.error("[HistoryManager] HistoryManager が初期化されていないため、アクションを追加できません。");
        return;
    }
    if (!action?.type) {
        console.error("[HistoryManager] 追加しようとしたアクションに 'type' プロパティがありません。", action);
        return;
    }

    // Undo スタックにアクションを追加
    undoStack.push(action);

    // スタックが最大サイズを超えた場合、最も古いアクションを削除
    if (undoStack.length > MAX_HISTORY_SIZE) {
        undoStack.shift(); // 配列の先頭要素を削除
        console.log(`[HistoryManager] Undoスタックが最大サイズ (${MAX_HISTORY_SIZE}) に達したため、最も古いアクションを削除しました。`);
    }

    // 新しい操作が行われた場合、それ以前の Redo 操作は意味がなくなるため Redo スタックをクリア
    if (redoStack.length > 0) {
        console.log("[HistoryManager] 新しいアクションが追加されたため、Redo スタックをクリアします。");
        redoStack.length = 0;
    }

    // アクション追加後の状態をログに出力し、UI に状態変化を通知
    // console.log(`[HistoryManager] アクション (${action.type}) を追加しました。Undo可能数: ${undoStack.length}`);
    dispatchStatusUpdate();
}

/**
 * 直前の操作を元に戻します (アンドゥ)。
 */
export function undo() {
    // Undo スタックが空か、Manager が未初期化の場合は処理しない
    if (undoStack.length === 0) { showPopup("これ以上元に戻せません", "info", 1500); return; }
    if (!currentScene || !currentLoadedBlocks) { console.error("[HistoryManager] 未初期化のため Undo できません。"); return; }

    // Undo スタックから最後のアクションを取り出す
    const action = undoStack.pop();
    console.log(`[HistoryManager] Undo を試行: ${action.type}`);

    // 取り出したアクションに対応する「元に戻す」処理を実行 (historyActions に委譲)
    const success = executeUndo(action, currentLoadedBlocks, currentScene);

    // Undo 処理が成功した場合
    if (success) {
        // 1. 元に戻したアクションを Redo スタックに積む (やり直しできるように)
        redoStack.push(action);

        // 2. XML編集モードの場合、編集キューブの更新とハイライトの再適用
        //if (getCurrentMode() === EditMode.XML_EDIT) {
        //    console.log("[HistoryManager] XML編集モードのため、編集キューブとハイライトを更新します。");
        //    currentLoadedBlocks.forEach(block => block.updateMeshMatrix()); // 編集キューブの行列更新
        //    clearAllHighlights(currentLoadedBlocks, EditMode.XML_EDIT);     // 全ハイライト解除
        //    const selectedBlocks = getSelectedBlocks();                     // 現在の選択を取得
        //    selectedBlocks.forEach(block => { if (block.foregroundMesh) highlightMesh(block.foregroundMesh); }); // 再ハイライト
        //    console.log(`[HistoryManager] ハイライトを再適用 (${selectedBlocks.length}個)。`);
        //}

        // 3. Undo 完了イベントを発行 (必要なら他のモジュールが購読)
        document.dispatchEvent(new CustomEvent('historyundone', { detail: action }));
        console.log(`[HistoryManager] Undo 完了。Redo可能数: ${redoStack.length}`);

    }
    // Undo 処理が失敗した場合
    else {
        console.warn(`[HistoryManager] Undo 操作 (${action.type}) に失敗しました。アクションをスタックに戻します。`);
        // 失敗したアクションを Undo スタックに戻す（連続失敗の可能性あり）
        undoStack.push(action);
        showPopup("元に戻す操作に失敗しました", "error");
    }
    // 処理の成否に関わらず、最終的な Undo/Redo 可能状態を UI に通知
    dispatchStatusUpdate();
}

/**
 * 元に戻した操作をやり直します (リドゥ)。
 */
export function redo() {
    // Redo スタックが空か、Manager が未初期化の場合は処理しない
    if (redoStack.length === 0) { showPopup("これ以上やり直せません", "info", 1500); return; }
    if (!currentScene || !currentLoadedBlocks) { console.error("[HistoryManager] 未初期化のため Redo できません。"); return; }

    // Redo スタックからアクションを取り出す
    const action = redoStack.pop();
    console.log(`[HistoryManager] Redo を試行: ${action.type}`);

    // 取り出したアクションに対応する「やり直す」処理を実行 (historyActions に委譲)
    const success = executeRedo(action, currentLoadedBlocks, currentScene);

    // Redo 処理が成功した場合
    if (success) {
        // 1. やり直したアクションを Undo スタックに戻す (再度元に戻せるように)
        undoStack.push(action);

        // 2. XML編集モードの場合、編集キューブの更新とハイライトの再適用
        //if (getCurrentMode() === EditMode.XML_EDIT) {
        //    console.log("[HistoryManager] XML編集モードのため、編集キューブとハイライトを更新します。");
        //    currentLoadedBlocks.forEach(block => block.updateMeshMatrix()); // 編集キューブの行列更新
        //    clearAllHighlights(currentLoadedBlocks, EditMode.XML_EDIT);     // 全ハイライト解除
        //    const selectedBlocks = getSelectedBlocks();                     // 現在の選択を取得
        //    selectedBlocks.forEach(block => { if (block.foregroundMesh) highlightMesh(block.foregroundMesh); }); // 再ハイライト
        //    console.log(`[HistoryManager] ハイライトを再適用 (${selectedBlocks.length}個)。`);
        //}

        // 3. Redo 完了イベントを発行
        document.dispatchEvent(new CustomEvent('historyredone', { detail: action }));
        console.log(`[HistoryManager] Redo 完了。Undo可能数: ${undoStack.length}`);

    }
    // Redo 処理が失敗した場合
    else {
        console.warn(`[HistoryManager] Redo 操作 (${action.type}) に失敗しました。アクションをスタックに戻します。`);
        // 失敗したアクションを Redo スタックに戻す
        redoStack.push(action);
        showPopup("やり直す操作に失敗しました", "error");
    }
    // 処理の成否に関わらず、最終的な Undo/Redo 可能状態を UI に通知
    dispatchStatusUpdate();
}