/**
 * @fileoverview マウスインタラクションなどで共通して使用されるユーティリティ関数を提供します。
 * 主にRaycastingを用いたオブジェクト特定（ブロック、面）、範囲内のブロック取得、特定座標のブロック検索を行います。
 */
import * as THREE from 'three';
// マウス座標取得関数をインポート
import { getMouseNDCFromEvent } from '../handlers/mouseInteractionHandler.js';

// --- モジュール内変数 (Raycasting用) ---
/** Raycasting処理に使用する共有インスタンス */
const _raycaster = new THREE.Raycaster();
/** Box3計算用の一時変数 */
const _box = new THREE.Box3();

/**
 * 指定されたマウスイベントの位置に最も手前にある BlockData を特定します。
 * Raycasting を行い、BlockData に紐づく通常の3Dメッシュ (`blockData.mesh`) との交差を判定します。
 *
 * @param {PointerEvent} event - マウスイベント (pointerdown, click など)。
 * @param {object} appState - アプリケーション状態オブジェクト。最低限 `camera`, `loadedBlocks`, `renderer` を含む必要があります。
 * @returns {BlockData | null} 交差した `BlockData` オブジェクト。見つからない場合は `null`。
 */
export function getIntersectedBlockData(event, appState) {
    const { camera, loadedBlocks, renderer } = appState;
    // アプリケーション状態が不完全な場合はエラーを防ぐ
    if (!camera || !loadedBlocks || !renderer?.domElement) {
        console.error("[InteractionUtils] getIntersectedBlockData: appStateに必要な情報が不足しています。");
        return null;
    }

    // マウスイベントから正規化デバイス座標 (-1 ~ +1) を取得
    const mouseCoords = getMouseNDCFromEvent(event, renderer.domElement);
    // Raycaster を設定
    _raycaster.setFromCamera(mouseCoords, camera);

    // 交差判定の対象となるメッシュのリストを作成 (シーンに追加されているもののみ)
    const meshesToIntersect = loadedBlocks
        .map(b => b.mesh) // 各 BlockData から通常のメッシュを取得
        .filter(m => m && m.parent); // メッシュが存在し、シーンに追加されているもののみ

    if (meshesToIntersect.length === 0) return null; // 対象メッシュがなければ終了

    // Raycasting を実行 (メッシュリストとの交差判定)
    const intersects = _raycaster.intersectObjects(meshesToIntersect, false); // false: 子オブジェクトは探索しない

    // 交差があった場合
    if (intersects.length > 0) {
        const intersectedMesh = intersects[0].object; // 最も手前のメッシュ
        // メッシュの userData に blockId が含まれているか確認
        if (intersectedMesh.userData?.blockId !== undefined) {
            // loadedBlocks 配列から対応する BlockData を検索して返す
            return loadedBlocks.find(block => block.id === intersectedMesh.userData.blockId) || null;
        } else {
            console.warn("[InteractionUtils] ヒットしたメッシュに blockId が見つかりませんでした。", intersectedMesh);
        }
    }

    // ヒットしなかった場合
    return null;
}


/**
 * 指定されたマウス座標に最も手前にある BlockData と、交差した **ジオメトリの面インデックス** を取得します。
 * ペイントモードなど、どの面にインタラクションがあったかを知る必要がある場合に使用します。
 * 判定対象は BlockData に紐づく通常の3Dメッシュ (`blockData.mesh`) です。
 *
 * @param {THREE.Vector2} mouseCoords - マウスの正規化デバイス座標 (-1 ~ +1)。
 * @param {THREE.Camera} camera - シーンのカメラ。
 * @param {BlockData[]} loadedBlocks - 判定対象となる全ての `BlockData` の配列。
 * @returns {{blockData: BlockData, faceIndex: number} | null} 交差情報オブジェクト。`blockData` は交差したブロック、 `faceIndex` は交差したジオメトリの面のインデックス。見つからない場合は `null`。
 */
export function getIntersectedBlockFaceInfo(mouseCoords, camera, loadedBlocks) {
    // Raycaster を設定
    _raycaster.setFromCamera(mouseCoords, camera);

    // 交差判定の対象となるメッシュリストを作成 (通常のメッシュのみ)
    const meshesToIntersect = loadedBlocks
        .map(b => b.mesh)
        .filter(m => m && m.parent);

    if (meshesToIntersect.length === 0) return null; // 対象がなければ終了

    // Raycasting を実行
    const intersects = _raycaster.intersectObjects(meshesToIntersect, false);

    // 交差があった場合
    if (intersects.length > 0) {
        const intersect = intersects[0];      // 最初の交差情報
        const intersectedMesh = intersect.object; // 交差したメッシュ
        const faceIndex = intersect.faceIndex;// ★交差したジオメトリの面インデックス

        // メッシュの userData に blockId があり、faceIndex も有効な場合
        if (intersectedMesh.userData?.blockId !== undefined && faceIndex !== undefined && faceIndex !== null) {
            // 対応する BlockData を検索
            const blockData = loadedBlocks.find(block => block.id === intersectedMesh.userData.blockId);

            if (blockData) {
                // ---------------------------------------------------------------------
                // ★ 重要 ★: 面インデックスのマッピングについて
                // ---------------------------------------------------------------------
                // この関数が返す `faceIndex` は、Three.js のジオメトリにおける
                // **三角形ポリゴン** のインデックスです。
                //
                // 一方、Stormworks の `sc` 属性は、ブロックの**6つの面**
                // (例: +X, -X, +Y, -Y, +Z, -Z) に対応するインデックス (0-5) を
                // 期待していると考えられます。
                //
                // 立方体 (BoxGeometry) の場合、1つの面は通常2つの三角形ポリゴンで
                // 構成されるため、`faceIndex` が 0 と 1 は同じ面 (+X面など) を
                // 指している可能性があります。
                //
                // このため、`sc` 属性を扱う際には、この `faceIndex` を基にして、
                // **どのブロック面に相当するかのマッピング処理** が別途必要になります。
                // (例: 法線ベクトルとブロックの向きから判断する、など)
                //
                // この関数自体は、ジオメトリから得られた `faceIndex` をそのまま返します。
                // マッピング処理は、この関数の呼び出し元 (例: `paintActions.js`) で行う想定です。
                // ---------------------------------------------------------------------
                return { blockData, faceIndex };
            }
        }
    }

    // ヒットしなかった場合
    return null;
}


/**
 * 指定された Box3 (軸平行境界ボックス) の範囲内に**中心点**が含まれる BlockData の配列を取得します。
 * 注意: ブロックの形状全体ではなく、中心点のみで判定します。
 *
 * @param {THREE.Box3} box - 判定対象の範囲を示す Box3 オブジェクト。
 * @param {BlockData[]} allBlocks - 判定対象となる全ての `BlockData` の配列。
 * @returns {BlockData[]} 指定された範囲内に中心点が含まれる `BlockData` の配列。
 */
export function getBlocksInBox(box, allBlocks) {
    const blocksInBox = [];
    // 引数が無効な場合は空配列を返す
    if (!box || box.isEmpty() || !Array.isArray(allBlocks)) {
        return blocksInBox;
    }

    allBlocks.forEach(blockData => {
        // BlockData の position (中心座標) が Box3 に含まれるか判定
        if (box.containsPoint(blockData.position)) {
            blocksInBox.push(blockData);
        }
        // より正確な判定には、ブロック自体のバウンディングボックスとの
        // 交差判定 (`box.intersectsBox(blockBoundingBox)`) が必要になる場合があります。
    });

    // console.log(`[InteractionUtils] 指定範囲内に ${blocksInBox.length} 個のブロックの中心点が含まれます。`);
    return blocksInBox;
}


/**
 * 指定されたワールド座標 (整数座標想定) に中心を持つ BlockData を検索します。
 * 座標は完全に一致する必要があります（許容誤差なし）。
 *
 * @param {THREE.Vector3} position - 検索するワールド座標 (x, y, z は整数であるべき)。
 * @param {BlockData[]} allBlocks - 検索対象となる全ての `BlockData` の配列。
 * @returns {BlockData | null} 見つかった `BlockData`、または `null`。
 */
export function findBlockAtPosition(position, allBlocks) {
    // 引数が無効な場合は null を返す
    if (!position || !Array.isArray(allBlocks)) return null;

    // Vector3.equals() で厳密な座標比較を行う
    return allBlocks.find(block => block.position.equals(position)) || null;
}