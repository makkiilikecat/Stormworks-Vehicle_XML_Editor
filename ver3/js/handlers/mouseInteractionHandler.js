/**
 * @fileoverview Canvas 上でのマウス/ポインターイベントを統括するディスパッチャ。
 *
 * 概要:
 * - HTML の <canvas id="three-canvas"> 要素で発生するポインターイベント
 * (pointerdown, pointermove, pointerup, pointerleave) を捕捉します。
 * - 現在の編集モード (state/editMode.js で管理) を確認します。
 * - モードに応じて、対応する専用のインタラクションハンドラモジュール
 * (例: normalInteractionHandler.js, xmlEditInteractionHandler.js など) の
 * 適切な関数を呼び出し、実際のイベント処理を委譲します。
 * - マウス座標を Three.js で使用する正規化デバイス座標 (NDC) に変換する
 * ヘルパー関数も提供します。
 *
 * 依存関係:
 * - state/editMode.js: 現在の編集モードを取得・判定するため。
 * - 各モード別インタラクションハンドラ (*InteractionHandler.js): イベント処理を委譲するため。
 */

import * as THREE from 'three'; // NDC座標用に Vector2 を使用
import { getCurrentMode, EditMode } from '../state/editMode.js'; // 編集モード定義と現在モード取得

// --- 各モードに対応するインタラクションハンドラをインポート ---
// これらのモジュールは、各編集モードにおける具体的なマウス操作処理を実装します。
import * as rangeInteraction from './rangeInteractionHandler.js';     // 範囲選択モード用
import * as xmlEditInteraction from './xmlEditInteractionHandler.js'; // XML編集モード用
import * as normalInteraction from './normalInteractionHandler.js';    // 通常(配置)モード用
import * as deleteInteraction from './deleteInteractionHandler.js';    // 削除モード用
import * as paintInteraction from './paintInteractionHandler.js';     // ペイントモード用

// --- ヘルパー関数 ---

/**
 * マウス/ポインターイベントオブジェクトから、Three.js の Raycasting で使用する
 * 正規化デバイス座標 (Normalized Device Coordinates - NDC) を計算します。
 * NDC は画面や Canvas のサイズに関わらず、左下が (-1, -1)、右上が (1, 1) となる座標系です。
 *
 * @param {PointerEvent} event -発生したポインターイベント (pointerdown, pointermove など)。 clientX, clientY プロパティを持つ必要があります。
 * @param {HTMLElement} domElement - イベントが発生した DOM 要素 (通常は Three.js レンダラーの Canvas)。座標計算の基準となります。
 * @returns {THREE.Vector2} 計算された NDC 座標。
 * @export // 他のハンドラモジュールからも利用できるようにエクスポート
 */
export function getMouseNDCFromEvent(event, domElement) {
    // domElement (Canvas) の画面上の位置とサイズを取得
    const rect = domElement.getBoundingClientRect();
    // マウスポインターのクライアント座標 (ビューポート左上基準) を取得
    const clientX = event.clientX;
    const clientY = event.clientY;
    // クライアント座標を Canvas 要素内の相対座標 (左上基準) に変換
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    // Canvas 内相対座標を NDC (-1 から +1 の範囲) に変換
    // X座標: (相対X / 幅) を 0~1 に正規化し、2倍して -1 する -> -1 ~ +1
    const ndcX = (canvasX / rect.width) * 2 - 1;
    // Y座標: (相対Y / 高さ) を 0~1 に正規化し、符号反転して 2倍して +1 する -> +1 ~ -1 (Three.js の Y軸上向きに合わせる)
    const ndcY = -(canvasY / rect.height) * 2 + 1;
    // 計算結果を Vector2 オブジェクトとして返す
    return new THREE.Vector2(ndcX, ndcY);
}


// --- 公開イベントハンドラ関数 ---
// これらの関数は eventManager.js で Canvas 要素のイベントリスナーに登録され、
// ポインターイベントが発生するたびに呼び出されます。

/**
 * Canvas 上でポインターが押された (pointerdown) ときの処理。
 * 現在の編集モードを確認し、対応するモードのハンドラに処理を委譲します。
 * 主に、ブロックの配置開始、選択開始、削除実行、ドラッグ操作の開始などをトリガーします。
 *
 * @param {PointerEvent} event - PointerEvent オブジェクト。button プロパティで押されたボタンを判定します。
 * @param {object} appState - アプリケーション全体の状態オブジェクト。各ハンドラが必要な情報 (camera, scene, loadedBlocks など) を含みます。
 */
export function handleCanvasPointerDown(event, appState) {
    // appState や controls の存在チェック、マウス左ボタン(button===0)以外、カメラ操作無効時は処理しない
    if (!appState || !appState.controls || event.button !== 0 || !appState.controls.enabled) {
        // console.log("[MouseInteraction] PointerDown skipped (invalid state or button).");
        return;
    }

    // 現在の編集モードを取得
    const currentMode = getCurrentMode();
    // console.log(`[MouseInteraction] PointerDown in mode: ${currentMode}`);

    // モードに応じて処理を分岐し、各モード専用ハンドラの handlePointerDown を呼び出す
    switch (currentMode) {
        case EditMode.NORMAL:       // 通常 (配置) モード
            normalInteraction.handlePointerDown(event, appState);
            break;
        case EditMode.DELETE:       // 削除モード
            deleteInteraction.handlePointerDown(event, appState);
            break;
        case EditMode.XML_EDIT:     // XML編集モード
            xmlEditInteraction.handlePointerDown(event, appState);
            break;
        case EditMode.RANGE_SELECT: // 範囲選択モード
            rangeInteraction.handlePointerDown(event, appState);
            break;
        case EditMode.PAINT:        // ペイントモード
            paintInteraction.handlePointerDown(event, appState);
            break;
        default:                    // 未知のモード
            console.warn(`[MouseInteraction] 未知のモード (${currentMode}) で PointerDown が発生しました。`);
    }
}

/**
 * Canvas 上でポインターが移動した (pointermove) ときの処理。
 * 現在の編集モードを確認し、対応するモードのハンドラに処理を委譲します。
 * 主に、ブロック配置プレビューの更新、ドラッグ操作（範囲選択、変形、ペイント）中の処理などを実行します。
 *
 * @param {PointerEvent} event - PointerEvent オブジェクト。現在のポインター位置情報を含みます。
 * @param {object} appState - アプリケーション全体の状態オブジェクト。
 */
export function handleCanvasPointerMove(event, appState) {
    // appState チェック (頻繁に呼ばれるため、最低限のチェック)
    if (!appState) return;

    // 現在の編集モードを取得
    const currentMode = getCurrentMode();
    // console.log(`[MouseInteraction] PointerMove in mode: ${currentMode}`); // ログは頻繁すぎるのでコメントアウト推奨

    // モードに応じて処理を分岐し、各モード専用ハンドラの handlePointerMove を呼び出す
    switch (currentMode) {
        case EditMode.NORMAL:       // 通常 (配置) モード: プレビュー更新など
            normalInteraction.handlePointerMove(event, appState);
            break;
        case EditMode.DELETE:       // 削除モード: 通常は何もしない (プレビュー非表示など)
            deleteInteraction.handlePointerMove(event, appState);
            break;
        case EditMode.XML_EDIT:     // XML編集モード: ドラッグ変形処理など
            xmlEditInteraction.handlePointerMove(event, appState);
            break;
        case EditMode.RANGE_SELECT: // 範囲選択モード: ギズモドラッグ処理など
            rangeInteraction.handlePointerMove(event, appState);
            break;
        case EditMode.PAINT:        // ペイントモード: ドラッグペイント処理など
            paintInteraction.handlePointerMove(event, appState);
            break;
        default:                    // 未知のモードや処理不要なモード
            break;
    }
}

/**
 * Canvas 上でポインターが離された (pointerup) ときの処理。
 * 現在の編集モードを確認し、対応するモードのハンドラに処理を委譲します。
 * 主に、ドラッグ操作の終了・確定処理などを実行します。
 *
 * @param {PointerEvent} event - PointerEvent オブジェクト。button プロパティで離されたボタンを判定します。
 * @param {object} appState - アプリケーション全体の状態オブジェクト。
 */
export function handleCanvasPointerUp(event, appState) {
    // appState チェック、マウス左ボタン(button===0)以外は処理しない
    if (!appState || event.button !== 0) {
        return;
    }

    // 現在の編集モードを取得
    const currentMode = getCurrentMode();
    // console.log(`[MouseInteraction] PointerUp in mode: ${currentMode}`);

    // モードに応じて処理を分岐し、各モード専用ハンドラの handlePointerUp を呼び出す
    switch (currentMode) {
        case EditMode.NORMAL:       // 通常 (配置) モード: 通常は何もしない
            normalInteraction.handlePointerUp(event, appState);
            break;
        case EditMode.DELETE:       // 削除モード: 通常は何もしない
            deleteInteraction.handlePointerUp(event, appState);
            break;
        case EditMode.XML_EDIT:     // XML編集モード: ドラッグ変形終了・確定など
            xmlEditInteraction.handlePointerUp(event, appState);
            break;
        case EditMode.RANGE_SELECT: // 範囲選択モード: ギズモドラッグ終了・確定など
            rangeInteraction.handlePointerUp(event, appState);
            break;
        case EditMode.PAINT:        // ペイントモード: ドラッグペイント終了など
            paintInteraction.handlePointerUp(event, appState);
            break;
        default:                    // 未知のモード
            break;
    }
}

/**
 * Canvas からポインターが離れた (pointerleave) ときの処理。
 * 現在の編集モードを確認し、対応するモードのハンドラに処理を委譲します。
 * 主に、ブロック配置プレビューの非表示、ドラッグ操作のキャンセル・終了処理などを実行します。
 *
 * @param {object} appState - アプリケーション全体の状態オブジェクト。
 */
export function handleCanvasPointerLeave(appState) {
    // appState チェック
    if (!appState) return;

    // 現在の編集モードを取得
    const currentMode = getCurrentMode();
    // console.log(`[MouseInteraction] PointerLeave in mode: ${currentMode}`);

    // モードに応じて処理を分岐し、各モード専用ハンドラの handlePointerLeave を呼び出す
    switch (currentMode) {
        case EditMode.NORMAL:       // 通常 (配置) モード: プレビュー非表示
            normalInteraction.handlePointerLeave(appState);
            break;
        case EditMode.DELETE:       // 削除モード: 通常は何もしない (プレビュー非表示など)
            deleteInteraction.handlePointerLeave(appState);
            break;
        case EditMode.XML_EDIT:     // XML編集モード: ドラッグ変形キャンセル/終了など
            xmlEditInteraction.handlePointerLeave(appState);
            break;
        case EditMode.RANGE_SELECT: // 範囲選択モード: ギズモドラッグキャンセル/終了など
            rangeInteraction.handlePointerLeave(appState);
            break;
        case EditMode.PAINT:        // ペイントモード: ドラッグペイントキャンセル/終了など
            paintInteraction.handlePointerLeave(appState);
            break;
        default:                    // 未知のモード
            break;
    }
}