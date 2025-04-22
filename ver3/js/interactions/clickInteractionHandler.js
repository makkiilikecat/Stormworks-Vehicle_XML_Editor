/**
 * @fileoverview 各編集モードでのキャンバスクリック (PointerDown) に対する
 * 具体的なアクション（配置、削除、選択、範囲設定/拡張）を処理するモジュール。
 * mouseInteractionHandler.js から呼び出される。
 */

import * as THREE from 'three';
// 状態とアクションに必要なモジュールをインポート
import { EditMode } from '../state/editMode.js';
import { getSelectedBlocks, getSelectionRangeBox, setSelectionRange, clearSelection } from './selectionState.js'; // 範囲選択とクリック選択の状態操作
import { handleSelectionClick as handleXmlEditSelectionClick } from './selectionHandler.js'; // XML編集モードの選択処理
import { deleteBlock, placeBlock } from './blockActions.js'; // ブロックの配置・削除
import { getPlacementInfo } from './placementHandler.js'; // 配置位置計算
import { getCurrentPlacementBlockId, getPreviewOrientation } from '../state/placementState.js'; // 配置するブロックの情報

// --- 計算用一時変数 ---
const _tempBox = new THREE.Box3();
const _v1 = new THREE.Vector3();

// --- Raycasting関連 (mouseInteractionHandlerから渡されることを想定 or 共通化) ---
// このモジュール内でRaycastingを行う場合は、raycasterとmouseNDCを定義・インポートする必要がある
// 今回は、呼び出し元(mouseInteractionHandler)でブロック特定まで行い、結果を渡す方針も可能

/**
 * 指定されたマウスイベントの位置にある最初の BlockData を Raycasting で取得します。
 * 通常メッシュ (mesh) を対象とします。
 * ※ mouseInteractionHandler.js にも同等の関数がありますが、依存性を減らすため、
 * または共通化のためにここに再定義または utils に移動することを検討します。
 * ここでは、mouseInteractionHandlerから結果を受け取ることを想定し、コメントアウトしておきます。
 * @param {PointerEvent} event - マウスイベント。
 * @param {object} appState - アプリケーション状態。
 * @returns {BlockData | null} 交差した BlockData、見つからなければ null。
 * @private
 */
/*
function getIntersectedBlockData(event, appState, raycaster, mouseNDC) {
    // ... (mouseInteractionHandler.js の同名関数と同じ実装) ...
    const { camera, loadedBlocks, renderer } = appState;
    // mouseCoords の取得は呼び出し元で行う想定
    raycaster.setFromCamera(mouseNDC, camera);
    const meshesToIntersect = loadedBlocks.map(b => b.mesh).filter(m => m && m.parent);
    if (meshesToIntersect.length === 0) return null;
    const intersects = raycaster.intersectObjects(meshesToIntersect, false);
    if (intersects.length > 0) {
        const intersectedMesh = intersects[0].object;
        if (intersectedMesh.userData?.blockId !== undefined) {
            return loadedBlocks.find(block => block.id === intersectedMesh.userData.blockId) || null;
        }
    }
    return null;
}
*/

// --- 公開関数 (モード別クリック処理) ---

/**
 * 通常モード (配置) でのクリック処理。
 * @param {PointerEvent} event - マウスイベント。
 * @param {object} appState - アプリケーション状態。
 * @param {Function} updatePreviewFn - プレビュー更新関数への参照。
 */
export function handleClickForPlacement(event, appState, updatePreviewFn) {
    const placementInfo = getPlacementInfo(event, appState.camera, appState.loadedBlocks, appState.renderer.domElement);
    if (placementInfo) {
        console.log("[ClickInteraction] 配置モード: ブロックを配置します。");
        const blockIdToPlace = getCurrentPlacementBlockId();
        const orientationMatrix = getPreviewOrientation();
        placeBlock(placementInfo.position, orientationMatrix, blockIdToPlace, appState.loadedBlocks, appState.scene);
        updatePreviewFn(event, appState); // プレビュー更新を呼び出す
    } else {
        console.log("[ClickInteraction] 配置モード: ここには配置できません。");
        // 通常モードではクリック選択は行わない
    }
}

/**
 * 削除モードでのクリック処理。
 * @param {PointerEvent} event - マウスイベント。
 * @param {object} appState - アプリケーション状態。
 * @param {BlockData | null} intersectedBlock - 事前にRaycastで特定されたブロック。
 */
export function handleClickForRemoval(event, appState, intersectedBlock) {
    if (intersectedBlock) {
        console.log(`[ClickInteraction] 削除モード: ブロック削除 ID: ${intersectedBlock.id}`);
        deleteBlock(intersectedBlock, appState.loadedBlocks, appState.scene);
    } else {
        console.log("[ClickInteraction] 削除モード: 削除対象のブロックが見つかりません。");
    }
}

/**
 * XML編集モードでのクリック処理 (ブロック選択)。
 * @param {PointerEvent} event - マウスイベント。
 * @param {object} appState - アプリケーション状態。
 * @param {boolean} ctrlPressed - Ctrl/Cmdキーが押されているか。
 */
export function handleClickForXmlSelection(event, appState, ctrlPressed) {
    console.log("[ClickInteraction] XML編集モード: ブロック選択処理を実行します。");
    // XML編集モード用の選択処理を呼び出す (対象は前景キューブ)
    handleXmlEditSelectionClick(
        event, ctrlPressed,
        appState.camera, appState.scene, appState.renderer.domElement, appState.loadedBlocks
    );
}

/**
 * 範囲選択モードでのクリック処理 (Ctrl/Shift + クリック)。
 * @param {PointerEvent} event - マウスイベント。
 * @param {object} appState - アプリケーション状態。
 * @param {BlockData | null} intersectedBlock - 事前にRaycastで特定されたブロック。
 * @param {boolean} ctrlPressed - Ctrl/Cmdキーが押されているか。
 * @param {boolean} shiftPressed - Shiftキーが押されているか。
 */
export function handleClickForRangeSelection(event, appState, intersectedBlock, ctrlPressed, shiftPressed) {
    if (!ctrlPressed && !shiftPressed) {
        console.log("[ClickInteraction] 範囲選択モード: (ギズモ操作のための) 通常クリック。");
        return; // Ctrl/Shiftなしはギズモ操作用なのでここでは何もしない
    }

    if (intersectedBlock) {
        const currentRange = getSelectionRangeBox();
        let newBox;
        const targetPos = intersectedBlock.position.clone().round(); // 対象ブロックの中心 (丸め)

        if (ctrlPressed) {
            console.log(`[ClickInteraction] 範囲選択 (Ctrl+Click): ブロック ID ${intersectedBlock.id} に範囲をリセットします。`);
            newBox = _tempBox.setFromCenterAndSize(targetPos, _v1.set(1, 1, 1));
        } else { // Shift pressed
            if (currentRange) {
                console.log(`[ClickInteraction] 範囲選択 (Shift+Click): ブロック ID ${intersectedBlock.id} を含むように範囲を拡張します。`);
                newBox = currentRange.clone().expandByPoint(targetPos);
            } else {
                console.log(`[ClickInteraction] 範囲選択 (Shift+Click): 既存範囲なし。ブロック ID ${intersectedBlock.id} に範囲を設定します。`);
                newBox = _tempBox.setFromCenterAndSize(targetPos, _v1.set(1, 1, 1));
            }
        }
        // 状態と表示を更新
        setSelectionRange(newBox, appState.scene);

    } else {
        console.log("[ClickInteraction] 範囲選択 (Ctrl/Shift+Click): 背景をクリックしました。");
        // 背景クリック時は範囲を変更しない
    }
}