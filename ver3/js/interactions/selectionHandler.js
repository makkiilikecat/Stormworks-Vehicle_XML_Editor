import * as THREE from 'three';
import { getCurrentMode, allowsBlockSelection, EditMode } from '../state/editMode.js';
// --- 修正: highlightHelper と xmlEditUI をインポート ---
import { highlightMesh, unhighlightMesh, clearAllHighlights } from '../rendering/highlightHelper.js';
import { updateXmlEditUI } from '../ui/xmlEditUI.js';
// ----------------------------------------------------

// --- 状態変数 ---
let selectedBlocks = []; // 複数選択に対応するため配列に変更

// --- Raycasting用 ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

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
 * マウスクリックイベントに基づいてブロック選択を処理します (単一/複数)。
 * ハイライト処理は highlightHelper を呼び出します。
 * @param {MouseEvent} event - マウスイベント。
 * @param {boolean} ctrlPressed - Ctrlキーが押されているか。
 * @param {THREE.Camera} camera - カメラ。
 * @param {THREE.Scene} scene - シーン (現在は未使用だが将来のため残す)。
 * @param {HTMLElement} domElement - レンダラーDOM要素。
 * @param {BlockData[]} loadedBlocks - ブロックデータ配列。
 */
export function handleSelectionClick(event, ctrlPressed, camera, scene, domElement, loadedBlocks) {
    const currentMode = getCurrentMode();
    // 選択不可モードなら選択解除のみ
    if (!allowsBlockSelection(currentMode)) {
        clearSelection(); // clearSelection内でUI更新もトリガーされる
        console.log("Selection cleared (mode restriction).");
        return;
    }

    const mouseNDC = getMouseNDC(event, domElement);
    raycaster.setFromCamera(mouseNDC, camera);
    // 有効なメッシュのみを対象にする
    const meshesToIntersect = loadedBlocks.map(b => b.mesh).filter(m => m && m.parent === scene);
    const intersects = raycaster.intersectObjects(meshesToIntersect, false);

    let clickedBlockData = null;
    if (intersects.length > 0) {
        // 交差したメッシュに対応するBlockDataを探す
        // userDataにblockIdを格納しておくと効率的 (blockRendererで設定済み)
        const intersectedMesh = intersects[0].object;
        clickedBlockData = loadedBlocks.find(block => block.id === intersectedMesh.userData.blockId);
        // clickedBlockData = loadedBlocks.find(block => block.mesh === intersectedMesh); // 従来の探し方
    }

    if (ctrlPressed) {
        // --- Ctrl + クリック: 選択状態のトグル ---
        if (clickedBlockData) {
            const index = selectedBlocks.findIndex(b => b.id === clickedBlockData.id);
            if (index > -1) {
                // 既に選択されている -> 選択解除
                unhighlightMesh(clickedBlockData); // ハイライト解除依頼
                selectedBlocks.splice(index, 1);
                console.log(`Block deselected: ID ${clickedBlockData.id}`);
            } else {
                // 新たに選択に追加
                highlightMesh(clickedBlockData); // ハイライト依頼
                selectedBlocks.push(clickedBlockData);
                console.log(`Block added to selection: ID ${clickedBlockData.id}`);
            }
        }
        // 背景クリックは何もしない
    } else {
        // --- 通常クリック: 単一選択 (または全解除) ---
        // 既存の選択を全て解除 (ハイライト解除も含む)
        clearAllHighlights(selectedBlocks);
        selectedBlocks = []; // 配列をクリア

        if (clickedBlockData) {
            // 新しくクリックしたブロックを選択
            highlightMesh(clickedBlockData); // ハイライト依頼
            selectedBlocks.push(clickedBlockData);
            console.log(`Block selected: ID ${clickedBlockData.id}`);
        } else {
            console.log("Selection cleared (clicked background).");
        }
    }
    console.log("Selected blocks:", selectedBlocks.map(b => b.id));
    // 選択状態が変わったので、関連するUIを更新
    updateXmlEditUI(); // XML編集UIを更新
    // 他のUI（例: ステータスバーなど）も必要なら更新
}

/**
 * 現在選択されている全てのブロックデータを取得します。
 * @returns {BlockData[]} 選択中のBlockDataの配列のコピー。
 */
export function getSelectedBlocks() {
    // 外部で配列を変更できないようにコピーを返す
    return [...selectedBlocks];
}

/**
 * 全てのブロック選択を解除し、ハイライトを元に戻します。
 */
export function clearSelection() {
    console.log("Clearing all selections.");
    const hadSelection = selectedBlocks.length > 0;
    // ハイライト解除ヘルパーを呼び出す
    clearAllHighlights(selectedBlocks);
    selectedBlocks = []; // 選択リストを空にする
    // 選択が解除された場合もUIを更新
    if (hadSelection) {
        updateXmlEditUI();
    }
}