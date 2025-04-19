// src/controllers/SelectionController.js
import * as THREE from 'three';
import { setSelectedBlockId, getSelectedBlockId, addStateChangeListener } from '../app/AppState.js';
import { normalMaterial, selectedMaterial } from '../models/BlockUtils.js';
import { raycastFromMouse } from '../services/RaycastService.js';
import { getAllMeshes, getMeshById } from '../models/BlockDataManager.js'; // DataManagerから取得

let camera; // RaycastService初期化後に設定される想定だったが、直接は不要に
let currentHighlightedMesh = null;
let originalMaterial = null; // ハイライト前のマテリアルを保持

/**
 * SelectionControllerを初期化します。
 */
export function initSelectionController() {
    // 状態変更を監視してハイライトを更新
    addStateChangeListener(handleStateChange);
    console.log("SelectionController initialized.");
}

/**
 * マウス座標からクリックされたブロックを選択します。
 * @param {THREE.Vector2} mouseCoords - 正規化デバイス座標
 */
export function selectBlockByRaycast(mouseCoords) {
    const meshes = getAllMeshes(); // 現在の全メッシュを取得
    if (!meshes || meshes.length === 0) {
        setSelectedBlockId(null); // 対象がない場合は選択解除
        return;
    }

    const intersects = raycastFromMouse(mouseCoords, meshes); // Raycast実行

    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        if (clickedMesh.isMesh && clickedMesh.userData.blockId) {
            // 既に選択されているものをクリックしたら解除、そうでなければ選択
            if (getSelectedBlockId() === clickedMesh.userData.blockId) {
                 setSelectedBlockId(null);
            } else {
                setSelectedBlockId(clickedMesh.userData.blockId); // AppState更新
            }
        } else {
             setSelectedBlockId(null); // メッシュだがIDがない場合などは解除
        }
    } else {
        // 何もないところをクリックしたら選択解除
        setSelectedBlockId(null);
    }
}

// 選択状態に応じてメッシュのマテリアルを変更（ハイライト）
function highlightSelectedBlock(blockId) {
    // 前のハイライトを解除
    if (currentHighlightedMesh) {
        currentHighlightedMesh.material = originalMaterial || normalMaterial.clone(); // 元のマテリアルに戻す
        currentHighlightedMesh = null;
        originalMaterial = null;
    }
    // 新しいブロックをハイライト
    if (blockId) {
        const selectedMesh = getMeshById(blockId); // DataManagerからメッシュ取得
        if (selectedMesh) {
            originalMaterial = selectedMesh.material; // 元のマテリアルを記憶
            selectedMesh.material = selectedMaterial.clone(); // 選択用マテリアルに差し替え
            currentHighlightedMesh = selectedMesh;
        }
    }
}

// AppState の変更をリッスンしてハイライトを更新する
function handleStateChange(changedState) {
    if (changedState.hasOwnProperty('selectedBlockId')) {
        highlightSelectedBlock(changedState.selectedBlockId);
    }
    // 他のモードが有効になったら強制的に選択解除
    if ((changedState.isDeleteMode && changedState.isDeleteMode === true) ||
        (changedState.isXmlEditMode && changedState.isXmlEditMode === true))
    {
        // 選択解除の通知は setDeleteMode/setXmlEditMode 内で行うのでここでは不要かも
        // setSelectedBlockId(null);
    }
}