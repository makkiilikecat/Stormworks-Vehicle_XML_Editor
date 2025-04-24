/**
 * @fileoverview 範囲選択モードで使用される、選択範囲を示す
 * 半透明のワイヤーフレームボックスの描画と更新を担当します。
 */
import * as THREE from 'three';

// --- モジュール内変数 ---

/**
 * 選択範囲ボックスのメッシュオブジェクト (THREE.LineSegments)。
 * 一度生成されたら使い回されます。
 * @type {THREE.LineSegments | null}
 */
let selectionBoxMesh = null;

/**
 * 選択範囲ボックスのワイヤーフレーム用マテリアル。
 * 黄色、半透明、深度テスト無効（常に手前に見えるように）に設定。
 * @type {THREE.LineBasicMaterial}
 */
const boxMaterial = new THREE.LineBasicMaterial({
    color: 0xffff00,       // 色: 黄色
    linewidth: 2,          // 線の太さ (WebGL では一部環境でしか有効でない可能性あり)
    depthTest: false,      // 深度テスト無効 (他のオブジェクトに隠れない)
    transparent: true,     // 半透明有効
    opacity: 0.7           // 不透明度
});

// --- 計算用の一時変数 (関数の呼び出し毎に生成するのを避ける) ---
/** @type {THREE.Vector3} ボックスの中心座標計算用 */
const _center = new THREE.Vector3();
/** @type {THREE.Vector3} ボックスのサイズ計算用 */
const _size = new THREE.Vector3();
/** @type {number} ボックスを表示する最小サイズ (これ未満だと非表示) */
const MIN_SIZE = 0.01;

// --- プライベート関数 ---

/**
 * 選択ボックスのメッシュ (LineSegments) を取得します。
 * まだ存在しない場合は、生成してシーンに追加します。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 * @returns {THREE.LineSegments | null} 選択ボックスメッシュ。作成に失敗した場合は null。
 * @private
 */
function getOrCreateSelectionBox(scene) {
    // まだメッシュが生成されていなければ生成
    if (!selectionBoxMesh) {
        try {
            // 1x1x1 サイズの立方体ジオメトリを作成
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            // 立方体のエッジ（辺）情報のみを抽出したジオメトリを作成
            const edges = new THREE.EdgesGeometry(geometry);
            // エッジジオメトリと線マテリアルを使って LineSegments メッシュを生成
            selectionBoxMesh = new THREE.LineSegments(edges, boxMaterial);
            // 行列は手動で更新するため、自動更新は無効化
            selectionBoxMesh.matrixAutoUpdate = false;
            // 描画順序を優先 (他の半透明オブジェクトより手前に描画されやすくする)
            selectionBoxMesh.renderOrder = 1;
            // 最初は非表示状態
            selectionBoxMesh.visible = false;
            // シーンに追加
            scene.add(selectionBoxMesh);
            console.log("[SelectionBoxRenderer] 選択ボックスメッシュを生成し、シーンに追加しました。");
        } catch (error) {
            console.error("[SelectionBoxRenderer] 選択ボックスメッシュの作成中にエラーが発生しました:", error);
            selectionBoxMesh = null; // エラー時は null を返す
        }
    }
    // 既存のメッシュまたは null を返す
    return selectionBoxMesh;
}

// --- 公開関数 ---

/**
 * 指定された Box3 に基づいて選択ボックスの位置とサイズを更新し、表示します。
 * Box3 の min/max は選択範囲の最小/最大の整数座標を示していると仮定し、
 * ボックスがその範囲のグリッドセル全体を正確に覆うように計算します。
 *
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 * @param {THREE.Box3} box - 表示する範囲を示す Box3 オブジェクト。
 * `box.min` と `box.max` が整数座標を持つことを期待します。
 */
export function showSelectionBox(scene, box) {
    // 選択ボックスメッシュを取得（なければ生成）
    const mesh = getOrCreateSelectionBox(scene);

    // メッシュが存在しない、または与えられた box が無効 (Box3でない、空など) なら非表示にして終了
    if (!mesh || !(box instanceof THREE.Box3) || box.isEmpty()) {
        if (mesh) mesh.visible = false;
        return;
    }

    // --- グリッド境界に合わせたボックスの中心とサイズを計算 ---
    const min = box.min; // 範囲の最小座標 (例: {x: 0, y: 0, z: 0})
    const max = box.max; // 範囲の最大座標 (例: {x: 2, y: 1, z: 0})

    // 1. 中心座標の計算: 各軸の (最小値 + 最大値) / 2
    //    例: xの中心 = (0 + 2) / 2 = 1
    _center.set(
        (min.x + max.x) / 2,
        (min.y + max.y) / 2,
        (min.z + max.z) / 2
    );

    // 2. サイズの計算: 各軸の (最大値 - 最小値) + 1 (ブロック数)
    //    例: xのサイズ = (2 - 0) + 1 = 3
    _size.set(
        Math.round(Math.max(max.x - min.x, 1)),
        Math.round(Math.max(max.y - min.y, 1)),
        Math.round(Math.max(max.z - min.z, 1)),
    );

    // ボックスメッシュのワールド行列を更新
    // .compose(position, quaternion, scale) を使用
    mesh.matrix.compose(
        _center,                      // 位置: 計算した中心座標
        new THREE.Quaternion(),       // 回転: なし (軸平行ボックスのため)
        _size                         // スケール: 計算したサイズ
    );
    // ワールド行列が更新されたことを Three.js に通知
    mesh.matrixWorldNeedsUpdate = true;
    // メッシュを表示状態にする
    mesh.visible = true;
    // console.log(`[SelectionBoxRenderer] 選択ボックスを更新: Center=${_center.toArray().map(v=>v.toFixed(1))}, Size=${_size.toArray().map(v=>v.toFixed(1))}`);
}

/**
 * 選択ボックスを非表示にします。
 */
export function hideSelectionBox() {
    // メッシュが存在すれば visible プロパティを false にする
    if (selectionBoxMesh) {
        selectionBoxMesh.visible = false;
    }
}

/**
 * 選択ボックスメッシュとマテリアルのリソースを破棄します。
 * アプリケーション終了時や、不要になった際に呼び出すことを想定。
 */
export function disposeSelectionBox() {
    // メッシュが存在する場合のみ処理
    if (selectionBoxMesh) {
        console.log("[SelectionBoxRenderer] 選択ボックスのリソースを破棄します。");
        // シーンから削除 (もし親があれば)
        if (selectionBoxMesh.parent) {
            selectionBoxMesh.parent.remove(selectionBoxMesh);
        }
        // ジオメトリを破棄
        if (selectionBoxMesh.geometry) {
            selectionBoxMesh.geometry.dispose();
        }
        // マテリアルを破棄 (LineBasicMaterial は共有インスタンスだが、念のため)
        if (selectionBoxMesh.material) {
             // 共有マテリアルのため、他の場所で使われていないか注意が必要
             // ここでは破棄する想定とする（もし他で boxMaterial を使っていなければ）
            if (typeof selectionBoxMesh.material.dispose === 'function') {
                selectionBoxMesh.material.dispose();
            }
        }
        // 参照を null にして、ガベージコレクション対象とする
        selectionBoxMesh = null;
    }
}