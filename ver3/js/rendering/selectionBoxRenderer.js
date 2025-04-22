/**
 * @fileoverview 範囲選択用の選択ボックス（直方体ワイヤーフレーム）の描画・更新。
 */
import * as THREE from 'three';

// --- モジュール内変数 ---
let selectionBoxMesh = null; // 選択ボックスのメッシュ (LineSegments)
// 黄色のワイヤーフレームマテリアル (共有)
const boxMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2, depthTest: false, transparent: true, opacity: 0.7 }); // 深度テスト無効で見やすく

// --- 計算用一時変数 ---
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const MIN_SIZE = 0.01; // 表示する最小サイズ

// --- プライベート関数 ---

/**
 * 選択ボックスのメッシュ (LineSegments) を取得または作成します。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 * @returns {THREE.LineSegments | null} 選択ボックスメッシュ。作成失敗時は null。
 * @private
 */
function getOrCreateSelectionBox(scene) {
    if (!selectionBoxMesh) {
        try {
            // 1x1x1 のボックスジオメトリをベースにエッジを作成
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const edges = new THREE.EdgesGeometry(geometry);
            selectionBoxMesh = new THREE.LineSegments(edges, boxMaterial);
            selectionBoxMesh.matrixAutoUpdate = false; // 行列でサイズと位置を制御
            selectionBoxMesh.renderOrder = 1; // 他のオブジェクトより手前に描画されやすくする
            selectionBoxMesh.visible = false;        // 最初は非表示
            scene.add(selectionBoxMesh);
            console.log("[SelectionBoxRenderer] 選択ボックスメッシュを作成しました。");
        } catch (error) {
            console.error("[SelectionBoxRenderer] 選択ボックスメッシュの作成に失敗しました:", error);
            return null;
        }
    }
    return selectionBoxMesh;
}

// --- 公開関数 ---

/**
 * 指定された Box3 に基づいて選択ボックスの位置とサイズを更新し、表示します。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 * @param {THREE.Box3} box - 表示する範囲を示す Box3 オブジェクト。
 */
export function showSelectionBox(scene, box) {
    const mesh = getOrCreateSelectionBox(scene);
    if (!mesh || !(box instanceof THREE.Box3) || box.isEmpty()) {
        if (mesh) mesh.visible = false; // 不正な入力なら非表示にする
        return;
    }

    // Box3 から中心とサイズを取得
    box.getCenter(_center);
    box.getSize(_size);

    // サイズが非常に小さい場合は表示しない (例: 点や線になっている場合)
    if (_size.x < MIN_SIZE || _size.y < MIN_SIZE || _size.z < MIN_SIZE) {
        mesh.visible = false;
        // console.log("[SelectionBoxRenderer] サイズが小さすぎるため非表示。");
        return;
    }

    // ボックスメッシュの行列を更新してサイズと位置を反映
    // matrix.compose(position, quaternion, scale)
    mesh.matrix.compose(
        _center,                          // 位置 (中心)
        new THREE.Quaternion(),           // 回転 (なし)
        _size                             // スケール (サイズ)
    );
    mesh.matrixWorldNeedsUpdate = true; // ワールド行列の更新を指示
    mesh.visible = true; // 表示
    // console.log("[SelectionBoxRenderer] 選択ボックスを表示/更新しました。", _center, _size);
}

/**
 * 選択ボックスを非表示にします。
 */
export function hideSelectionBox() {
    if (selectionBoxMesh) {
        selectionBoxMesh.visible = false;
        // console.log("[SelectionBoxRenderer] 選択ボックスを非表示にしました。");
    }
}

/**
 * 選択ボックスで使用しているリソースを破棄します (アプリ終了時など)。
 */
export function disposeSelectionBox() {
    if (selectionBoxMesh) {
        console.log("[SelectionBoxRenderer] 選択ボックスのリソースを破棄します。");
        // シーンからの削除は呼び出し元で行う想定だが、ここで削除しても良い
        if (selectionBoxMesh.parent) {
            selectionBoxMesh.parent.remove(selectionBoxMesh);
        }
        // ジオメトリとマテリアルを破棄
        if (selectionBoxMesh.geometry) selectionBoxMesh.geometry.dispose();
        if (selectionBoxMesh.material) selectionBoxMesh.material.dispose();
    }
    selectionBoxMesh = null; // 参照をクリア
}