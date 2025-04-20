import * as THREE from 'three';

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
 * マウスカーソル下の既存ブロック表面を検出し、隣接する配置候補位置情報を返します。
 * グリッド平面への直接配置は許可しません。
 * @param {MouseEvent} event - マウスイベント。
 * @param {THREE.Camera} camera - シーンのカメラ。
 * @param {BlockData[]} loadedBlocks - 既存のブロックデータの配列。
 * @param {HTMLElement} domElement - レンダラーのDOM要素。
 * @returns {object | null} 配置情報 { position: THREE.Vector3, normal: THREE.Vector3, targetBlock: BlockData } または null。
 */
export function getPlacementInfo(event, camera, loadedBlocks, domElement) {
    const mouseNDC = getMouseNDC(event, domElement);
    raycaster.setFromCamera(mouseNDC, camera);

    // 既存ブロックのメッシュのみを対象にRaycasting
    const meshesToIntersect = loadedBlocks.map(b => b.mesh).filter(m => m);
    if (meshesToIntersect.length === 0) {
        // 原点ブロックのみの場合など、隣接配置する対象がない場合は配置不可
        // TODO: 原点ブロックに隣接させる場合の処理を別途検討
        return null;
    }

    const intersects = raycaster.intersectObjects(meshesToIntersect, false);

    if (intersects.length > 0) {
        // 交差した最初のオブジェクト（一番手前）を取得
        const intersection = intersects[0];
        const intersectedMesh = intersection.object;
        const intersectedFace = intersection.face;

        // 交差したメッシュに対応するBlockDataを探す
        const targetBlock = loadedBlocks.find(block => block.mesh === intersectedMesh);

        if (targetBlock && intersectedFace) {
            // 面の法線ベクトル（ワールド座標系）を取得し、整数方向に丸める
            // transformDirection は matrixWorld を使うため、オブジェクトの回転・スケールが反映される
            const worldNormal = intersectedFace.normal.clone()
                                  .transformDirection(intersectedMesh.matrixWorld)
                                  .normalize(); // 正規化

            // 法線ベクトルを最も近い軸方向に丸める (例: (0.7, 0.1, -0.7) -> (1, 0, -1) のようなことをしたいが、
            // 簡単のため、各成分の絶対値が最大のものを1とし、他を0にする)
            const absX = Math.abs(worldNormal.x);
            const absY = Math.abs(worldNormal.y);
            const absZ = Math.abs(worldNormal.z);
            const placementNormal = new THREE.Vector3();
            if (absX > absY && absX > absZ) {
                placementNormal.set(Math.sign(worldNormal.x), 0, 0);
            } else if (absY > absX && absY > absZ) {
                placementNormal.set(0, Math.sign(worldNormal.y), 0);
            } else {
                placementNormal.set(0, 0, Math.sign(worldNormal.z));
            }


            // 配置位置を計算: ターゲットブロックの位置 + 法線ベクトル
            const placementPosition = targetBlock.position.clone().add(placementNormal);

            // 配置位置が既存ブロックと重なっていないかチェック (簡易)
            const isOccupied = loadedBlocks.some(block => block.position.equals(placementPosition));
            if (isOccupied) {
                 console.log("配置位置は既に占有されています:", placementPosition);
                 return null; // 重なっていたら配置しない
            }


            return {
                position: placementPosition, // 配置候補の整数座標
                normal: placementNormal,     // 配置面の法線（整数ベクトル）
                targetBlock: targetBlock     // 隣接するブロック
            };
        }
    }

    // 既存ブロックにヒットしなかった場合は配置不可
    return null;
}