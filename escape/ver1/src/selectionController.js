import * as THREE from 'three';
import { getSelectedBlockId, setSelectedBlockId } from './appState.js';
import { normalBlockMaterial, selectionHighlightColor } from './blockUtils.js'; // 色をインポート

let placedBlocksData = [];
let transformControlsController = null; // 参照を保持
let originalMaterialMap = new Map(); // 選択前のマテリアルを保持

/**
 * 選択コントローラーを初期化します。
 * @param {Array} blocksDataArray
 * @param {object} transformCtrlController - TransformControlsControllerへの参照
 */
export function initSelectionController(blocksDataArray, transformCtrlController) {
    placedBlocksData = blocksDataArray;
    transformControlsController = transformCtrlController;
    originalMaterialMap.clear();
}

/**
 * 指定されたメッシュを選択状態にします。
 * @param {THREE.Mesh} mesh - 選択するメッシュオブジェクト
 */
export function selectBlock(mesh) {
    if (!mesh || !mesh.userData || !mesh.userData.blockId) return;

    const newSelectedId = mesh.userData.blockId;
    const currentSelectedId = getSelectedBlockId();

    // 既に選択されている場合は何もしない
    if (newSelectedId === currentSelectedId) return;

    // 前に選択されていたものがあれば解除
    deselectBlock();

    // 新しいブロックを選択
    setSelectedBlockId(newSelectedId);

    // 視覚効果を適用 (マテリアル色変更)
    if (mesh.material) {
        // 元のマテリアルを保存 (複数マテリアルの場合は未対応)
        originalMaterialMap.set(newSelectedId, mesh.material);
        // ★ マテリアルをクローンして色を変更するのが安全
        const highlightMaterial = mesh.material.clone();
        highlightMaterial.color.copy(selectionHighlightColor);
        highlightMaterial.emissive.copy(selectionHighlightColor).multiplyScalar(0.3); // 少し光らせる
        mesh.material = highlightMaterial;
    }

    // ギズモをアタッチ (TransformControlsControllerに依頼)
    if (transformControlsController) {
        transformControlsController.attachGizmo(mesh);
    }
}

/**
 * 現在選択されているブロックの選択を解除します。
 */
export function deselectBlock() {
    const currentSelectedId = getSelectedBlockId();
    if (currentSelectedId === null) return;

    // 該当するブロックデータを検索
    const selectedData = placedBlocksData.find(data => data.id === currentSelectedId);

    if (selectedData && selectedData.mesh) {
        // 視覚効果を解除 (元のマテリアルに戻す)
        const originalMaterial = originalMaterialMap.get(currentSelectedId);
        if (originalMaterial) {
            // ハイライト用にクローンしたマテリアルを破棄
            if (selectedData.mesh.material !== originalMaterial && selectedData.mesh.material.dispose) {
                 selectedData.mesh.material.dispose();
            }
            selectedData.mesh.material = originalMaterial;
            originalMaterialMap.delete(currentSelectedId);
        } else {
            // 念のためデフォルトマテリアルに (ありえないはず)
             console.warn("Original material not found for deselection:", currentSelectedId);
             selectedData.mesh.material = normalBlockMaterial; // 共有マテリアル参照になるので注意
        }
    }

    // 状態を選択解除に
    setSelectedBlockId(null);

    // ギズモをデタッチ
    if (transformControlsController) {
        transformControlsController.detachGizmo();
    }
}

/**
 * 現在選択されているブロックのデータを取得します。
 * @returns {object | null} ブロックデータ、またはnull
 */
export function getSelectedBlockData() {
    const selectedId = getSelectedBlockId();
    if (selectedId === null) return null;
    return placedBlocksData.find(data => data.id === selectedId) || null;
}

/**
 * 選択中のブロックのTransformを更新します (TransformControlsControllerから呼ばれる想定)。
 * @param {THREE.Vector3} position - 新しいワールド座標
 * @param {THREE.Matrix4} orientation - 新しい姿勢行列
 */
export function updateSelectedBlockTransform(position, orientation) {
     const selectedData = getSelectedBlockData();
     if (selectedData) {
         selectedData.position.copy(position);
         selectedData.orientation.copy(orientation);
         // メッシュの行列も更新する必要があるが、TransformControlsが直接更新しているはず
         // selectedData.mesh.matrix を再合成する必要があるか確認 -> 不要なはず
         console.log("Block transform updated via Gizmo:", selectedData.id);
     }
}

/** ブロックが削除されたときに呼ばれ、選択状態を解除する */
export function handleBlockDeletion(deletedBlockId) {
    const currentSelectedId = getSelectedBlockId();
    if (currentSelectedId === deletedBlockId) {
        deselectBlock(); // 選択されていたものが削除されたら選択解除
    }
    // マップからも削除
    if (originalMaterialMap.has(deletedBlockId)) {
        originalMaterialMap.delete(deletedBlockId);
    }
}