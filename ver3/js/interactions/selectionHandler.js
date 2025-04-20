import * as THREE from 'three';
import { getCurrentMode, allowsBlockSelection, EditMode } from '../state/editMode.js';

// --- 状態変数 ---
let selectedBlocks = []; // <<< 複数選択に対応するため配列に変更
// 元のマテリアル情報を保持するMap (キー: block.id, 値: クローンした元のマテリアル)
const originalMaterials = new Map();

// --- 設定 ---
const highlightColor = new THREE.Color(0xffff00); // ハイライト色 (黄色)
const highlightEmissiveIntensity = 0.5; // 発光強度

// --- Raycasting用 ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(); // マウス座標 (-1 to +1)

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

/**
 * 指定されたBlockDataのメッシュをハイライトします。
 * 元のマテリアル情報を保存します。
 * @param {BlockData} blockData - ハイライトするブロックのデータ。
 * @private
 */
function highlightMesh(blockData) {
    // blockDataやそのメッシュ、マテリアルが存在しない、またはマテリアルが配列の場合は処理しない
    if (!blockData?.mesh?.material || Array.isArray(blockData.mesh.material)) return;

    const mesh = blockData.mesh;
    // 既にハイライトされている場合（originalMaterialsに情報がある場合）は何もしない
    if (originalMaterials.has(blockData.id)) return;

    // 元のマテリアルをクローンしてMapに保存
    originalMaterials.set(blockData.id, mesh.material.clone());

    // 発光色と強度を設定してハイライト
    // mesh.material はクローンされたインスタンスなので直接変更してOK
    mesh.material.emissive.set(highlightColor);
    mesh.material.emissiveIntensity = highlightEmissiveIntensity;
}

/**
 * 指定されたBlockDataのメッシュのハイライトを解除します。
 * 保存しておいた元のマテリアル情報を使って復元します。
 * @param {BlockData} blockData - ハイライト解除するブロックのデータ。
 * @private
 */
function unhighlightMesh(blockData) {
    // blockDataやメッシュ、マテリアル、または保存情報がない場合は処理しない
    if (!blockData?.mesh?.material || Array.isArray(blockData.mesh.material)) return;
    if (!originalMaterials.has(blockData.id)) return;

    const mesh = blockData.mesh;
    const originalMat = originalMaterials.get(blockData.id);

    // 保存しておいた元のマテリアルの発光情報を復元
    mesh.material.emissive.copy(originalMat.emissive);
    mesh.material.emissiveIntensity = originalMat.emissiveIntensity || 0; // 強度も復元

    // 保存情報をMapから削除
    originalMaterials.delete(blockData.id);
    // Mapに保持していたクローンマテリアルは不要なので破棄
    originalMat.dispose();
}

/**
 * マウスクリックイベントに基づいてブロック選択を処理します (単一/複数)。
 * @param {MouseEvent} event - マウスイベント。
 * @param {boolean} ctrlPressed - Ctrlキー（またはMacのCommandキー）が押されているか。
 * @param {THREE.Camera} camera - シーンのカメラ。
 * @param {THREE.Scene} scene - シーン。 (現在は未使用だが、将来的に使う可能性あり)
 * @param {HTMLElement} domElement - レンダラーDOM要素。
 * @param {BlockData[]} loadedBlocks - 検索対象のブロックデータ配列。
 */
export function handleSelectionClick(event, ctrlPressed, camera, scene, domElement, loadedBlocks) {
    // 現在の編集モードを取得
    const currentMode = getCurrentMode();
    // ブロック選択が許可されていないモードの場合は、現在の選択を解除して終了
    if (!allowsBlockSelection(currentMode)) {
        clearSelection();
        console.log("Selection cleared (mode restriction).");
        return;
    }

    // マウス座標を取得し、Raycastingを実行
    const mouseNDC = getMouseNDC(event, domElement);
    raycaster.setFromCamera(mouseNDC, camera);
    // loadedBlocksから有効なメッシュのみを抽出して交差判定
    const meshesToIntersect = loadedBlocks.map(b => b.mesh).filter(m => m instanceof THREE.Mesh);
    const intersects = raycaster.intersectObjects(meshesToIntersect, false);

    let clickedBlockData = null;
    // 交差するオブジェクトがあれば、最も手前のものに対応するBlockDataを探す
    if (intersects.length > 0) {
        const intersectedMesh = intersects[0].object;
        clickedBlockData = loadedBlocks.find(block => block.mesh === intersectedMesh);
    }

    if (ctrlPressed) {
        // --- Ctrl + クリック: 選択状態のトグル ---
        if (clickedBlockData) {
            const index = selectedBlocks.findIndex(b => b.id === clickedBlockData.id);
            if (index > -1) {
                // 既に選択されている -> 選択解除
                unhighlightMesh(clickedBlockData); // ハイライト解除
                selectedBlocks.splice(index, 1); // 配列から削除
                console.log(`Block deselected: ID ${clickedBlockData.id}`);
            } else {
                // 新たに選択に追加
                highlightMesh(clickedBlockData); // ハイライト
                selectedBlocks.push(clickedBlockData); // 配列に追加
                console.log(`Block added to selection: ID ${clickedBlockData.id}`);
            }
        }
        // 背景をクリックした場合は何もしない (現在の選択を維持)
    } else {
        // --- 通常クリック: 単一選択 (または全解除) ---
        // 既存の選択を全て解除
        clearSelection();
        if (clickedBlockData) {
            // 新しくクリックしたブロックを選択
            highlightMesh(clickedBlockData); // ハイライト
            selectedBlocks.push(clickedBlockData); // 配列に追加
            console.log(`Block selected: ID ${clickedBlockData.id}`);
        } else {
            // 背景をクリックした場合は全解除 (clearSelectionで実行済み)
            console.log("Selection cleared (clicked background).");
        }
    }
    // 現在選択されているブロックのIDリストをログに出力
    console.log("Selected blocks:", selectedBlocks.map(b => b.id));
}

/**
 * 現在選択されている全てのブロックデータを取得します。
 * @returns {BlockData[]} 選択中のBlockDataの配列 (外部で変更不可なコピー)。
 */
export function getSelectedBlocks() {
    // 配列のコピーを返すことで、外部での意図しない変更を防ぐ
    return [...selectedBlocks];
}

/**
 * 全てのブロック選択を解除し、ハイライトを元に戻します。
 */
export function clearSelection() {
    // 選択されていた各ブロックのハイライトを解除
    selectedBlocks.forEach(blockData => {
        unhighlightMesh(blockData); // unhighlightMesh内でoriginalMaterialsから削除される
    });
    selectedBlocks = []; // 選択リストを空にする
    originalMaterials.clear(); // 元マテリアルMapもクリア
    console.log("All selections cleared.");
}