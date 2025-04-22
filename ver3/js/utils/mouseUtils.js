/**
 * @fileoverview マウス関連のユーティリティ関数を提供します。
 */

import * as THREE from 'three';
import { getPlacementInfo } from '../interactions/placementHandler.js';
import { showPreviewBlock, hidePreviewBlock } from '../rendering/previewBlock.js';
import { getPreviewOrientation } from '../state/placementState.js';

/**
 * マウスイベントからマウスの正規化デバイス座標 (-1 to +1) を計算します。
 * @param {MouseEvent|PointerEvent} event - マウスイベント。
 * @param {HTMLElement} domElement - レンダラーのDOM要素 (通常はCanvas)。
 * @returns {THREE.Vector2} 正規化デバイス座標。
 */
export function getMouseNDCFromEvent(event, domElement) {
    const rect = domElement.getBoundingClientRect();
    // clientX/Yを使用 (スクロールの影響を受けないビューポート座標)
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    // NDC座標系 (-1から+1の範囲) に変換
    const ndcX = (x / rect.width) * 2 - 1;
    const ndcY = -(y / rect.height) * 2 + 1; // Y軸は反転
    return new THREE.Vector2(ndcX, ndcY);
}

/**
 * 通常モード時にカーソル下の情報を基にプレビューブロックの位置と向きを更新します。
 * @param {MouseEvent|PointerEvent} event - マウスイベント。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function updatePreview(event, appState){
    const { camera, loadedBlocks, renderer, scene } = appState;
    // カーソル下の配置可能な位置情報を取得
    const placementInfo = getPlacementInfo(event, camera, loadedBlocks, renderer.domElement);

    if (placementInfo) {
        // console.log('プレビュー更新: 配置可能位置情報', placementInfo);
        // 配置するブロックの現在の向きを取得
        const orientationMatrix = getPreviewOrientation();
        // プレビュー表示
        showPreviewBlock(scene, placementInfo.position, orientationMatrix);
    } else {
        // console.log('プレビュー更新: 配置可能な位置が見つかりませんでした');
        // 配置可能な位置でなければプレビューを隠す
        hidePreviewBlock();
    }
}