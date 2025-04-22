/**
 * @fileoverview キーボード入力イベントをグローバルに監視し、
 * 編集モードの切り替え、アンドゥ/リドゥ、回転/反転、コピー/カット/ペースト/クリップボードクリア、
 * 範囲選択ボックスのサイズ入れ替え、および関連するプレビュー更新などを実行するハンドラ。
 */

import * as THREE from 'three'; // Vector3のため
// --- 状態管理モジュール ---
import { getCurrentMode, setEditMode, EditMode } from '../state/editMode.js'; // 現在のモード取得、モード設定、モード定義
import { getPreviewOrientation, setPreviewOrientation } from '../state/placementState.js'; // 配置プレビューの向き取得・設定
import { addAction, undo, redo } from '../state/historyManager.js'; // アンドゥ・リドゥ実行、アクション追加
import { copySelectionToClipboard, cutSelectionToClipboard, pasteFromClipboard } from './clipboardHandler.js'; // コピー・カット・ペースト処理
import { clearClipboardData, hasClipboard, transformClipboardData, getClipboardData } from '../state/clipboardState.js'; // クリップボード状態確認・操作

// --- UIモジュール ---
import { updateModeIndicator } from '../ui/modeIndicator.js'; // モード表示UI更新
import { updatePreviewOrientation as updatePreviewMeshOrientation } from '../rendering/previewBlock.js'; // 配置プレビューメッシュの向き更新
import { updatePastePreview } from '../rendering/pastePreviewRenderer.js'; // ペーストプレビュー表示更新

// --- インタラクションモジュール ---
import { applyRotation, applyFlip, transformGroup } from '../interactions/rotationHandler.js'; // 回転・反転処理
import { getSelectedBlocks, getSelectionRangeBox, swapSelectionRangeAxes } from '../interactions/selectionState.js'; // クリック選択ブロック取得、範囲選択ボックス取得・サイズ入れ替え

// --- モジュール内変数 ---
/** @type {object | null} アプリケーション状態オブジェクトへの参照 */
let appStateRef = null;
/** @type {THREE.Vector3} 計算用の一時的な Vector3 */
const _center = new THREE.Vector3();

/**
 * キーボード入力イベントリスナーを初期化し、各種ショートカットキーを登録します。
 * eventManager.js から呼び出されます。
 * @param {object} appState - アプリケーションの状態オブジェクト。リスナー内で参照するために保持します。
 */
export function initializeKeyboardInput(appState) {
    console.log("[KeyboardInput] キーボードハンドラを初期化中...");
    // アプリケーション状態への参照をモジュール内に保持
    appStateRef = appState;
    // appState が渡されていない場合はエラーログを出して終了
    if (!appStateRef) {
        console.error("[KeyboardInput] 初期化エラー: appState が無効です。");
        return;
    }

    // ドキュメント全体でキーダウンイベントを監視
    document.addEventListener('keydown', (event) => {
        // アプリケーション状態がなければ処理中断
        if (!appStateRef) return;
        // scene オブジェクトも頻繁に使うので取得しておく (なければエラー)
        const { scene } = appStateRef;
        if (!scene) { console.error("[KeyboardInput] Sceneが見つかりません。"); return; }

        // --- 入力フィールドフォーカス時の制御 ---
        // イベント発生元が INPUT または TEXTAREA かどうかをチェック
        const targetElement = event.target;
        const isInputFocused = targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA';
        // Escapeキーとファンクションキー(F1-F12)以外は、入力フィールドにフォーカスがあればショートカットを無効化
        if (isInputFocused && event.key !== 'Escape' && !event.key.startsWith('F')) {
            // console.log("[KeyboardInput] Input focus detected, skipping shortcut.");
            return;
        }

        // --- 必要な情報を取得 ---
        const shiftPressed = event.shiftKey;        // Shiftキーの状態
        const ctrlPressed = event.ctrlKey || event.metaKey; // CtrlキーまたはCommandキー(Mac)の状態
        const altPressed = event.altKey;         // Altキーの状態
        const key = event.key.toUpperCase();      // 押されたキー (大文字に統一)
        const currentMode = getCurrentMode();     // 現在の編集モード

        // --- アンドゥ/リドゥ (Ctrl+Z, Ctrl+Y) ---
        // 他の Ctrl ショートカットよりも優先して処理する
        if (ctrlPressed && !shiftPressed && !altPressed) { // Ctrl(Cmd)キー単独の場合
            if (key === 'Z') { // Ctrl + Z
                console.log("[KeyboardInput] アンドゥ実行 (Ctrl+Z)");
                undo(); // historyManager の undo 関数を実行
                event.preventDefault(); // ブラウザ標準のアンドゥ動作を抑制
                return; // 他の処理は行わない
            }
            if (key === 'Y') { // Ctrl + Y
                 console.log("[KeyboardInput] リドゥ実行 (Ctrl+Y)");
                 redo(); // historyManager の redo 関数を実行
                 event.preventDefault(); // ブラウザ標準のリドゥ動作を抑制
                 return; // 他の処理は行わない
            }
        }

        // --- コピー/カット/ペースト (Ctrl+C, Ctrl+X, Ctrl+V) ---
        if (ctrlPressed && !shiftPressed && !altPressed) { // Ctrl(Cmd)キー単独の場合
             // コピー (Ctrl+C) と カット (Ctrl+X) は範囲選択モードでのみ有効
             if (currentMode === EditMode.RANGE_SELECT) {
                 if (key === 'C') {
                     console.log("[KeyboardInput] 範囲選択をクリップボードへコピー (Ctrl+C)");
                     copySelectionToClipboard(appStateRef); // clipboardHandler のコピー関数を呼び出し
                     event.preventDefault(); // ブラウザのコピー動作を抑制
                     return; // 他の処理はしない
                 }
                 if (key === 'X') {
                     console.log("[KeyboardInput] 範囲選択をクリップボードへカット (Ctrl+X)");
                     cutSelectionToClipboard(appStateRef); // clipboardHandler のカット関数を呼び出し
                     event.preventDefault(); // ブラウザのカット動作を抑制
                     return; // 他の処理はしない
                 }
             }
             // ペースト (Ctrl+V) は範囲選択モードで、かつクリップボードにデータがある場合のみ有効
             if (key === 'V') {
                 if (currentMode === EditMode.RANGE_SELECT && hasClipboard()) {
                     console.log("[KeyboardInput] クリップボードから貼り付け (Ctrl+V)");
                     pasteFromClipboard(appStateRef); // clipboardHandler のペースト関数を呼び出し
                 } else if (currentMode !== EditMode.RANGE_SELECT && hasClipboard()) {
                      console.log("[KeyboardInput] ペーストするには範囲選択モードに切り替えてください。");
                 } else if (!hasClipboard()) {
                      console.log("[KeyboardInput] クリップボードが空のためペーストできません。");
                 }
                 // Ctrl+V が押された場合は、ペースト実行の成否に関わらずデフォルト動作を抑制
                 event.preventDefault();
                 return; // 他の処理はしない
             }
        } // --- End of Copy/Cut/Paste ---

        // --- クリップボードクリア (Shift+Q) ---
        if (shiftPressed && !ctrlPressed && !altPressed) { // Shiftキー単独の場合
             if (key === 'Q') {
                 console.log("[KeyboardInput] クリップボードをクリア (Shift+Q)");
                 clearClipboardData(); // clipboardState のクリア関数を呼び出し
                 event.preventDefault(); // ブラウザのデフォルト動作抑制 (もしあれば)
                 return; // 他の処理はしない
             }
        } // --- End of Clear Clipboard ---


        // --- モード切り替え ---
        // CtrlキーやAltキーが押されていない場合のみモード切替を考慮
        let targetMode = null; // 切り替え先のモード候補
        if (!ctrlPressed && !altPressed) {
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
        // モード変更があれば実行し、UIを更新して終了
        if (targetMode !== null && targetMode !== currentMode) {
            setEditMode(targetMode);        // 新しいモードを設定
            updateModeIndicator(targetMode); // 画面右上の表示を更新
            return; // モード変更したら他のキー処理はしない
        }


        // --- 回転/反転 (JKL/UIO) ---
        // 修飾キーが押されていない場合に処理
        if (['J', 'K', 'L', 'U', 'I', 'O'].includes(key)) {
            if (!ctrlPressed && !altPressed && !shiftPressed) {

                // --- 【範囲選択モード】での JKLUIO 処理 ---
                if (currentMode === EditMode.RANGE_SELECT) {
                    let preventDefault = false; // デフォルト動作を抑制するかどうか

                    // ** JKL キー: 範囲サイズ入れ替え (+ クリップボードあれば回転/プレビュー更新) **
                    if (['J', 'K', 'L'].includes(key)) {
                        console.log(`[KeyboardInput] 範囲選択モード: ${key} キー処理`);
                        // 1. 範囲選択ボックスのサイズを入れ替え
                        swapSelectionRangeAxes(key, scene);
                        preventDefault = true;

                        // 2. クリップボードにデータがあれば、クリップボードデータも回転させ、プレビューを更新
                        if (hasClipboard()) {
                            console.log(`[KeyboardInput] クリップボードデータも ${key} で回転`);
                            transformClipboardData(key); // クリップボード回転
                            const currentRange = getSelectionRangeBox();
                            const clipboardContent = getClipboardData();
                            const previewCenter = currentRange ? currentRange.getCenter(_center).round() : _center.set(0,0,0);
                            if (clipboardContent) updatePastePreview(scene, clipboardContent, previewCenter); // プレビュー更新
                        }
                    }
                    // ** UIO キー: クリップボードがある場合のみ 反転/プレビュー更新 **
                    else if (['U', 'I', 'O'].includes(key)) {
                        if (hasClipboard()) {
                            console.log(`[KeyboardInput] クリップボードデータを ${key} で反転`);
                            transformClipboardData(key); // クリップボード反転
                            const currentRange = getSelectionRangeBox();
                            const clipboardContent = getClipboardData();
                            const previewCenter = currentRange ? currentRange.getCenter(_center).round() : _center.set(0,0,0);
                            if (clipboardContent) updatePastePreview(scene, clipboardContent, previewCenter); // プレビュー更新
                            preventDefault = true;
                        } else {
                            console.log("[KeyboardInput] 範囲選択モード: UIO 操作 (クリップボードなしのため無視)");
                        }
                    }

                    // JKL または UIO(クリップボードあり) が処理された場合
                    if (preventDefault) {
                         event.preventDefault();
                         return; // 範囲選択モードの処理はここで終了
                    }
                } // --- End of RANGE_SELECT mode JKLUIO ---

                // --- 【他のモード】での JKLUIO 処理 (クリップボードがない場合のみ) ---
                // クリップボードにデータがある場合は、他のモードでは JKLUIO は効かない仕様
                else if (!hasClipboard()) {
                    // 【通常モード】: 配置プレビューの回転/反転
                    if (currentMode === EditMode.NORMAL) {
                        const currentOrientation = getPreviewOrientation();
                        const opFunc = ['J','K','L'].includes(key) ? applyRotation : applyFlip;
                        opFunc(currentOrientation, key);
                        setPreviewOrientation(currentOrientation);
                        updatePreviewMeshOrientation(currentOrientation);
                        console.log(`[KeyboardInput] プレビュー 回転/反転: ${key}`);
                        event.preventDefault(); return;
                    }
                    // 【XML編集モード】: 選択中のブロックを個別に回転/反転
                    else if (currentMode === EditMode.XML_EDIT) {
                        const selected = getSelectedBlocks();
                        if (selected.length > 0) {
                            const opFunc = ['J','K','L'].includes(key) ? applyRotation : applyFlip;
                            const transformations = [];
                            selected.forEach(blockData => { /* ... 行列変更、メッシュ更新、transformations記録 ... */ });
                            addAction({ type: 'TRANSFORM_BLOCKS', transformations: transformations });
                            console.log(`[KeyboardInput] ${selected.length} ブロック個別 回転/反転: ${key}`);
                        }
                         event.preventDefault(); return;
                    }
                }
            }
        } // --- End of JKLUIO processing ---

    }); // --- End of keydown event listener ---

     console.log("[KeyboardInput] キーボードハンドラの初期化完了。");
} // --- End of initializeKeyboardInput ---