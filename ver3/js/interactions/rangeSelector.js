/**
 * @fileoverview 範囲選択モードでのマウスドラッグによる選択ボックス定義とブロック選択処理。
 * ★ Stage 3, Step 1 で新しい仕様に変更するため、このファイルの内容は一旦コメントアウトします。
 * 新しい仕様の実装は selectionState.js, selectionBoxRenderer.js, mouseInteractionHandler.js などで行われます。
 */
/*
import * as THREE from 'three';
import { updateAndShowSelectionBox, hideSelectionBox } from '../rendering/selectionBoxRenderer.js';
import { setSelectedBlocks } from './selectionState.js'; // <<< import 元を変更しておく

// --- 状態変数 ---
let isSelecting = false;       // ドラッグ選択中か
let startPoint = new THREE.Vector3(); // ドラッグ開始点 (ワールド平面上)
let currentPoint = new THREE.Vector3(); // ドラッグ中の点 (ワールド平面上)
const dragPlane = new THREE.Plane(); // ドラッグ操作を行う仮想平面 (XZ平面など)

// --- Raycasting用 ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// マウス座標取得
function getMouseNDC(event, domElement) {
    const rect = domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return mouse;
}

// レイと平面の交点を計算
function intersectDragPlane(event, camera, domElement, target) {
    const mouseNDC = getMouseNDC(event, domElement);
    raycaster.setFromCamera(mouseNDC, camera);
    return raycaster.ray.intersectPlane(dragPlane, target);
}

// 範囲選択のドラッグ開始処理
export function handleRangeSelectionPointerDown(event, appState) {
    const { camera, renderer } = appState;
    // ドラッグ平面を定義 (例: Y=0 平面)
    dragPlane.setComponents(0, 1, 0, 0); // Y法線、原点を通る

    const intersection = intersectDragPlane(event, camera, renderer.domElement, startPoint);
    if (intersection) {
        isSelecting = true;
        currentPoint.copy(startPoint);
        updateAndShowSelectionBox(appState.scene, startPoint, currentPoint); // <<< 関数名変更に対応 (showSelectionBox?)
        console.log("Range selection started at:", startPoint);
        return true; // ドラッグ開始
    }
    return false;
}

// 範囲選択のドラッグ中処理
export function handleRangeSelectionPointerMove(event, appState) {
    if (!isSelecting) return;
    const { camera, renderer, scene } = appState;

    const intersection = intersectDragPlane(event, camera, renderer.domElement, currentPoint);
    if (intersection) {
        updateAndShowSelectionBox(scene, startPoint, currentPoint); // <<< 関数名変更に対応 (showSelectionBox?)
        // リアルタイム選択ハイライト (オプション)
        // selectBlocksInBox(appState, true);
    }
}

// 範囲選択のドラッグ終了処理
export function handleRangeSelectionPointerUp(event, appState) {
    if (!isSelecting) return;
    isSelecting = false;
    // 最終的なボックス内のブロックを選択
    selectBlocksInBox(appState);
    // hideSelectionBox(); // <<< ボックスは維持する仕様に変更
    console.log("Range selection ended.");
}

// 現在定義されている選択ボックス内のブロックを選択します
function selectBlocksInBox(appState, isPreview = false) {
    const { loadedBlocks } = appState;
    // 選択ボックスのAABBを作成
    const selectionBox3 = new THREE.Box3().setFromPoints([startPoint, currentPoint]);

    const blocksInBox = [];
    loadedBlocks.forEach(blockData => {
        // ブロックの中心点がボックス内に含まれるか判定
        if (selectionBox3.containsPoint(blockData.position)) {
            blocksInBox.push(blockData);
        }
    });

    if (!isPreview) {
        console.log(`${blocksInBox.length} blocks found in selection box.`);
        setSelectedBlocks(blocksInBox); // selectionState に選択結果を渡す
    } else {
        // プレビュー用のハイライト処理
    }
}
*/
// --- ここまでコメントアウト ---
console.log("[RangeSelector] このモジュールは現在無効化されています (新しい範囲選択仕様のため)。");

// エクスポートするものがなくなるので、空の関数などをエクスポートしておくか、
// このファイルを import している箇所を修正する必要がある。
// 今回は mouseInteractionHandler.js で呼び出し箇所をコメントアウトするため、
// ここからのエクスポートは不要。