/**
 * @fileoverview キーボード入力イベントをグローバルに監視し、
 * 編集モードの切り替え、アンドゥ/リドゥ、回転/反転、コピー/カット/クリップボードクリアなどを実行するハンドラ。
 */

// --- 状態管理モジュールのインポート ---
import { getCurrentMode, setEditMode, EditMode } from '../state/editMode.js';
import { getPreviewOrientation, setPreviewOrientation } from '../state/placementState.js';
import { addAction, undo, redo } from '../state/historyManager.js';
// ★クリップボード操作関数をインポート
import { copySelectionToClipboard, cutSelectionToClipboard } from './clipboardHandler.js';
import { clearClipboardData } from '../state/clipboardState.js'; // ★クリップボードクリア関数

// --- UIモジュールのインポート ---
import { updateModeIndicator } from '../ui/modeIndicator.js';
import { updatePreviewOrientation as updatePreviewMeshOrientation } from '../rendering/previewBlock.js';

// --- インタラクションモジュールのインポート ---
import { applyRotation, applyFlip, transformGroup } from '../interactions/rotationHandler.js';
import { getSelectedBlocks } from '../interactions/selectionState.js'; // クリック選択されたブロック取得

// --- モジュール内変数 ---
/** @type {object | null} アプリケーションの状態オブジェクトへの参照 */
let appStateRef = null; // アプリケーション状態への参照

/**
 * キーボード入力イベントリスナーを初期化し、各種ショートカットキーを登録します。
 * @param {object} appState - アプリケーションの状態オブジェクト。リスナー内で参照するために保持します。
 */
export function initializeKeyboardInput(appState) {
    console.log("[KeyboardInput] キーボードハンドラを初期化中...");
    appStateRef = appState; // appStateへの参照を保持
    if (!appStateRef) {
        console.error("[KeyboardInput] 初期化エラー: appState が無効です。");
        return;
    }

    // ドキュメント全体でキーダウンイベントを監視
    document.addEventListener('keydown', (event) => {
        // アプリケーション状態がなければ処理しない (安全策)
        if (!appStateRef) return;

        // --- 入力フィールドフォーカス時のショートカット無効化 ---
        const targetElement = event.target;
        const isInputFocused = targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA';
        // Escapeキーとファンクションキー以外は、入力フィールドにフォーカスがある場合は無視
        if (isInputFocused && event.key !== 'Escape' && !event.key.startsWith('F')) {
            return;
        }

        // --- 修飾キーとキー名の取得 ---
        const shiftPressed = event.shiftKey;
        const ctrlPressed = event.ctrlKey || event.metaKey; // Ctrl または Command
        const altPressed = event.altKey;
        const key = event.key.toUpperCase(); // キー名を大文字で比較
        const currentMode = getCurrentMode(); // 現在の編集モード

        // --- 操作の優先順位を考慮 ---
        // 1. アンドゥ/リドゥ (Ctrl+Z, Ctrl+Y) - 最優先
        if (ctrlPressed && !shiftPressed && !altPressed) { // Ctrl/Cmd 単独
            if (key === 'Z') { console.log("[KeyboardInput] アンドゥ実行 (Ctrl+Z)"); undo(); event.preventDefault(); return; }
            if (key === 'Y') { console.log("[KeyboardInput] リドゥ実行 (Ctrl+Y)"); redo(); event.preventDefault(); return; }
        }

        // 2. クリップボード操作 (Ctrl+C, Ctrl+X, Shift+Q) - 次点
        // コピー/カットは範囲選択モードでのみ有効
        if (ctrlPressed && !shiftPressed && !altPressed && currentMode === EditMode.RANGE_SELECT) {
            if (key === 'C') {
                console.log("[KeyboardInput] 範囲選択をクリップボードへコピー (Ctrl+C)");
                copySelectionToClipboard(appStateRef);
                event.preventDefault(); return;
            }
            if (key === 'X') {
                console.log("[KeyboardInput] 範囲選択をクリップボードへカット (Ctrl+X)");
                cutSelectionToClipboard(appStateRef);
                event.preventDefault(); return;
            }
            // TODO (Step 5): ペースト (Ctrl+V) の処理をここに追加
        }
        // クリップボードクリアはどのモードでも可能とするか？ -> 一旦どのモードでも可能にする
        if (shiftPressed && !ctrlPressed && !altPressed && key === 'Q') {
            console.log("[KeyboardInput] クリップボードをクリア (Shift+Q)");
            clearClipboardData();
            event.preventDefault(); return;
        }

        // 3. モード切り替え (修飾キーなし、またはShift併用)
        let targetMode = null;
        if (!ctrlPressed && !altPressed) { // Ctrl/Alt が押されていない
            switch (key) {
                case 'X': if (!shiftPressed) targetMode = (currentMode === EditMode.DELETE) ? EditMode.NORMAL : EditMode.DELETE; break;
                case 'E': if (shiftPressed) { targetMode = (currentMode === EditMode.XML_EDIT) ? EditMode.NORMAL : EditMode.XML_EDIT; event.preventDefault(); } break;
                case 'S': if (shiftPressed) { targetMode = (currentMode === EditMode.RANGE_SELECT) ? EditMode.NORMAL : EditMode.RANGE_SELECT; event.preventDefault(); } break;
                case 'C': if (shiftPressed) { targetMode = (currentMode === EditMode.PAINT) ? EditMode.NORMAL : EditMode.PAINT; event.preventDefault(); } break;
                case 'ESCAPE': targetMode = EditMode.NORMAL; break; // ESCで通常モードへ
            }
        }
        // モード変更を実行
        if (targetMode !== null && targetMode !== currentMode) {
            setEditMode(targetMode);
            updateModeIndicator(targetMode); // UIのモード表示を更新
            return; // モード変更したら他の処理はしない
        }

        // 4. 回転/反転 (JKL/UIO) (修飾キーなし)
        if (['J', 'K', 'L', 'U', 'I', 'O'].includes(key)) {
            if (!ctrlPressed && !altPressed && !shiftPressed) {
                const isRotation = ['J', 'K', 'L'].includes(key);
                const opFunc = isRotation ? applyRotation : applyFlip;
                const opType = isRotation ? '回転' : '反転';

                if (currentMode === EditMode.NORMAL) {
                    // 通常モード: プレビューブロックの向きを変更
                    const currentOrientation = getPreviewOrientation();
                    opFunc(currentOrientation, key);
                    setPreviewOrientation(currentOrientation);
                    updatePreviewMeshOrientation(currentOrientation);
                    console.log(`[KeyboardInput] プレビュー ${opType}: ${key}`);
                    event.preventDefault();

                } else if (currentMode === EditMode.XML_EDIT) {
                    // XML編集モード: クリック選択されたブロックを個別に回転/反転
                    const selected = getSelectedBlocks(); // クリック選択リストを取得
                    if (selected.length > 0) {
                        const transformations = []; // アンドゥ用
                        selected.forEach(blockData => {
                            const oldMatrix = blockData.rotationMatrix.clone();
                            opFunc(blockData.rotationMatrix, key); // 行列を直接変更
                            // メッシュ表示更新 (前景があればそれを優先)
                            blockData.updateMeshMatrix(); // メッシュ更新はBlockDataに任せる方が良いかも
                            transformations.push({ blockId: blockData.id, oldMatrix: oldMatrix, newMatrix: blockData.rotationMatrix.clone() });
                        });
                        addAction({ type: 'TRANSFORM_BLOCKS', transformations: transformations });
                        console.log(`[KeyboardInput] ${selected.length} ブロック個別${opType}: ${key}`);
                        event.preventDefault();
                    }
                } else if (currentMode === EditMode.RANGE_SELECT) {
                    // 範囲選択モード: クリップボード内のデータを回転/反転 (未実装)
                    // ★TODO (Step 4): クリップボードデータに対する回転/反転処理を呼び出す
                    console.log(`[KeyboardInput] クリップボードデータの ${opType}: ${key} (未実装)`);
                    event.preventDefault(); // 実装したら有効にする
                }
            }
        } // End of JKLUIO processing

        // --- 他のキーボードショートカット ---
        // 必要に応じてここに追加

    }); // End of keydown event listener

     console.log("[KeyboardInput] キーボードハンドラの初期化完了。");
}