/**
 * @fileoverview マウスインタラクションで共通して使用されるユーティリティ関数。
 * ブロックのヒット判定や範囲内判定など。
 */
import * as THREE from 'three';
import { getMouseNDCFromEvent } from '../handlers/mouseInteractionHandler.js'; // NDC取得関数

const _raycaster = new THREE.Raycaster(); // このモジュール用のRaycaster
const _box = new THREE.Box3(); // 計算用

/**
 * 指定されたマウスイベントの位置にある最初の BlockData を Raycasting で取得します。
 * 通常メッシュ (mesh) を対象とします。
 * @param {PointerEvent} event - マウスイベント。
 * @param {object} appState - アプリケーション状態 (camera, loadedBlocks, renderer を含む)。
 * @returns {BlockData | null} 交差した BlockData、見つからなければ null。
 */
export function getIntersectedBlockData(event, appState) {
    const { camera, loadedBlocks, renderer } = appState;
    const mouseCoords = getMouseNDCFromEvent(event, renderer.domElement);
    _raycaster.setFromCamera(mouseCoords, camera);

    const meshesToIntersect = loadedBlocks
        .map(b => b.mesh) // 通常メッシュを取得
        .filter(m => m && m.parent); // シーンに追加されているもののみ

    if (meshesToIntersect.length === 0) return null;

    const intersects = _raycaster.intersectObjects(meshesToIntersect, false);

    if (intersects.length > 0) {
        const intersectedMesh = intersects[0].object;
        if (intersectedMesh.userData?.blockId !== undefined) {
            return loadedBlocks.find(block => block.id === intersectedMesh.userData.blockId) || null;
        }
    }
    return null;
}


/**
 * ★追加: 指定された Box3 の範囲内に中心点が含まれる BlockData の配列を取得します。
 * @param {THREE.Box3} box - 判定対象の範囲を示す Box3 オブジェクト。
 * @param {BlockData[]} allBlocks - 判定対象となる全ての BlockData の配列。
 * @returns {BlockData[]} 指定された範囲内に含まれる BlockData の配列。
 */
export function getBlocksInBox(box, allBlocks) {
    const blocksInBox = [];
    if (!box || box.isEmpty() || !Array.isArray(allBlocks)) {
        return blocksInBox; // 無効な入力の場合は空配列を返す
    }

    allBlocks.forEach(blockData => {
        // ブロックの中心点 (blockData.position は Three.js 座標系) が
        // Box3 に含まれるか判定
        if (box.containsPoint(blockData.position)) {
            blocksInBox.push(blockData);
        }
        // より厳密にはブロックのバウンディングボックスとの交差判定が必要な場合もある
        // const blockBox = _box.setFromObject(blockData.mesh); // メッシュが必要
        // if (box.intersectsBox(blockBox)) { ... }
    });

    console.log(`[InteractionUtils] 指定範囲内に ${blocksInBox.length} 個のブロックが見つかりました。`);
    return blocksInBox;
}

// 他の共通インタラクション関数があればここに追加