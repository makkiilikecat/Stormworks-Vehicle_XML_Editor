/**
 * @fileoverview キーボード入力イベントをグローバルに監視し、
 * 編集モードの切り替え、アンドゥ/リドゥ、回転/反転、コピー/カット/ペースト/クリップボードクリア、
 * および関連するプレビュー更新などを実行するハンドラ。
 */

import * as THREE from 'three'; // Vector3のため
import { getCurrentMode, setEditMode, EditMode } from '../state/editMode.js';
import { getPreviewOrientation, setPreviewOrientation } from '../state/placementState.js';
import { addAction, undo, redo } from '../state/historyManager.js';
import { copySelectionToClipboard, cutSelectionToClipboard, pasteFromClipboard } from './clipboardHandler.js';
// クリップボード状態確認と操作関数をインポート
import { clearClipboardData, hasClipboard, transformClipboardData, getClipboardData } from '../state/clipboardState.js';

import { updateModeIndicator } from '../ui/modeIndicator.js';
// プレビュー関連のインポート
import { updatePreviewOrientation as updatePreviewMeshOrientation } from '../rendering/previewBlock.js';
import { updatePastePreview } from '../rendering/pastePreviewRenderer.js'; // ペーストプレビュー更新
// 選択範囲取得と選択ブロック取得
import { applyRotation, applyFlip, transformGroup } from '../interactions/rotationHandler.js';
import { getSelectedBlocks, getSelectionRangeBox } from '../interactions/selectionState.js'; // getSelectionRangeBox 追加

// --- モジュール内変数 ---
/** @type {object | null} アプリケーションの状態オブジェクトへの参照 */
let appStateRef = null;
/** @type {THREE.Vector3} 計算用 */
const _center = new THREE.Vector3();

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
        // appStateRef がなければ処理中断 (安全対策)
        if (!appStateRef) return;
        // イベントから scene を取得 (プレビュー更新などに使う)
        const { scene } = appStateRef;
        if (!scene) { console.error("[KeyboardInput] Sceneが見つかりません。"); return; }

        // --- 入力フィールドフォーカス時の制御 ---
        const targetElement = event.target;
        const isInputFocused = targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA';
        // Escapeキーとファンクションキー以外は、入力フィールドにフォーカスがある場合はショートカットを無効にする
        if (isInputFocused && event.key !== 'Escape' && !event.key.startsWith('F')) {
            // console.log("[KeyboardInput] Input focus detected, skipping keyboard shortcut.");
            return;
        }

        // --- 修飾キーの状態を取得 ---
        const shiftPressed = event.shiftKey;
        const ctrlPressed = event.ctrlKey || event.metaKey; // Ctrl or Cmd
        const altPressed = event.altKey;

        // 押されたキー (大文字に変換)
        const key = event.key.toUpperCase();
        // 現在の編集モード
        const currentMode = getCurrentMode();

        // --- アンドゥ/リドゥ (Ctrl+Z, Ctrl+Y) ---
        // ※ 他の Ctrl ショートカットより優先
        if (ctrlPressed && !shiftPressed && !altPressed) { // Ctrl(Cmd) 単独
            if (key === 'Z') {
                console.log("[KeyboardInput] アンドゥ実行 (Ctrl+Z)");
                undo();
                event.preventDefault(); return;
            }
            if (key === 'Y') {
                 console.log("[KeyboardInput] リドゥ実行 (Ctrl+Y)");
                 redo();
                 event.preventDefault(); return;
            }
        }

        // --- コピー/カット/ペースト (Ctrl+C, Ctrl+X, Ctrl+V) ---
        if (ctrlPressed && !shiftPressed && !altPressed) { // Ctrl(Cmd) 単独
             // コピーとカットは範囲選択モードでのみ有効
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
             // ペースト (Ctrl+V) は範囲選択モードかつクリップボードにデータがある場合のみ
             if (key === 'V') {
                 if (currentMode === EditMode.RANGE_SELECT && hasClipboard()) {
                     console.log("[KeyboardInput] クリップボードから貼り付け (Ctrl+V)");
                     pasteFromClipboard(appStateRef); // clipboardHandler の関数呼び出し
                 } else if (currentMode !== EditMode.RANGE_SELECT && hasClipboard()) {
                      console.log("[KeyboardInput] ペーストするには範囲選択モードに切り替えてください。");
                 } else if (!hasClipboard()) {
                      console.log("[KeyboardInput] クリップボードが空のためペーストできません。");
                 }
                 // ブラウザのデフォルトペースト動作は常に抑制
                 event.preventDefault(); return;
             }
        } // --- End of Copy/Cut/Paste ---


        // --- クリップボードクリア (Shift+Q) ---
        if (shiftPressed && !ctrlPressed && !altPressed) { // Shift単独
             if (key === 'Q') {
                 console.log("[KeyboardInput] クリップボードをクリア (Shift+Q)");
                 clearClipboardData(); // clipboardState の関数を呼び出す
                 event.preventDefault(); return;
             }
        } // --- End of Clear Clipboard ---


        // --- モード切り替え ---
        let targetMode = null;
        if (!ctrlPressed && !altPressed) { // Shift はモードによって使う
            switch (key) {
                case 'X': // 削除モード (Shiftなし)
                    if (!shiftPressed) targetMode = (currentMode === EditMode.DELETE) ? EditMode.NORMAL : EditMode.DELETE;
                    break;
                case 'E': // XML編集モード (Shiftあり)
                    if (shiftPressed) { targetMode = (currentMode === EditMode.XML_EDIT) ? EditMode.NORMAL : EditMode.XML_EDIT; event.preventDefault(); }
                    break;
                case 'S': // 範囲選択モード (Shiftあり)
                    if (shiftPressed) { targetMode = (currentMode === EditMode.RANGE_SELECT) ? EditMode.NORMAL : EditMode.RANGE_SELECT; event.preventDefault(); }
                    break;
                case 'C': // ペイントモード (Shiftあり)
                    if (shiftPressed) { targetMode = (currentMode === EditMode.PAINT) ? EditMode.NORMAL : EditMode.PAINT; event.preventDefault(); }
                    break;
                case 'ESCAPE': // 通常モードに戻る
                    targetMode = EditMode.NORMAL;
                    break;
            }
        }
        // モード変更があれば実行
        if (targetMode !== null && targetMode !== currentMode) {
            setEditMode(targetMode);
            updateModeIndicator(targetMode); // UI表示更新
            return; // モード変更したら他のキー処理はしない
        }


        // --- 回転/反転 (JKL/UIO) ---
        if (['J', 'K', 'L', 'U', 'I', 'O'].includes(key)) {
            if (!ctrlPressed && !altPressed && !shiftPressed) { // 修飾キーなし

                // 【クリップボード操作】クリップボードにデータがあればそちらを優先
                if (hasClipboard()) {
                    console.log(`[KeyboardInput] クリップボードデータを ${key} で回転/反転`);
                    // 1. クリップボードデータを変形
                    transformClipboardData(key);
                    // 2. ペーストプレビューを更新
                    const currentRange = getSelectionRangeBox();
                    const clipboardContent = getClipboardData();
                    // プレビューの基準点は現在の選択範囲の中心 (なければ原点)
                    const previewCenter = currentRange ? currentRange.getCenter(_center).round() : _center.set(0,0,0);
                    if (clipboardContent) { // nullチェック
                        updatePastePreview(scene, clipboardContent, previewCenter); // ペーストプレビュー更新
                        console.log("[KeyboardInput] ペーストプレビューを更新しました。");
                    }
                    event.preventDefault(); return; // クリップボード操作完了
                }
                // --- クリップボードがない場合のモード別処理 ---
                else if (currentMode === EditMode.NORMAL) {
                    // 【通常モード】: プレビューブロックの向きを変更
                    const currentOrientation = getPreviewOrientation();
                    const opFunc = ['J','K','L'].includes(key) ? applyRotation : applyFlip;
                    opFunc(currentOrientation, key); // Matrix4を直接変更
                    setPreviewOrientation(currentOrientation);
                    updatePreviewMeshOrientation(currentOrientation); // メッシュ表示更新
                    console.log(`[KeyboardInput] プレビュー 回転/反転: ${key}`);
                    event.preventDefault(); return;

                } else if (currentMode === EditMode.XML_EDIT) {
                    // 【XML編集モード】: 選択中のブロックを個別に回転/反転
                    const selected = getSelectedBlocks();
                    if (selected.length > 0) {
                        const transformations = []; // アンドゥ用
                        selected.forEach(blockData => {
                            const oldMatrix = blockData.rotationMatrix.clone();
                            const opFunc = ['J','K','L'].includes(key) ? applyRotation : applyFlip;
                            opFunc(blockData.rotationMatrix, key); // BlockDataの行列を直接変更
                            blockData.updateMeshMatrix(); // メッシュ表示も更新
                            transformations.push({ blockId: blockData.id, oldMatrix: oldMatrix, newMatrix: blockData.rotationMatrix.clone() });
                        });
                        addAction({ type: 'TRANSFORM_BLOCKS', transformations: transformations });
                        console.log(`[KeyboardInput] ${selected.length} ブロック個別 回転/反転: ${key}`);
                        // UI更新は historyActions/selectionState 内のイベントで行われる想定
                    }
                    event.preventDefault(); return;

                } else if (currentMode === EditMode.RANGE_SELECT) {
                    // 【範囲選択モード】クリップボードがない場合は JKLUIO は何もしない
                    // (将来的に選択範囲自体の回転を実装する場合はここに処理追加)
                    console.log("[KeyboardInput] 範囲選択モード: JKLUIO 操作 (クリップボードなしのため無視)");
                    return;
                }
            }
        } // --- End of JKLUIO ---

    }); // --- End of keydown event listener ---

     console.log("[KeyboardInput] キーボードハンドラの初期化完了。");
} // --- End of initializeKeyboardInput ---