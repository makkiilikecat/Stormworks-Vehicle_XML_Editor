/**
 * @fileoverview キーボード入力イベントをグローバルに監視し、
 * 編集モードの切り替え、アンドゥ/リドゥ、回転/反転、コピー/カット/ペースト、
 * クリップボードクリアなどを実行するハンドラ。
 */

// --- 状態管理モジュールのインポート ---
import { getCurrentMode, setEditMode, EditMode } from '../state/editMode.js'; // 編集モード
import { getPreviewOrientation, setPreviewOrientation } from '../state/placementState.js'; // 配置プレビューの向き
import { addAction, undo, redo } from '../state/historyManager.js'; // アンドゥ・リドゥ
// ★ 修正: クリップボード関連の関数をインポート
import { clearClipboardData, hasClipboard, transformClipboardData } from '../state/clipboardState.js';
import { copySelectionToClipboard, cutSelectionToClipboard, pasteFromClipboard } from './clipboardHandler.js'; // コピー/カット/ペースト処理

// --- UIモジュールのインポート ---
import { updateModeIndicator } from '../ui/modeIndicator.js'; // モード表示更新
import { updatePreviewOrientation as updatePreviewMeshOrientation } from '../rendering/previewBlock.js'; // プレビューメッシュ向き更新

// --- インタラクションモジュールのインポート ---
import { applyRotation, applyFlip, transformGroup } from '../interactions/rotationHandler.js'; // 回転・反転処理
import { getSelectedBlocks } from '../interactions/selectionState.js'; // クリック選択中のブロック取得

// --- モジュール内変数 ---
/** @type {object | null} アプリケーションの状態オブジェクトへの参照 */
let appStateRef = null;

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
        // appState がなければ処理中断
        if (!appStateRef) return;

        // --- 入力フィールドフォーカス時の制御 ---
        const targetElement = event.target;
        // INPUT または TEXTAREA にフォーカスがあるか
        const isInputFocused = targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA';
        // Escapeキーとファンクションキー以外は、入力フィールドにフォーカスがある場合はショートカットを無効にする
        if (isInputFocused && event.key !== 'Escape' && !event.key.startsWith('F')) {
            // console.log("[KeyboardInput] Input focus detected, skipping keyboard shortcut.");
            return;
        }

        // --- 修飾キーと押されたキーの状態を取得 ---
        const shiftPressed = event.shiftKey;
        const ctrlPressed = event.ctrlKey || event.metaKey; // Ctrl (Windows/Linux) or Command (Mac)
        const altPressed = event.altKey;
        const key = event.key.toUpperCase(); // キー名を大文字に統一
        const currentMode = getCurrentMode(); // 現在の編集モードを取得

        // --- アンドゥ/リドゥ (Ctrl+Z, Ctrl+Y) ---
        // 他の Ctrl 系ショートカットよりも優先して処理
        if (ctrlPressed && !shiftPressed && !altPressed) { // Ctrl(Cmd) 単独の場合
            if (key === 'Z') { // アンドゥ
                console.log("[KeyboardInput] アンドゥ実行 (Ctrl+Z)");
                undo(); // historyManager の undo を呼び出す
                event.preventDefault(); // ブラウザ標準のアンドゥ動作を抑制
                return; // 他の処理は行わない
            }
            if (key === 'Y') { // リドゥ
                 console.log("[KeyboardInput] リドゥ実行 (Ctrl+Y)");
                 redo(); // historyManager の redo を呼び出す
                 event.preventDefault(); // ブラウザ標準のリドゥ動作を抑制
                 return; // 他の処理は行わない
            }
        }

        // --- コピー/カット/ペースト (Ctrl+C, Ctrl+X, Ctrl+V) ---
        if (ctrlPressed && !shiftPressed && !altPressed) { // Ctrl(Cmd) 単独の場合
             // コピー(C)とカット(X)は範囲選択モードでのみ有効
             if (currentMode === EditMode.RANGE_SELECT) {
                 if (key === 'C') { // コピー
                     console.log("[KeyboardInput] 範囲選択をクリップボードへコピー (Ctrl+C)");
                     copySelectionToClipboard(appStateRef); // clipboardHandler の関数呼び出し
                     event.preventDefault(); return;
                 }
                 if (key === 'X') { // カット
                     console.log("[KeyboardInput] 範囲選択をクリップボードへカット (Ctrl+X)");
                     cutSelectionToClipboard(appStateRef); // clipboardHandler の関数呼び出し
                     event.preventDefault(); return;
                 }
             }
             // ペースト(V)は範囲選択モードで、かつクリップボードにデータがある場合のみ有効
             if (key === 'V') {
                 if (currentMode === EditMode.RANGE_SELECT && hasClipboard()) {
                     console.log("[KeyboardInput] クリップボードから貼り付け (Ctrl+V)");
                     pasteFromClipboard(appStateRef); // clipboardHandler の関数呼び出し
                     event.preventDefault(); return;
                 } else {
                     // ペーストできない理由をログに出力
                     if (currentMode !== EditMode.RANGE_SELECT) {
                         console.log("[KeyboardInput] ペーストするには範囲選択モードに切り替えてください。");
                     } else if (!hasClipboard()) {
                         console.log("[KeyboardInput] クリップボードが空のためペーストできません。");
                     }
                     event.preventDefault(); return; // ペーストできない場合もデフォルト動作は抑制
                 }
             }
        } // --- End of Copy/Cut/Paste ---

        // --- クリップボードクリア (Shift+Q) ---
        if (shiftPressed && !ctrlPressed && !altPressed) { // Shift 単独の場合
             if (key === 'Q') {
                 console.log("[KeyboardInput] クリップボードをクリア (Shift+Q)");
                 clearClipboardData(); // clipboardState の関数を呼び出す
                 event.preventDefault(); return;
             }
        } // --- End of Clear Clipboard ---

        // --- モード切り替え ---
        // 他の修飾キー(Ctrl, Alt)が押されていない場合のみ処理
        let targetMode = null;
        if (!ctrlPressed && !altPressed) {
            switch (key) {
                // 削除モード切り替え (X キー、Shiftなし)
                case 'X':
                    if (!shiftPressed) {
                        targetMode = (currentMode === EditMode.DELETE) ? EditMode.NORMAL : EditMode.DELETE;
                    }
                    break;
                // XML編集モード切り替え (Shift + E キー)
                case 'E':
                    if (shiftPressed) {
                        targetMode = (currentMode === EditMode.XML_EDIT) ? EditMode.NORMAL : EditMode.XML_EDIT;
                        event.preventDefault(); // 'e'による検索などのデフォルト動作抑制
                    }
                    break;
                // 範囲選択モード切り替え (Shift + S キー)
                case 'S':
                    if (shiftPressed) {
                        targetMode = (currentMode === EditMode.RANGE_SELECT) ? EditMode.NORMAL : EditMode.RANGE_SELECT;
                        event.preventDefault();
                    }
                    break;
                // ペイントモード切り替え (Shift + C キー)
                case 'C':
                    if (shiftPressed) {
                        targetMode = (currentMode === EditMode.PAINT) ? EditMode.NORMAL : EditMode.PAINT;
                        event.preventDefault();
                    }
                    break;
                // 通常モードに戻る (Escape キー)
                case 'ESCAPE':
                    targetMode = EditMode.NORMAL;
                    break;
            }
        }
        // モード変更が検出されたら実行し、UIを更新
        if (targetMode !== null && targetMode !== currentMode) {
            setEditMode(targetMode);           // 新しいモードを設定
            updateModeIndicator(targetMode); // 画面右上のモード表示を更新
            return; // モード切り替えしたら他のキー処理はしない
        }


        // --- 回転/反転 (JKL/UIO) ---
        // ※ Shift, Ctrl, Alt が押されていない場合のみ
        if (['J', 'K', 'L', 'U', 'I', 'O'].includes(key)) {
            if (!ctrlPressed && !altPressed && !shiftPressed) {
                // ★ 修正: クリップボードにデータがある場合、クリップボードデータを操作
                if (hasClipboard()) {
                    const opType = ['J', 'K', 'L'].includes(key) ? '回転' : '反転';
                    console.log(`[KeyboardInput] クリップボードデータを ${key} で${opType}`);
                    transformClipboardData(key); // clipboardState の関数を呼び出し
                    event.preventDefault();
                    return; // クリップボード操作を実行したら他の処理はしない
                }
                // --- クリップボードがない場合の、モードに応じた処理 ---
                else {
                    const isRotation = ['J', 'K', 'L'].includes(key);
                    const opFunc = isRotation ? applyRotation : applyFlip;
                    const opType = isRotation ? '回転' : '反転';

                    if (currentMode === EditMode.NORMAL) {
                        // 【通常モード】: プレビューブロックの向きを変更
                        const currentOrientation = getPreviewOrientation();
                        opFunc(currentOrientation, key);
                        setPreviewOrientation(currentOrientation);
                        updatePreviewMeshOrientation(currentOrientation);
                        console.log(`[KeyboardInput] プレビュー ${opType}: ${key}`);
                        event.preventDefault(); return;

                    } else if (currentMode === EditMode.XML_EDIT) {
                        // 【XML編集モード】: 選択中のブロックを個別に回転/反転
                        const selected = getSelectedBlocks();
                        if (selected.length > 0) {
                            const transformations = [];
                            selected.forEach(blockData => { /* ... (個別回転処理、履歴登録) ... */ });
                            addAction({ type: 'TRANSFORM_BLOCKS', transformations: transformations });
                            console.log(`[KeyboardInput] ${selected.length} ブロック個別${opType}: ${key}`);
                            event.preventDefault(); return;
                        }
                    } else if (currentMode === EditMode.RANGE_SELECT) {
                        // 範囲選択モードでクリップボードがない場合、JKLUIO は何もしない
                        console.log("[KeyboardInput] 範囲選択モード: JKLUIO 操作 (クリップボードなしのため無視)");
                        return;
                    }
                }
            }
        } // End of JKLUIO processing

    }); // End of keydown event listener

     console.log("[KeyboardInput] キーボードハンドラの初期化完了。");
} // End of initializeKeyboardInput