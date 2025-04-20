import { placeBlock, deleteBlock } from '../interactions/blockActions.js';
import { clearBlocks, renderBlocks } from '../rendering/blockRenderer.js';
// BlockData は直接インスタンス化しないが、型情報としてコメントで使う可能性
// import { BlockData } from '../data/blockData.js';

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
 * main.jsから呼び出す必要があります。
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
 * 例:
 * { type: 'ADD_BLOCK', blockData: BlockData }
 * { type: 'DELETE_BLOCK', blockData: object } // 削除されたブロックのデータコピー(meshなし)
 * { type: 'TRANSFORM_BLOCKS', transformations: [{ blockId: number, oldMatrix: Matrix4, newMatrix: Matrix4 }, ...] }
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
    console.log('Action added:', action.type, 'Undo stack size:', undoStack.length);
}

/**
 * 直前の操作を元に戻します (アンドゥ)。
 */
export function undo() {
    if (undoStack.length === 0) {
        console.log("Undo stack is empty.");
        return; // 元に戻す操作がない
    }
    if (!currentScene || !currentLoadedBlocks) {
        console.error("HistoryManager is not initialized for undo.");
        return;
    }

    const action = undoStack.pop(); // スタックから最新のアクションを取り出す
    console.log('Undoing action:', action.type);

    let needsRedraw = false; // 再描画が必要かどうかのフラグ

    switch (action.type) {
        case 'ADD_BLOCK':
            // 追加したブロックを削除する
            // action.blockData は BlockData インスタンスのはず
            deleteBlock(action.blockData, currentLoadedBlocks, currentScene, true); // isHistoryAction = true
            needsRedraw = true; // deleteBlockは再描画しない前提なのでフラグを立てる
            break;
        case 'DELETE_BLOCK':
            // 削除したブロックデータを配列に戻す
            // action.blockData は mesh プロパティを持たないコピーのはず
             if (!currentLoadedBlocks.find(b => b.id === action.blockData.id)) {
                 // BlockData インスタンスとして復元（あるいは renderBlocks がオブジェクトから生成できるならそのままでも）
                 // ここでは単純なオブジェクトとして戻す (renderBlocks が対応する)
                 currentLoadedBlocks.push(action.blockData);
                 needsRedraw = true; // ブロックを追加したので再描画が必要
            } else {
                 console.warn(`Undo Delete: Block ID ${action.blockData.id} already exists.`);
            }
            break;
        case 'TRANSFORM_BLOCKS':
            action.transformations.forEach(t => {
                const block = currentLoadedBlocks.find(b => b.id === t.blockId);
                if (block) {
                    block.rotationMatrix.copy(t.oldMatrix); // 古い行列に戻す
                    // メッシュの更新は再描画時に行われるため、ここでは不要
                    // if (block.mesh) { ... block.mesh.matrix 更新 ... }
                } else { /* ... エラーログ ... */ }
            });
            needsRedraw = true; // 行列が変更されたので再描画が必要
            break;
        default:
            console.warn(`未対応のアンドゥアクションタイプ: ${action.type}`);
            // 実行できなかったものはスタックに戻さず、リドゥスタックにも積まない方が安全か？
            // redoStack.push(action);
            return; // 何もせず終了
    }

    // 必要であればシーン全体を再描画
    if (needsRedraw) {
        console.log("Redrawing scene after undo.");
        // clearBlocks/renderBlocks はメッシュの再生成を行う
        clearBlocks(currentScene);
        renderBlocks(currentScene, currentLoadedBlocks);
    }

    // 元に戻した操作をリドゥスタックに追加
    redoStack.push(action);
    console.log('Undo successful. Redo stack size:', redoStack.length);
}

/**
 * 元に戻した操作をやり直します (リドゥ)。
 */
export function redo() {
    if (redoStack.length === 0) {
        console.log("Redo stack is empty.");
        return; // やり直す操作がない
    }
     if (!currentScene || !currentLoadedBlocks) {
         console.error("HistoryManager is not initialized for redo.");
         return;
     }

    const action = redoStack.pop(); // リドゥスタックからアクションを取り出す
    console.log('Redoing action:', action.type);
    let needsRedraw = false;

    switch (action.type) {
        case 'ADD_BLOCK':
            // アンドゥで削除されたブロックデータを配列に戻す
             if (!currentLoadedBlocks.find(b => b.id === action.blockData.id)) {
                 currentLoadedBlocks.push(action.blockData); // BlockDataインスタンスを戻す
                 needsRedraw = true;
            } else {
                 console.warn(`Redo Add: Block ID ${action.blockData.id} already exists.`);
            }
            break;
        case 'DELETE_BLOCK':
            // アンドゥで追加されたブロックデータを再度削除する
            // action.blockData は mesh なしのコピーなので、IDで検索して loadedBlocks 内のインスタンスを削除する
            const blockToRedoDelete = currentLoadedBlocks.find(b => b.id === action.blockData.id);
            if (blockToRedoDelete) {
                deleteBlock(blockToRedoDelete, currentLoadedBlocks, currentScene, true); // isHistoryAction = true
                needsRedraw = true;
            } else {
                console.warn(`Redo Delete: Block ID ${action.blockData.id} not found.`);
            }
            break;
        case 'TRANSFORM_BLOCKS':
            action.transformations.forEach(t => {
                const block = currentLoadedBlocks.find(b => b.id === t.blockId);
                if (block) {
                    block.rotationMatrix.copy(t.newMatrix); // 新しい行列に戻す
                    // メッシュ更新は再描画時に
                } else { /* ... エラーログ ... */ }
            });
             needsRedraw = true;
            break;
        default:
            console.warn(`未対応のリドゥアクションタイプ: ${action.type}`);
            // undoStack.push(action); // 実行できなかったものは戻さない
             return;
    }

    // 必要であればシーン全体を再描画
    if (needsRedraw) {
        console.log("Redrawing scene after redo.");
        clearBlocks(currentScene);
        renderBlocks(currentScene, currentLoadedBlocks);
    }

    // やり直した操作をアンドゥスタックに戻す
    undoStack.push(action);
    console.log('Redo successful. Undo stack size:', undoStack.length);
}