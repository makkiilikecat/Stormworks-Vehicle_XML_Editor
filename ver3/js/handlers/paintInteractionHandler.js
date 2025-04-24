/**
 * @fileoverview ペイントモード (EditMode.PAINT) におけるマウス/ポインターイベントの処理を担当します。
 *
 * このハンドラは、ユーザーがペイントモード中にキャンバス上でマウス操作（クリック、ドラッグ）を行った際に、
 * 以下の処理を行います。
 * 1. マウスカーソル下のブロックおよび面を特定します (interactionUtils.js を利用)。
 * 2. 現在選択されているペイントツールと色情報を取得します (paintState.js を利用 - 将来実装)。
 * 3. 特定されたブロックと面、および選択中のツール/色に基づいて、
 * 実際のペイント処理（BlockDataの更新と履歴登録）を paintActions.js に依頼します。
 * 4. ドラッグによる連続ペイントに対応します。
 */

import * as THREE from 'three'; // 必要に応じて (Vector2 などで使用される可能性があるため残す)
import { getMouseNDCFromEvent } from './mouseInteractionHandler.js'; // マウス座標取得ヘルパー
// ★注意: getIntersectedBlockFaceInfo は interactionUtils.js に別途実装が必要です
import { getIntersectedBlockFaceInfo } from '../interactions/interactionUtils.js'; // ブロックと面インデックスを取得する関数
// import { getCurrentPaintTool, getCurrentColor } from '../state/paintState.js'; // ★未実装: 現在のペイントツールと色を取得する関数
import { applyPaintNormal } from '../interactions/paintActions.js'; // ★ Stage 3.3で実装: 通常ペイント処理を実行する関数
// import { applyPaintAdditive, applyPaintReplace } from '../interactions/paintActions.js'; // ★ Stage 4で実装予定

// --- モジュール内変数 ---

/** @type {boolean} マウスボタンが押下され、ドラッグによるペイント操作が有効かを示すフラグ */
let isPainting = false;
/** @type {number | null} ドラッグ中に最後にペイント処理が適用されたブロックのID */
let lastPaintedBlockId = null;
/** @type {number | null} ドラッグ中に最後にペイント処理が適用された面のインデックス (ジオメトリ依存) */
let lastPaintedFaceIndex = null;

/**
 * PointerDownイベント処理 (ペイントモード)
 *
 * マウスボタンが押されたときに呼び出されます。
 * 1. クリック位置にあるブロックの面を特定します。
 * 2. 特定された面に、選択中のツールと色でペイント処理を実行します。
 * 3. ドラッグによる連続ペイントを開始できるように状態を初期化します。
 *
 * @param {PointerEvent} event - ポインターダウンイベントオブジェクト。
 * @param {object} appState - アプリケーションの状態オブジェクト (カメラ、レンダラー、ブロックリストを含む)。
 */
export function handlePointerDown(event, appState) {
    // console.log("[PaintInteraction] PointerDown");

    // マウス座標を正規化デバイス座標(-1 ~ +1)に変換
    const mouseNDC = getMouseNDCFromEvent(event, appState.renderer.domElement);
    // マウスカーソル直下のブロックと面の情報を取得
    // ★注意: getIntersectedBlockFaceInfo は interactionUtils.js に別途実装が必要です
    const intersection = getIntersectedBlockFaceInfo ? getIntersectedBlockFaceInfo(mouseNDC, appState.camera, appState.loadedBlocks) : null;

    // ブロックの面にヒットしなかった場合は処理終了
    if (!intersection) {
        // console.log("[PaintInteraction] No block face intersected.");
        return;
    }

    // 交差したブロックデータと面のインデックスを取得
    const { blockData, faceIndex } = intersection;
    // console.log(`[PaintInteraction] Intersected Block ID: ${blockData.id}, Face Index: ${faceIndex}`);

    // --- ペイント処理の実行 ---
    // ★未実装: 現在のペイントツールと色を paintState から取得する必要があります
    const currentTool = 'normal'; // 仮に 'normal' 固定
    const currentColor = 'FF0000'; // 仮に赤色 ("FF0000") 固定。実際の色の取得処理が必要です。
    // const currentTool = getCurrentPaintTool();
    // const currentColor = getCurrentColor();

    // 選択中のツールに応じて処理を分岐
    if (currentTool === 'normal') {
        // 「通常」ペイントツールの場合: paintActions.js の関数を呼び出す
        applyPaintNormal(blockData, faceIndex, currentColor);
    } else if (currentTool === 'special') {
        // TODO (Stage 4.1): 「特殊」ペイントツールの処理 (Additive Color)
        // applyPaintAdditive(blockData, currentColor); // 仮の関数呼び出し
        console.log(`[PaintInteraction] TODO: Apply additive paint ${currentColor} to Block ${blockData.id}`);
    } else if (currentTool === 'replace') {
        // TODO (Stage 4.2): 「置き換え」ペイントツールの処理
        // applyPaintReplace(blockData, faceIndex, currentColor); // 仮の関数呼び出し
        console.log(`[PaintInteraction] TODO: Apply replace paint ${currentColor} to Block ${blockData.id}, Face ${faceIndex}`);
    }
    // ------------------------

    // ドラッグペイント状態を開始
    isPainting = true;
    // 最後にペイントしたブロックと面を記録 (連続ペイント防止用)
    lastPaintedBlockId = blockData.id;
    lastPaintedFaceIndex = faceIndex;

    // 他のインタラクション（カメラ操作など）が動作しないようにイベントの伝播を停止
    event.stopPropagation();
}

/**
 * PointerMoveイベント処理 (ペイントモード)
 *
 * マウスが移動したときに呼び出されます (マウスボタンが押されている間)。
 * 1. isPainting フラグが true の場合のみ処理を実行します。
 * 2. マウスカーソル下のブロックと面を特定します。
 * 3. カーソル下の面が、最後にペイントした面と異なる場合にのみ、
 * 新しい面にペイント処理を実行します (ドラッグによる連続描画)。
 *
 * @param {PointerEvent} event - ポインタームーブイベントオブジェクト。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handlePointerMove(event, appState) {
    // マウスボタンが押されていない (ドラッグ中でない) 場合は何もしない
    if (!isPainting) return;

    // 現在のマウスカーソル位置でブロックと面を特定
    const mouseNDC = getMouseNDCFromEvent(event, appState.renderer.domElement);
    const intersection = getIntersectedBlockFaceInfo ? getIntersectedBlockFaceInfo(mouseNDC, appState.camera, appState.loadedBlocks) : null;

    // ブロックの面にヒットした場合
    if (intersection) {
        const { blockData, faceIndex } = intersection;

        // 最後にペイントしたブロックIDまたは面インデックスが異なる場合のみ処理
        // (同じ面の上を何度もドラッグしても、一度しかペイントされないようにするため)
        if (blockData.id !== lastPaintedBlockId || faceIndex !== lastPaintedFaceIndex) {
            // console.log(`[PaintInteraction] Drag Paint - Block ID: ${blockData.id}, Face Index: ${faceIndex}`);

            // --- ペイント処理の実行 ---
            // ★未実装: 現在のペイントツールと色を paintState から取得する必要があります
            const currentTool = 'normal'; // 仮に 'normal' 固定
            const currentColor = 'FF0000'; // 仮に赤色固定
            // const currentTool = getCurrentPaintTool();
            // const currentColor = getCurrentColor();

            if (currentTool === 'normal') {
                applyPaintNormal(blockData, faceIndex, currentColor);
            } else if (currentTool === 'special') {
                 // TODO (Stage 4.1)
            } else if (currentTool === 'replace') {
                // TODO (Stage 4.2)
            }
            // ------------------------

            // 最後にペイントした情報を更新
            lastPaintedBlockId = blockData.id;
            lastPaintedFaceIndex = faceIndex;
        }
    } else {
        // カーソルがブロックから外れたら、最後のペイント情報をリセット
        lastPaintedBlockId = null;
        lastPaintedFaceIndex = null;
    }
}

/**
 * PointerUpイベント処理 (ペイントモード)
 *
 * マウスボタンが離されたときに呼び出されます。
 * ドラッグペイント状態を終了します。
 *
 * @param {PointerEvent} event - ポインターアップイベントオブジェクト。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handlePointerUp(event, appState) {
    // isPainting フラグが false なら (ドラッグ中でなかったら) 何もしない
    if (!isPainting) return;
    // console.log("[PaintInteraction] PointerUp - Painting finished");

    // ドラッグ状態をリセット
    isPainting = false;
    lastPaintedBlockId = null;
    lastPaintedFaceIndex = null;

    // TODO (Phase 3.4 / 4):
    // ドラッグ中に複数のペイント操作が行われた場合、
    // これらを一つのアクションとしてアンドゥ履歴に登録する処理が必要かもしれません。
    // (現状では各ペイント操作が個別に履歴登録されています)
}

/**
 * PointerLeaveイベント処理 (ペイントモード)
 *
 * マウスカーソルがキャンバス領域から外れたときに呼び出されます。
 * ドラッグペイント状態を中断・終了します。
 *
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handlePointerLeave(appState) {
    // isPainting フラグが false なら (ドラッグ中でなかったら) 何もしない
    if (!isPainting) return;
    // console.log("[PaintInteraction] PointerLeave - Painting cancelled/finished");

    // ドラッグ状態をリセット
    isPainting = false;
    lastPaintedBlockId = null;
    lastPaintedFaceIndex = null;

    // TODO (Phase 3.4 / 4): PointerUp と同様に、アンドゥ履歴の扱いを検討。
}