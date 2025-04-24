/**
 * @fileoverview ペイントモード (EditMode.PAINT) におけるポインターイベント処理を担当します。
 * マウスのクリックやドラッグに応じて、ブロックの面の特定や色情報の適用を行います。
 */

import * as THREE from 'three'; // Raycaster 等で必要になる可能性
import { getMouseNDCFromEvent } from './mouseInteractionHandler.js'; // 共通のマウス座標取得関数
// ★ interactionUtils.js に getIntersectedBlockFaceInfo 関数を別途実装する必要があります
import { getIntersectedBlockFaceInfo } from '../interactions/interactionUtils.js';
// ★ paintState.js (未実装) から状態を取得・設定する関数 (仮インポート)
// import { getCurrentPaintTool, getCurrentColor } from '../state/paintState.js';
// ★ paintActions.js から実際のペイント処理関数をインポート
import { applyPaintNormal, applyPaintAdditive, applyPaintReplace } from '../interactions/paintActions.js';

// --- モジュール内変数 (ドラッグペイント用状態) ---
/** @type {boolean} マウスボタンを押下してペイント操作中かどうか */
let isPainting = false;
/** @type {number | null} 最後にペイント処理を適用したブロックのID */
let lastPaintedBlockId = null;
/** @type {number | null} 最後にペイント処理を適用した面のインデックス (ジオメトリ依存) */
let lastPaintedFaceIndex = null;

/**
 * PointerDownイベント処理 (ペイントモード)
 * クリックされたブロックと面を特定し、選択中のツールに応じたペイント処理を開始します。
 * 通常ツールと特殊ツールの場合は、ドラッグペイント状態を開始します。
 * @param {PointerEvent} event - ポインターイベントオブジェクト。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handlePointerDown(event, appState) {
    // console.log("[PaintInteraction] PointerDown");

    // 1. クリック位置から Raycasting でブロックと面を特定
    const mouseNDC = getMouseNDCFromEvent(event, appState.renderer.domElement);
    // ★ interactionUtils.js に実装が必要な関数
    const intersection = getIntersectedBlockFaceInfo ? getIntersectedBlockFaceInfo(mouseNDC, appState.camera, appState.loadedBlocks) : null;

    // 面にヒットしなかったら処理終了
    if (!intersection) {
        // console.log("[PaintInteraction] No block face intersected.");
        return;
    }

    const { blockData, faceIndex } = intersection;

    // 2. ペイント処理を実行
    // ★ 仮実装: 現在のツールと色をUIから取得 (本来は paintState から取得)
    const currentTool = document.querySelector('.paint-tool-button.active')?.dataset.paintTool || 'normal';
    const currentColor = document.querySelector('.color-swatch.active')?.dataset.color || 'FFFFFF';
    // const currentTool = getCurrentPaintTool(); // ★ 将来の paintState.js から取得
    // const currentColor = getCurrentColor();   // ★ 将来の paintState.js から取得

    let initiateDragPainting = false; // ドラッグペイントを開始するかどうか

    switch (currentTool) {
        case 'normal':
            applyPaintNormal(blockData, faceIndex, currentColor);
            initiateDragPainting = true; // 通常ツールはドラッグペイント有効
            break;
        case 'special':
            applyPaintAdditive(blockData, currentColor);
            initiateDragPainting = true; // 特殊ツールもドラッグペイント有効（同じブロックはスキップされる）
            break;
        case 'replace':
            // 置き換えツールはクリック時のみ実行
            applyPaintReplace(blockData, faceIndex, currentColor, appState.loadedBlocks);
            initiateDragPainting = false;
            break;
        default:
            console.warn(`[PaintInteraction] 未知のペイントツール: ${currentTool}`);
            break;
    }

    // 3. ドラッグペイント用の状態を初期化 (必要な場合)
    if (initiateDragPainting) {
        isPainting = true;
        lastPaintedBlockId = blockData.id;
        lastPaintedFaceIndex = faceIndex;
    } else {
        isPainting = false; // 置き換えツールなどはドラッグしない
        lastPaintedBlockId = null;
        lastPaintedFaceIndex = null;
    }

    // イベントの伝播を止める (カメラコントロールなどを抑制)
    event.stopPropagation();
}

/**
 * PointerMoveイベント処理 (ペイントモード)
 * isPainting が true の場合、ドラッグ中に新しい面にポインターが移動したら、
 * その面に選択中のツール（通常または特殊）に応じたペイント処理を実行します。
 * @param {PointerEvent} event - ポインターイベントオブジェクト。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handlePointerMove(event, appState) {
    // isPainting フラグが false (ドラッグ中でない、または置き換えツール使用時) なら何もしない
    if (!isPainting) return;

    // 1. 現在のポインター位置でブロックと面を特定
    const mouseNDC = getMouseNDCFromEvent(event, appState.renderer.domElement);
    const intersection = getIntersectedBlockFaceInfo ? getIntersectedBlockFaceInfo(mouseNDC, appState.camera, appState.loadedBlocks) : null;

    if (intersection) {
        const { blockData, faceIndex } = intersection;

        // 2. 最後にペイントした面と異なる場合のみペイント実行
        if (blockData.id !== lastPaintedBlockId || faceIndex !== lastPaintedFaceIndex) {

            // ★ 仮実装: 現在のツールと色を取得
            const currentTool = document.querySelector('.paint-tool-button.active')?.dataset.paintTool || 'normal';
            const currentColor = document.querySelector('.color-swatch.active')?.dataset.color || 'FFFFFF';
            // const currentTool = getCurrentPaintTool();
            // const currentColor = getCurrentColor();

            // 3. ツールに応じたペイント処理を実行 (Replace はドラッグしないので除外)
            if (currentTool === 'normal') {
                applyPaintNormal(blockData, faceIndex, currentColor);
            } else if (currentTool === 'special') {
                // Additive はブロック単位なので、ブロックIDが変わった場合のみ適用
                if (blockData.id !== lastPaintedBlockId) {
                    applyPaintAdditive(blockData, currentColor);
                }
            }
            // -----------------

            // 最後にペイントした面情報を更新
            lastPaintedBlockId = blockData.id;
            lastPaintedFaceIndex = faceIndex;
        }
    } else {
        // ドラッグ中にブロックから外れたら、最後の情報をリセット
        lastPaintedBlockId = null;
        lastPaintedFaceIndex = null;
    }
}

/**
 * PointerUpイベント処理 (ペイントモード)
 * ドラッグペイント状態を終了します。
 * @param {PointerEvent} event - ポインターイベントオブジェクト。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handlePointerUp(event, appState) {
    if (!isPainting) return; // ペイント中でなければ何もしない
    // console.log("[PaintInteraction] PointerUp - Painting finished");

    // ドラッグ状態をリセット
    isPainting = false;
    lastPaintedBlockId = null;
    lastPaintedFaceIndex = null;

    // ★ TODO (Phase 3.4 補完):
    // ドラッグ中の一連のペイント操作を一つのアクションとしてアンドゥ履歴に登録する場合、
    // PointerDownで一時的な変更リストを開始し、ここでまとめてaddActionを呼び出すなどの工夫が必要。
    // 現状は PointerDown/Move の各 applyPaintXXX 内で個別に履歴登録されている。
}

/**
 * PointerLeaveイベント処理 (ペイントモード)
 * キャンバス外にポインターが出た場合にドラッグペイント状態を終了します。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handlePointerLeave(appState) {
    if (!isPainting) return; // ペイント中でなければ何もしない
    // console.log("[PaintInteraction] PointerLeave - Painting cancelled/finished");

    // ドラッグ状態をリセット
    isPainting = false;
    lastPaintedBlockId = null;
    lastPaintedFaceIndex = null;

    // ★ TODO (Phase 3.4 補完): PointerUpと同様にアンドゥ履歴の扱いを検討。
}