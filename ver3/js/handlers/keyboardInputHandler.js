/**
 * @fileoverview キーボード入力イベントをグローバルに監視し、
 * 編集モードの切り替え、アンドゥ/リドゥ、回転/反転、コピー/カット/ペースト/クリップボードクリア、
 * および関連するプレビュー更新などを実行するハンドラ。
 */

import * as THREE from 'three'; // Vector3のため (_centerで使用)
// --- 状態管理モジュールのインポート ---
import { getCurrentMode, setEditMode, EditMode } from '../state/editMode.js'; // モード取得・設定
import { getPreviewOrientation, setPreviewOrientation } from '../state/placementState.js'; // プレビュー向き
import { addAction, undo, redo } from '../state/historyManager.js'; // アンドゥ・リドゥ
import { copySelectionToClipboard, cutSelectionToClipboard, pasteFromClipboard } from './clipboardHandler.js'; // コピー・カット・ペースト処理
import { clearClipboardData, hasClipboard, transformClipboardData, getClipboardData } from '../state/clipboardState.js'; // クリップボード状態・操作

// --- UIモジュールのインポート ---
import { updateModeIndicator } from '../ui/modeIndicator.js'; // モード表示更新
import { updatePreviewOrientation as updatePreviewMeshOrientation } from '../rendering/previewBlock.js'; // 配置プレビュー向き更新
import { updatePastePreview } from '../rendering/pastePreviewRenderer.js'; // ペーストプレビュー更新

// --- インタラクションモジュールのインポート ---
import { applyRotation, applyFlip, transformGroup } from '../interactions/rotationHandler.js'; // 回転・反転処理
// ★修正: swapSelectionRangeAxes も selectionState からインポート
import { getSelectedBlocks, getSelectionRangeBox, swapSelectionRangeAxes } from '../interactions/selectionState.js'; // 選択ブロック取得、範囲取得、範囲サイズ入れ替え

// --- モジュール内変数 ---
/** @type {object | null} アプリケーション状態オブジェクトへの参照 */
let appStateRef = null;
/** @type {THREE.Vector3} 計算用の一時ベクトル */
const _center = new THREE.Vector3();

/**
 * キーボード入力イベントリスナーを初期化し、各種ショートカットキーを登録します。
 * eventManager.js または main.js から呼び出されます。
 * @param {object} appState - アプリケーションの状態オブジェクト。リスナー内で参照するために保持します。
 */
export function initializeKeyboardInput(appState) {
    console.log("[KeyboardInput] キーボードハンドラを初期化中...");
    appStateRef = appState; // 参照を保持
    if (!appStateRef) {
        console.error("[KeyboardInput] 初期化エラー: appState が無効です。");
        return;
    }

    // ドキュメント全体でキーダウンイベントを監視
    document.addEventListener('keydown', (event) => {
        // アプリケーション状態がなければ何もしない (安全策)
        if (!appStateRef) return;
        // scene はプレビュー更新などで必要なので取得しておく
        const { scene } = appStateRef;
        if (!scene) { console.error("[KeyboardInput] Sceneが見つかりません。"); return; }

        // --- 入力フィールドフォーカス時の制御 ---
        const targetElement = event.target;
        // INPUT または TEXTAREA 要素にフォーカスがあるか判定
        const isInputFocused = targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA';
        // Escapeキーとファンクションキー以外は、入力フィールドフォーカス中はショートカット無効
        if (isInputFocused && event.key !== 'Escape' && !event.key.startsWith('F')) {
            // console.log("[KeyboardInput] Input focus detected, skipping keyboard shortcut.");
            return;
        }

        // --- 修飾キーの状態と押されたキーを取得 ---
        const shiftPressed = event.shiftKey;
        const ctrlPressed = event.ctrlKey || event.metaKey; // Windows/Linux: Ctrl, Mac: Command
        const altPressed = event.altKey;
        const key = event.key.toUpperCase(); // キー名を大文字に統一 (比較のため)
        const currentMode = getCurrentMode(); // 現在の編集モード

        // =============================================
        // --- ショートカットキー処理 ---
        // =============================================

        // --- アンドゥ/リドゥ (Ctrl+Z / Ctrl+Y) ---
        // ※ 他のCtrl系ショートカットより先に判定
        if (ctrlPressed && !shiftPressed && !altPressed) { // Ctrl/Cmdキー単独の場合
            if (key === 'Z') {
                console.log("[KeyboardInput] アンドゥ実行 (Ctrl+Z)");
                undo(); // historyManager のアンドゥ関数呼び出し
                event.preventDefault(); // ブラウザのデフォルト動作（例: テキスト入力のアンドゥ）を抑制
                return; // このキー処理はここで終了
            }
            if (key === 'Y') {
                 console.log("[KeyboardInput] リドゥ実行 (Ctrl+Y)");
                 redo(); // historyManager のリドゥ関数呼び出し
                 event.preventDefault(); // ブラウザのデフォルト動作抑制
                 return; // このキー処理はここで終了
            }
        }

        // --- コピー/カット/ペースト (Ctrl+C / Ctrl+X / Ctrl+V) ---
        if (ctrlPressed && !shiftPressed && !altPressed) { // Ctrl/Cmdキー単独の場合
             // コピーとカットは範囲選択モードでのみ有効
             if (currentMode === EditMode.RANGE_SELECT) {
                 if (key === 'C') {
                     console.log("[KeyboardInput] 範囲選択をクリップボードへコピー (Ctrl+C)");
                     copySelectionToClipboard(appStateRef); // clipboardHandler の関数呼び出し
                     event.preventDefault(); return;
                 }
                 if (key === 'X') {
                     console.log("[KeyboardInput] 範囲選択をクリップボードへカット (Ctrl+X)");
                     cutSelectionToClipboard(appStateRef); // clipboardHandler の関数呼び出し
                     event.preventDefault(); return;
                 }
             }
             // ペースト (Ctrl+V)
             if (key === 'V') {
                 // 範囲選択モード かつ クリップボードにデータがある場合のみ実行
                 if (currentMode === EditMode.RANGE_SELECT && hasClipboard()) {
                     console.log("[KeyboardInput] クリップボードから貼り付け (Ctrl+V)");
                     pasteFromClipboard(appStateRef); // clipboardHandler の関数呼び出し
                     event.preventDefault(); return;
                 } else if (currentMode !== EditMode.RANGE_SELECT && hasClipboard()) {
                      // 範囲選択モード以外でクリップボードにデータがある場合
                      console.log("[KeyboardInput] ペーストするには範囲選択モードに切り替えてください。");
                 } else if (!hasClipboard()) {
                      // クリップボードが空の場合
                      console.log("[KeyboardInput] クリップボードが空のためペーストできません。");
                 }
                 // ペーストが実行されなくても、ブラウザのデフォルト動作は抑制
                 if(key === 'V') event.preventDefault(); return;
             }
        } // --- End of Copy/Cut/Paste ---

        // --- クリップボードクリア (Shift+Q) ---
        if (shiftPressed && !ctrlPressed && !altPressed && key === 'Q') { // Shiftキー単独の場合
             console.log("[KeyboardInput] クリップボードをクリア (Shift+Q)");
             clearClipboardData(); // clipboardState の関数を呼び出す
             event.preventDefault(); // ブラウザのデフォルト動作抑制 (もしあれば)
             return; // このキー処理はここで終了
        }

        // --- モード切り替え ---
        // Ctrl, Alt が押されていない場合のみ
        let targetMode = null;
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
        // モード変更が要求されたら実行し、UIを更新
        if (targetMode !== null && targetMode !== currentMode) {
            setEditMode(targetMode);           // editMode.js の状態を変更
            // updateModeIndicator は editmodechange イベントリスナー (main.js -> uiInteractions.js) で呼び出される想定
            // updateModeIndicator(targetMode);
            return; // モード変更したら他のキー処理はしない
        }

        // --- 回転/反転 (J, K, L / U, I, O) ---
        // 修飾キーが押されていない場合のみ
        if (['J', 'K', 'L', 'U', 'I', 'O'].includes(key)) {
            if (!ctrlPressed && !altPressed && !shiftPressed) {

                let preventDefault = false; // event.preventDefault() を呼ぶかのフラグ

                // 【範囲選択モード】での JKL / UIO 処理
                if (currentMode === EditMode.RANGE_SELECT) {
                    // JKL キー: 範囲サイズ入れ替え (+ クリップボード回転/プレビュー更新)
                    if (['J', 'K', 'L'].includes(key)) {
                        console.log(`[KeyboardInput] 範囲選択モード: ${key} キー処理 (サイズ入れ替え + クリップボード回転)`);
                        // 1. 選択範囲のサイズを入れ替え
                        swapSelectionRangeAxes(key, scene);
                        // 2. クリップボードにデータがあれば、データ回転とプレビュー更新
                        if (hasClipboard()) {
                            transformClipboardData(key); // クリップボード回転
                            const currentRange = getSelectionRangeBox();
                            const clipboardContent = getClipboardData();
                            const previewCenter = currentRange ? currentRange.getCenter(_center).round() : _center.set(0,0,0);
                            if (clipboardContent) updatePastePreview(scene, clipboardContent, previewCenter);
                        }
                        preventDefault = true;
                    }
                    // UIO キー: クリップボードがあればデータ反転/プレビュー更新
                    else if (['U', 'I', 'O'].includes(key)) {
                        if (hasClipboard()) {
                            console.log(`[KeyboardInput] 範囲選択モード: ${key} キー処理 (クリップボード反転)`);
                            transformClipboardData(key); // クリップボード反転
                            const currentRange = getSelectionRangeBox();
                            const clipboardContent = getClipboardData();
                            const previewCenter = currentRange ? currentRange.getCenter(_center).round() : _center.set(0,0,0);
                            if (clipboardContent) updatePastePreview(scene, clipboardContent, previewCenter);
                            preventDefault = true;
                        } else {
                            console.log("[KeyboardInput] 範囲選択モード: UIO 操作 (クリップボードなしのため無視)");
                        }
                    }
                }
                // 【通常モード】での JKLUIO 処理 (クリップボードがない場合のみ)
                else if (currentMode === EditMode.NORMAL) {
                    const currentOrientation = getPreviewOrientation();
                    const opFunc = ['J','K','L'].includes(key) ? applyRotation : applyFlip;
                    opFunc(currentOrientation, key); // プレビューの向きを直接変更
                    setPreviewOrientation(currentOrientation); // 状態を更新
                    updatePreviewMeshOrientation(currentOrientation); // 実際のメッシュ表示を更新
                    console.log(`[KeyboardInput] プレビュー 回転/反転: ${key}`);
                    preventDefault = true;
                }
                // 【XML編集モード】での JKLUIO 処理 (クリップボードがない場合のみ)
                else if (currentMode === EditMode.XML_EDIT) {
                    const selected = getSelectedBlocks();
                    if (selected.length > 0) {
                        const transformations = [];
                        const opFunc = ['J','K','L'].includes(key) ? applyRotation : applyFlip;
                        selected.forEach(blockData => {
                            const oldMatrix = blockData.rotationMatrix.clone();
                            opFunc(blockData.rotationMatrix, key); // 各ブロックの回転行列を変更
                            blockData.updateMeshMatrix(); // メッシュ表示更新
                            transformations.push({ blockId: blockData.id, oldMatrix: oldMatrix, newMatrix: blockData.rotationMatrix.clone() });
                        });
                        addAction({ type: 'TRANSFORM_BLOCKS', transformations: transformations }); // アンドゥ履歴登録
                        console.log(`[KeyboardInput] ${selected.length} ブロック個別 回転/反転: ${key}`);
                        preventDefault = true;
                    }
                }

                // 操作が行われた場合はデフォルト動作を抑制し、処理終了
                if (preventDefault) {
                    event.preventDefault();
                    return;
                }
            }
        } // --- End of JKLUIO ---

    }); // --- End of keydown event listener ---

     console.log("[KeyboardInput] キーボードハンドラの初期化完了。");
} // --- End of initializeKeyboardInput ---