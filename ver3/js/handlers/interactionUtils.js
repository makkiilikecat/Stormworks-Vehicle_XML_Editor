/**
 * @fileoverview マウスインタラクションで共通して使用されるユーティリティ関数。
 */
import * as THREE from 'three';
import { getMouseNDCFromEvent } from './mouseInteractionHandler.js'; // ここからインポート

const _raycaster = new THREE.Raycaster(); // このモジュール用のRaycaster

/**
 * 指定されたマウスイベントの位置にある最初の BlockData を Raycasting で取得します。
 * 通常メッシュ (mesh) を対象とします。
 * @param {PointerEvent} event - マウスイベント。
 * @param {object} appState - アプリケーション状態 (camera, loadedBlocks, renderer を含む)。
 * @returns {BlockData | null} 交差した BlockData、見つからなければ null。
 */
export function getIntersectedBlockData(event, appState) {
    const { camera, loadedBlocks, renderer } = appState;
    // mouseInteractionHandler から NDC 取得関数をインポートして使用
    const mouseCoords = getMouseNDCFromEvent(event, renderer.domElement);
    _raycaster.setFromCamera(mouseCoords, camera);

    const meshesToIntersect = loadedBlocks
        .map(b => b.mesh)
        .filter(m => m && m.parent); // シーンに追加されているメッシュのみ

    if (meshesToIntersect.length === 0) return null;

    const intersects = _raycaster.intersectObjects(meshesToIntersect, false);

    if (intersects.length > 0) {
        const intersectedMesh = intersects[0].object;
        // userDataにblockIdがあるか確認
        if (intersectedMesh.userData?.blockId !== undefined) {
            // loadedBlocks 配列から対応する BlockData を検索
            return loadedBlocks.find(block => block.id === intersectedMesh.userData.blockId) || null;
        }
    }
    // ヒットしなかった場合
    return null;
}

// 他の共通インタラクション関数があればここに追加