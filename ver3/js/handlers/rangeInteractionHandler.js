/**
 * @fileoverview 範囲選択モードにおけるポインターイベント処理を担当します。
 */

import * as THREE from 'three';
import { getMouseNDCFromEvent } from './mouseInteractionHandler.js';
import { getSelectedBlocks, getSelectionRangeBox, setSelectionRange } from '../interactions/selectionState.js';
import { getIntersectedBlockData } from './interactionUtils.js';
// ★修正: rangeDragState のインポートを確認
import { rangeDragState, beginGizmoDrag, updateGizmoDrag, endGizmoDrag } from '../interactions/rangeDragState.js';
import { getGizmoGroup } from '../rendering/rangeGizmoRenderer.js';

const raycaster = new THREE.Raycaster();
const _tempBox = new THREE.Box3();
const _v1 = new THREE.Vector3();

/**
 * PointerDownイベント処理 (範囲選択モード)
 * @param {PointerEvent} event
 * @param {object} appState
 */
export function handlePointerDown(event, appState) {
    const mouseCoords = getMouseNDCFromEvent(event, appState.renderer.domElement);
    raycaster.setFromCamera(mouseCoords, appState.camera);

    // 1. ギズモとの交差判定
    let hitGizmoData = null;
    let hitPoint = null;
    const gizmoGroup = getGizmoGroup();

    if (gizmoGroup && gizmoGroup.visible) {
        const intersects = raycaster.intersectObjects(gizmoGroup.children, true);
        for (const intersect of intersects) {
            const obj = intersect.object;
            // ★修正: サイズ変更ハンドル (gizmoType === 'resize') の判定を追加
            if (obj.userData.isGizmoHandle) { // ハンドル自体 (球 or サイズハンドル)
                hitGizmoData = obj.userData;
                hitPoint = intersect.point;
                console.log(`[RangeInteraction] ヒット: ${hitGizmoData.gizmoType} ${hitGizmoData.face || ''}`);
                break;
            } else if (obj.parent instanceof THREE.Object3D && obj.parent.userData.isGizmoHandle) { // 矢印の子
                 hitGizmoData = obj.parent.userData;
                 hitPoint = intersect.point;
                 console.log(`[RangeInteraction] ヒット: ${hitGizmoData.gizmoType} ${hitGizmoData.axis || ''}`);
                 break;
            }
        }
    }


    const ctrlPressed = event.ctrlKey || event.metaKey;
    const shiftPressed = event.shiftKey;
    if (ctrlPressed || shiftPressed) {
        const clickedBlockData = getIntersectedBlockData(event, appState);
        if (clickedBlockData) {
            const currentRange = getSelectionRangeBox();
            let newBox;
            const targetPos = clickedBlockData.position.clone().round();
            // ★ 修正: クリックされたブロックのバウンディングボックスを作成
            const blockAABB = new THREE.Box3().setFromCenterAndSize(targetPos, _v1.set(1, 1, 1));

            if (ctrlPressed) {
                // Ctrl: クリックしたブロック単体を選択範囲とする (既存の newBox のロジックでOK)
                newBox = blockAABB; // blockAABB をそのまま使う
            } else { // Shift pressed
                if (currentRange) {
                    // ★ 修正: 現在の範囲とブロックのボックスを結合
                    newBox = currentRange.clone().union(blockAABB);
                } else {
                    // ★ 修正: 既存範囲がない場合は、ブロックのボックスをそのまま使う
                    newBox = blockAABB;
                }
            }
            setSelectionRange(newBox, appState.scene);
            event.stopPropagation(); // ★ 追加: 他のイベントが発火しないように
            return; // ★ 追加: 処理を終了
        }
    } else if (hitGizmoData) { // ギズモ操作の場合は以下を継続
        // ギズモにヒットした場合 -> ドラッグ開始
        beginGizmoDrag(hitGizmoData, hitPoint, appState);
        event.stopPropagation();
        return;
    }
    console.log("[RangeInteraction] 背景またはギズモ以外をクリック。");
    return;
}

/**
 * PointerMoveイベント処理 (範囲選択モード)
 * @param {PointerEvent} event
 * @param {object} appState
 */
export function handlePointerMove(event, appState) {
    if (rangeDragState.isDragging) {
        updateGizmoDrag(event, appState); // 状態更新関数を呼び出す
    }
}

/**
 * PointerUpイベント処理 (範囲選択モード)
 * @param {PointerEvent} event
 * @param {object} appState
 */
export function handlePointerUp(event, appState) {
    if (rangeDragState.isDragging) {
        endGizmoDrag(appState); // 終了処理関数を呼び出す
    }
}

/**
 * PointerLeaveイベント処理 (範囲選択モード)
 * @param {object} appState
 */
export function handlePointerLeave(appState) {
    if (rangeDragState.isDragging) {
        console.log("[RangeInteraction] Pointer left canvas during gizmo drag, finalizing.");
        endGizmoDrag(appState); // 終了処理関数を呼び出す
    }
}

// getIntersectedBlockData は interactionUtils.js に移動済み想定