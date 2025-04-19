// src/services/RaycastService.js
import * as THREE from 'three';

let camera;
const raycaster = new THREE.Raycaster();

export function initRaycastService(cam) {
    if (!cam) throw new Error("Camera must be provided for RaycastService");
    camera = cam;
}

/**
 * 指定されたマウス座標からレイを飛ばし、オブジェクトとの交差判定を行います。
 * @param {THREE.Vector2} mouseCoords - 正規化デバイス座標 (-1 to +1)
 * @param {Array<THREE.Object3D>} objectsToIntersect - 交差判定の対象オブジェクト配列
 * @param {boolean} [recursive=false] - 子オブジェクトも再帰的に判定するか
 * @returns {Array<THREE.Intersection>} 交差結果の配列 (近い順)
 */
export function raycastFromMouse(mouseCoords, objectsToIntersect, recursive = false) {
    if (!camera || !objectsToIntersect || objectsToIntersect.length === 0) {
        return []; // カメラ未設定または対象がない場合は空配列
    }
    raycaster.setFromCamera(mouseCoords, camera);
    return raycaster.intersectObjects(objectsToIntersect, recursive);
}

/**
 * 指定されたマウス座標からレイを飛ばし、特定の平面との交点を計算します。
 * @param {THREE.Vector2} mouseCoords - 正規化デバイス座標 (-1 to +1)
 * @param {THREE.Plane} plane - 交差判定の対象平面
 * @param {THREE.Vector3} targetVector - 結果を格納するベクトル (省略可能)
 * @returns {THREE.Vector3 | null} 交点座標、交差しない場合はnull
 */
export function intersectPlaneFromMouse(mouseCoords, plane, targetVector = new THREE.Vector3()) {
     if (!camera) return null;
     raycaster.setFromCamera(mouseCoords, camera);
     if (raycaster.ray.intersectPlane(plane, targetVector)) {
         return targetVector;
     }
     return null;
}