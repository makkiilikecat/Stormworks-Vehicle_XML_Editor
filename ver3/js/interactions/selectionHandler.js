/**
 * @fileoverview マウスクリックによるブロック選択インタラクションを処理するモジュール。
 * Raycastingを行い、選択状態の変更は selectionState モジュールに委譲する。
 */

import * as THREE from 'three';
import { getSelectedBlocks, setSelectedBlocks, clearSelection } from './selectionState.js';
import { getCurrentMode, allowsBlockSelection, EditMode } from '../state/editMode.js';

// --- Raycasting用 ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(); // マウスの正規化デバイス座標 (-1 to +1)

// --- プライベート関数 ---

/**
 * マウスイベントからマウスの正規化デバイス座標を計算します。
 * @param {MouseEvent} event - マウスイベント。
 * @param {HTMLElement} domElement - レンダラーのDOM要素。
 * @returns {THREE.Vector2} 正規化デバイス座標。
 * @private
 */
function getMouseNDC(event, domElement) {
    const rect = domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return mouse;
}

// --- 公開関数 ---

/**
 * マウスクリックイベントに基づいてブロック選択インタラクションを実行します。
 * クリック位置からブロックを特定し、単一/複数選択状態を更新します。
 * 実際の状態変更は selectionState モジュールに依頼します。
 * @param {PointerEvent} event - マウスイベント (pointerdown)。
 * @param {boolean} ctrlPressed - Ctrlキー（またはMacのCommandキー）が押されているか。
 * @param {THREE.Camera} camera - シーンのカメラ。
 * @param {THREE.Scene} scene - シーン。
 * @param {HTMLElement} domElement - レンダラーDOM要素。
 * @param {BlockData[]} loadedBlocks - 読み込まれている全ブロックデータの配列。
 */
export function handleSelectionClick(event, ctrlPressed, camera, scene, domElement, loadedBlocks) {
    const currentMode = getCurrentMode();

    // 現在のモードでクリックによる選択が許可されているか確認
    if (!allowsBlockSelection(currentMode)) {
        console.log("[SelectionHandler] 現在のモードではクリックによる選択は許可されていません。");
        // 必要なら既存の選択をクリアする (selectionState側でモード変更時にクリアされるはず)
        // clearSelection();
        return;
    }

    // マウス座標からRaycastingを実行
    const mouseNDC = getMouseNDC(event, domElement);
    raycaster.setFromCamera(mouseNDC, camera);

    // 交差判定の対象となるメッシュを選択 (XML編集モードのみ前景キューブ)
    let meshesToIntersect = [];
    if (currentMode === EditMode.XML_EDIT) {
        meshesToIntersect = loadedBlocks.map(b => b.foregroundMesh).filter(m => m);
    } else {
        // ここに来ることは現状ないはず (allowsBlockSelection で弾かれるため)
        console.warn(`[SelectionHandler] 予期しないモード(${currentMode})での選択試行。`);
        return; // 念のため処理中断
    }

    // 交差判定実行
    const intersects = raycaster.intersectObjects(meshesToIntersect, false);

    let clickedBlockData = null;
    if (intersects.length > 0) {
        const intersectedMesh = intersects[0].object;
        if (intersectedMesh.userData?.blockId !== undefined) {
            clickedBlockData = loadedBlocks.find(block => block.id === intersectedMesh.userData.blockId);
        } else {
             console.warn("[SelectionHandler] 交差したメッシュに blockId が見つかりません。", intersectedMesh);
        }
    }

    // --- 選択ロジック ---
    const currentSelection = getSelectedBlocks(); // 現在の選択状態を取得

    if (ctrlPressed) {
        // --- Ctrl + クリック: トグル ---
        if (clickedBlockData) {
            const index = currentSelection.findIndex(b => b.id === clickedBlockData.id);
            let newSelection;
            if (index > -1) {
                // 選択解除
                newSelection = currentSelection.filter(b => b.id !== clickedBlockData.id);
                console.log(`[SelectionHandler] ブロック選択解除 (Ctrl): ID ${clickedBlockData.id}`);
            } else {
                // 選択追加
                newSelection = [...currentSelection, clickedBlockData];
                console.log(`[SelectionHandler] ブロック選択追加 (Ctrl): ID ${clickedBlockData.id}`);
            }
            // selectionState に新しい選択状態を設定 (ハイライト更新も内部で行われる)
            setSelectedBlocks(newSelection);
        }
        // 背景 Ctrl+クリックは何もしない
    } else {
        // --- 通常クリック: 単一選択 or 全解除 ---
        if (clickedBlockData) {
            // クリックしたブロックのみを選択状態にする
            console.log(`[SelectionHandler] ブロック選択 (単一): ID ${clickedBlockData.id}`);
            // 既に選択されている場合も、改めて単一選択として設定し直す
            setSelectedBlocks([clickedBlockData]);
        } else {
            // 背景クリック: 全解除
            // clearSelection は選択があった場合のみイベント発行などを行う
            if (clearSelection()) { // clearSelectionを呼び出し、実際に解除されたか確認
                 console.log("[SelectionHandler] 背景クリックにより選択解除。");
            }
        }
    }
}

// initializeSelectionHandler は削除 (初期化は selectionState と main.js で行う)