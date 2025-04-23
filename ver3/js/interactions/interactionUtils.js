/**
 * @fileoverview マウスインタラクションなどで共通して使用されるユーティリティ関数を提供します。
 * 主にRaycastingを用いたオブジェクト特定や、範囲判定などを行います。
 */
import * as THREE from 'three';
// このモジュール内でマウス座標を取得する必要があるため、mouseInteractionHandlerからインポート
import { getMouseNDCFromEvent } from '../handlers/mouseInteractionHandler.js';

// --- モジュール内変数 (Raycasting用) ---
const _raycaster = new THREE.Raycaster(); // このモジュール専用のRaycasterインスタンス
const _box = new THREE.Box3(); // 計算用

/**
 * 指定されたマウスイベントの位置にある最初の BlockData を Raycasting で取得します。
 * 判定対象は BlockData に紐づく通常の3Dメッシュ (`blockData.mesh`) です。
 *
 * @param {PointerEvent} event - マウスイベント (pointerdown など)。
 * @param {object} appState - アプリケーション状態オブジェクト (camera, loadedBlocks, renderer を含む)。
 * @returns {BlockData | null} 交差した BlockData オブジェクト。見つからない場合は null。
 */
export function getIntersectedBlockData(event, appState) {
    // 必要な情報が appState に存在するか確認
    const { camera, loadedBlocks, renderer } = appState;
    if (!camera || !loadedBlocks || !renderer?.domElement) {
        console.error("[InteractionUtils] getIntersectedBlockData: appStateに必要な情報が不足しています。");
        return null;
    }

    // マウス座標を正規化デバイス座標 (NDC) に変換
    const mouseCoords = getMouseNDCFromEvent(event, renderer.domElement);
    // Raycaster を設定
    _raycaster.setFromCamera(mouseCoords, camera);

    // 交差判定の対象となるメッシュのリストを作成 (シーンに追加されているもののみ)
    const meshesToIntersect = loadedBlocks
        .map(b => b.mesh) // 各 BlockData から mesh プロパティを取得
        .filter(m => m && m.parent); // mesh が存在し、かつ親がいる(シーンに追加されている)ものだけを対象とする

    // 対象メッシュがない場合は処理終了
    if (meshesToIntersect.length === 0) return null;

    // Raycasting を実行
    const intersects = _raycaster.intersectObjects(meshesToIntersect, false); // false: 再帰しない (通常メッシュのみ対象)

    // 交差があった場合
    if (intersects.length > 0) {
        // 最初の交差オブジェクト（最も手前にあるもの）を取得
        const intersectedMesh = intersects[0].object;
        // userData に blockId が含まれているか確認
        if (intersectedMesh.userData?.blockId !== undefined) {
            // loadedBlocks 配列から、ヒットしたメッシュの blockId と一致する BlockData を検索
            return loadedBlocks.find(block => block.id === intersectedMesh.userData.blockId) || null;
        } else {
            // 通常は発生しないはずだが、userData がない場合は警告
            console.warn("[InteractionUtils] ヒットしたメッシュに blockId が見つかりませんでした。", intersectedMesh);
        }
    }

    // ヒットしなかった場合
    return null;
}


/**
 * 指定された Box3 (軸平行境界ボックス) の範囲内に中心点が含まれる BlockData の配列を取得します。
 * @param {THREE.Box3} box - 判定対象の範囲を示す Box3 オブジェクト。
 * @param {BlockData[]} allBlocks - 判定対象となる全ての BlockData の配列。
 * @returns {BlockData[]} 指定された範囲内に含まれる BlockData の配列。
 */
export function getBlocksInBox(box, allBlocks) {
    const blocksInBox = [];
    // 入力が無効な場合は空配列を返す
    if (!box || box.isEmpty() || !Array.isArray(allBlocks)) {
        return blocksInBox;
    }

    allBlocks.forEach(blockData => {
        // 各ブロックの中心点 (blockData.position は Three.js ワールド座標系) が
        // 指定された Box3 に含まれるか判定
        if (box.containsPoint(blockData.position)) {
            blocksInBox.push(blockData);
        }
        // 注意: より正確な判定には、ブロック自体の形状(バウンディングボックス)と
        // 指定された範囲ボックスとの交差判定 (`box.intersectsBox(blockBoundingBox)`) が必要になる場合があります。
        // 現状は中心点での判定です。
    });

    console.log(`[InteractionUtils] 指定範囲内に ${blocksInBox.length} 個のブロックの中心点が含まれます。`);
    return blocksInBox;
}


/**
 * 指定されたワールド座標 (整数座標想定) に中心を持つ BlockData を検索します。
 * 座標は完全に一致する必要があります。
 * @param {THREE.Vector3} position - 検索するワールド座標 (x, y, z は整数であるべき)。
 * @param {BlockData[]} allBlocks - 検索対象となる全ての BlockData の配列。
 * @returns {BlockData | null} 見つかった BlockData、または null。
 */
export function findBlockAtPosition(position, allBlocks) {
    // 入力が無効な場合は null を返す
    if (!position || !Array.isArray(allBlocks)) return null;

    // Vector3.equals() は厳密な比較を行うため、座標が完全に一致する場合のみヒットします。
    // 浮動小数点誤差が懸念される場合は、許容誤差を用いた比較が必要です。
    // (現在の実装では座標は整数に丸められているため、equalsで問題ないはずです)
    return allBlocks.find(block => block.position.equals(position)) || null;
}

// 他の共通インタラクション関連ユーティリティ関数があればここに追加...
// 例えば、特定のメッシュに紐づくBlockDataを探す関数など
// export function findBlockDataByMesh(mesh, allBlocks) { ... }