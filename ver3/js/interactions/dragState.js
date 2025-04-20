/**
 * @fileoverview ドラッグによるブロック変形操作の状態を管理します。
 */
import * as THREE from 'three';

export const dragState = {
    isDragging: false,                      // ドラッグ操作中か
    mode: null,                             // 'shear'(せん断) または 'stretch'(伸縮)
    targetBlockData: null,                  // 変形対象のBlockData
    startPointWorld: new THREE.Vector3(),   // ドラッグ開始時のブロック面上の交点 (ワールド座標)
    startMouseNDC: new THREE.Vector2(),     // ドラッグ開始時のマウス座標 (正規化デバイス座標)
    currentMouseNDC: new THREE.Vector2(),   // 現在のマウス座標 (正規化デバイス座標)
    lastMouseNDC: new THREE.Vector2(),      // 1フレーム前のマウス座標 (正規化デバイス座標)
    faceInfo: null,                         // 操作中の面情報 { normal, axisInfo, center }
    // せん断操作用
    dragPlaneCameraNormal: new THREE.Plane(), // カメラに垂直なドラッグ平面
    dragStartPointOnPlane: new THREE.Vector3(), // 上記平面上のドラッグ開始点
    // 状態保持用
    initialBlockMatrix: new THREE.Matrix4(), // ドラッグ開始時のブロックのワールド行列 (位置含む)
    currentTransformedMatrix: new THREE.Matrix4(), // リアルタイム変形中の行列 (丸め前)
    ghostMatrix: new THREE.Matrix4(),       // ゴースト表示用の行列 (丸め・クランプ後)
};

/**
 * ドラッグ状態をリセットします。
 */
export function resetDragState() {
    dragState.isDragging = false;
    dragState.mode = null;
    dragState.targetBlockData = null;
    dragState.faceInfo = null;
    // Vector, Matrix, Plane は中身をリセットするか、都度 new する
}