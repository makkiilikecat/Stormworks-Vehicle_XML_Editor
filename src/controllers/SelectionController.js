// src/controllers/SelectionController.js
import * as THREE from 'three';
import { setSelectedBlockId, getSelectedBlockId, addStateChangeListener } from '../app/AppState.js';
import { normalMaterial, selectedMaterial } from '../models/BlockUtils.js';

let camera;
let placedBlocksData = []; // データ配列への参照
const raycaster = new THREE.Raycaster();
let currentHighlightedMesh = null; // ハイライト中のメッシュ

export function initSelectionController(cam, blocksData) {
    camera = cam;
    placedBlocksData = blocksData;
    // 状態変更を監視してハイライトを更新
    addStateChangeListener(handleStateChange);
}

// マウス座標からクリックされたブロックを選択する
export function selectBlockByRaycast(mouseCoords) {
    if (!camera || !placedBlocksData) return;
    raycaster.setFromCamera(mouseCoords, camera);
    const meshes = placedBlocksData.map(d => d.mesh).filter(m => !!m);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        if (clickedMesh.isMesh && clickedMesh.userData.blockId) {
            setSelectedBlockId(clickedMesh.userData.blockId); // 状態更新
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
        currentHighlightedMesh.material = normalMaterial.clone(); // ★ 要clone
        currentHighlightedMesh = null;
    }
    // 新しいブロックをハイライト
    if (blockId) {
        const selectedData = placedBlocksData.find(d => d.id === blockId);
        if (selectedData && selectedData.mesh) {
            selectedData.mesh.material = selectedMaterial.clone(); // ★ 要clone
            currentHighlightedMesh = selectedData.mesh;
        }
    }
}

// AppState の変更をリッスンしてハイライトを更新する
function handleStateChange(changedState) {
    if (changedState.hasOwnProperty('selectedBlockId')) {
        highlightSelectedBlock(changedState.selectedBlockId);
    }
    // XML編集モードや削除モードが有効になったら選択解除するなども可能
    if (changedState.isDeleteMode || changedState.isXmlEditMode) {
         if(changedState.isDeleteMode === true || changedState.isXmlEditMode === true){
             setSelectedBlockId(null); // モード変更時に選択解除
         }
    }
}