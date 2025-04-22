/**
 * @fileoverview 範囲選択モードで使用するギズモ (移動用、サイズ変更用) の
 * 作成、表示更新、非表示、リソース破棄を管理する。
 */

import * as THREE from 'three';

// --- モジュール内変数 ---
/** @type {THREE.Group | null} 全てのギズモオブジェクトを含むグループ */
let gizmoGroup = null;
/** @type {Array<THREE.Mesh>} サイズ変更ハンドル (6つの立方体メッシュ) を格納する配列 */
const sizeGizmoHandles = [];

// --- ギズモの見た目に関する定数 ---
const GIZMO_MOVE_CENTER_RADIUS = 0.15;    // 移動ギズモ中心球の半径
const GIZMO_MOVE_ARROW_LENGTH = 4.0;      // 移動ギズモ矢印の長さ
const GIZMO_MOVE_ARROW_HEAD_LENGTH = 1.0; // 移動ギズモ矢印の先端の長さ
const GIZMO_MOVE_ARROW_HEAD_WIDTH = 0.5;  // 移動ギズモ矢印の先端の幅
const GIZMO_RESIZE_HANDLE_SIZE = 0.3;     // サイズ変更ハンドルの立方体のサイズ
const GIZMO_COLORS = {                    // ギズモの各パーツの色
    x: 0xff0000, // 赤
    y: 0x00ff00, // 緑
    z: 0x0000ff, // 青
    center: 0xffff00, // 黄 (中心球)
    resize: 0xffffff, // 白 (サイズ変更ハンドル)
};
const GIZMO_OPACITY = 0.85; // ギズモの不透明度

// --- 計算用一時変数 ---
const _v1 = new THREE.Vector3(); // 汎用ベクトル

// --- プライベート関数 ---

/**
 * 全てのギズモオブジェクトを初期化（まだ作成されていなければ作成し、シーンに追加）します。
 * この関数はギズモが必要になったときに内部的に一度だけ呼び出されます。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 * @returns {boolean} ギズモの準備が完了した場合は true、失敗した場合は false。
 * @private
 */
function initializeGizmos(scene) {
    // 既に作成済みなら何もしない
    if (gizmoGroup) return true;

    try {
        // --- メインとなるグループを作成 ---
        gizmoGroup = new THREE.Group();
        gizmoGroup.name = "RangeGizmos"; // デバッグ用の名前
        gizmoGroup.visible = false;      // 最初は非表示
        gizmoGroup.userData.isRangeGizmoContainer = true; // このグループがギズモコンテナである印
        scene.add(gizmoGroup);           // シーンに追加

        // --- 移動用ギズモ (中心球 + 3軸矢印) の作成 ---
        // 1. 中心球
        const centerGeometry = new THREE.SphereGeometry(GIZMO_MOVE_CENTER_RADIUS, 16, 8);
        const centerMaterial = new THREE.MeshBasicMaterial({
            color: GIZMO_COLORS.center,
            depthTest: false,    // 常に手前に表示
            transparent: true,
            opacity: GIZMO_OPACITY
        });
        const centerSphere = new THREE.Mesh(centerGeometry, centerMaterial);
        centerSphere.renderOrder = 3; // 他のギズモパーツより手前に表示
        centerSphere.userData = { gizmoType: 'move_center', isGizmoHandle: true }; // ヒット判定用データ
        gizmoGroup.add(centerSphere);

        // 2. 3軸矢印 (ArrowHelper)
        const origin = new THREE.Vector3(0, 0, 0); // 矢印の開始点 (グループローカル原点)
        const arrows = [
            { dir: new THREE.Vector3(1, 0, 0), color: GIZMO_COLORS.x, axis: 'x' }, // +X (赤)
            { dir: new THREE.Vector3(0, 1, 0), color: GIZMO_COLORS.y, axis: 'y' }, // +Y (緑)
            { dir: new THREE.Vector3(0, 0, -1), color: GIZMO_COLORS.z, axis: 'z' }, // +Z (青、Three.js Z軸反転)
        ];
        arrows.forEach(({ dir, color, axis }) => {
            const arrow = new THREE.ArrowHelper(
                dir, origin,
                GIZMO_MOVE_ARROW_LENGTH, color,
                GIZMO_MOVE_ARROW_HEAD_LENGTH, GIZMO_MOVE_ARROW_HEAD_WIDTH
            );
            // 矢印の線のマテリアル設定
            arrow.line.material.depthTest = false;
            arrow.line.material.transparent = true;
            arrow.line.material.opacity = GIZMO_OPACITY;
            // 矢印の先端(円錐)のマテリアル設定
            arrow.cone.material.depthTest = false;
            arrow.cone.material.transparent = true;
            arrow.cone.material.opacity = GIZMO_OPACITY;
            // 描画順設定
            arrow.renderOrder = 2; // 選択ボックスより手前、中心球より奥
            // ArrowHelper自体にヒット判定用データを設定
            arrow.userData = { gizmoType: 'move_axis', axis: axis, isGizmoHandle: true };
            // ArrowHelperの内部メッシュ(Line, Cone)にも目印を付けておくと判定が確実になる場合がある
            arrow.line.userData = { isGizmoPart: true, parentGizmoData: arrow.userData };
            arrow.cone.userData = { isGizmoPart: true, parentGizmoData: arrow.userData };
            gizmoGroup.add(arrow); // グループに追加
        });

        // --- サイズ変更用ギズモ (6つのハンドル) の作成 ---
        const resizeHandleGeometry = new THREE.BoxGeometry(
            GIZMO_RESIZE_HANDLE_SIZE, GIZMO_RESIZE_HANDLE_SIZE, GIZMO_RESIZE_HANDLE_SIZE
        );
        const resizeHandleMaterial = new THREE.MeshBasicMaterial({
            color: GIZMO_COLORS.resize,
            depthTest: false,
            transparent: true,
            opacity: GIZMO_OPACITY
        });
        // 各面を示す識別子
        const faces = ['+x', '-x', '+y', '-y', '+z', '-z'];
        faces.forEach(face => {
            const handle = new THREE.Mesh(resizeHandleGeometry, resizeHandleMaterial.clone()); // マテリアルはクローン推奨
            handle.renderOrder = 2; // 矢印と同じ描画順
            handle.userData = { gizmoType: 'resize', face: face, isGizmoHandle: true }; // ヒット判定用データ
            sizeGizmoHandles.push(handle); // 管理用配列に追加
            gizmoGroup.add(handle);        // メイングループに追加
        });

        console.log("[RangeGizmoRenderer] 全てのギズモ (移動用+サイズ変更用) を作成しました。");
        return true; // 作成成功

    } catch (error) {
        console.error("[RangeGizmoRenderer] ギズモの作成中にエラーが発生しました:", error);
        disposeGizmos(); // 作成失敗時はリソースを破棄
        return false; // 作成失敗
    }
}

/**
 * サイズ変更ハンドルのローカル位置を、指定された Box3 のサイズに合わせて更新します。
 * @param {THREE.Box3} box - 位置の基準となる Box3 オブジェクト。
 * @private
 */
function updateSizeGizmoPositions(box) {
    // ハンドル数が正しくないか、グループが存在しない場合は処理しない
    if (sizeGizmoHandles.length !== 6 || !gizmoGroup) return;

    const size = box.getSize(_v1); // ボックスのサイズを取得
    const halfSize = size.multiplyScalar(0.5); // 中心から各面までの距離

    // 各ハンドルに対応するローカル位置を設定
    sizeGizmoHandles.forEach(handle => {
        const face = handle.userData.face;
        switch (face) {
            case '+x': handle.position.set(halfSize.x, 0, 0); break;
            case '-x': handle.position.set(-halfSize.x, 0, 0); break;
            case '+y': handle.position.set(0, halfSize.y, 0); break;
            case '-y': handle.position.set(0, -halfSize.y, 0); break;
            case '+z': handle.position.set(0, 0, -halfSize.z); break; // Z+面は Three.js の -Z 方向
            case '-z': handle.position.set(0, 0, halfSize.z); break;  // Z-面は Three.js の +Z 方向
        }
        // ハンドルの向き（回転）は、立方体なので変更不要
    });
}

// --- 公開関数 ---

/**
 * ギズモオブジェクト全体のグループを取得します。
 * ヒット判定などで外部からギズモオブジェクトにアクセスするために使用します。
 * @returns {THREE.Group | null} ギズモグループ、または未作成の場合は null。
 */
export function getGizmoGroup() {
    return gizmoGroup;
}

/**
 * 全てのギズモ (移動用、サイズ変更用) を指定された Box3 に合わせて更新し、表示状態にします。
 * ギズモがまだ作成されていない場合は、この関数内で作成されます。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 * @param {THREE.Box3} box - ギズモの位置とサイズの基準となる Box3 オブジェクト。
 */
export function updateGizmos(scene, box) {
    // ギズモがなければ作成を試みる
    if (!initializeGizmos(scene)) return; // 作成失敗時は処理中断

    // 無効なBoxが渡された場合や、空のBoxの場合はギズモを非表示にする
    if (!(box instanceof THREE.Box3) || box.isEmpty()) {
        gizmoGroup.visible = false;
        return;
    }

    // 1. グループ全体のワールド座標を中心点に設定
    box.getCenter(gizmoGroup.position);
    // 2. サイズ変更ハンドルのグループ内ローカル座標をボックスサイズに合わせて更新
    updateSizeGizmoPositions(box);
    // 3. グループ全体を表示状態にする
    gizmoGroup.visible = true;
    // console.log("[RangeGizmoRenderer] 全ギズモを表示/更新しました。");
}

/**
 * 全てのギズモ (移動用、サイズ変更用) を非表示にします。
 */
export function hideGizmos() {
    if (gizmoGroup) {
        gizmoGroup.visible = false;
        // console.log("[RangeGizmoRenderer] 全ギズモを非表示にしました。");
    }
}

/**
 * サイズ変更ギズモハンドルのみの表示/非表示を切り替えます。
 * クリップボード状態に応じて呼び出され、サイズ変更操作を一時的に無効化するのに使います。
 * @param {boolean} visible - 表示する場合は true、非表示にする場合は false。
 */
export function setSizeGizmosVisibility(visible) {
    // サイズ変更ハンドルが存在する場合のみ処理
    if (sizeGizmoHandles && sizeGizmoHandles.length === 6) {
        // console.log(`[RangeGizmoRenderer] サイズ変更ギズモの表示を ${visible ? '有効' : '無効'} にします。`);
        sizeGizmoHandles.forEach(handle => {
            handle.visible = visible; // 各ハンドルの表示状態を設定
        });
        // 移動ギズモ（中心球、矢印）の表示状態は変更しない
    } else {
        // ギズモがまだ初期化されていない可能性もある
        // console.warn("[RangeGizmoRenderer] サイズ変更ギズモが見つからないため、表示状態を変更できません。");
    }
}

/**
 * 全てのギズモで使用しているリソース（ジオメトリ、マテリアル）を破棄します。
 * アプリケーション終了時や、ギズモが不要になった際に呼び出す必要があります。
 */
export function disposeGizmos() {
    if (gizmoGroup) {
        console.log("[RangeGizmoRenderer] 全ギズモのリソースを破棄します。");
        // グループをシーンから削除
        if (gizmoGroup.parent) {
            gizmoGroup.parent.remove(gizmoGroup);
        }
        // グループ内の全ての子オブジェクトを走査
        gizmoGroup.traverse((object) => {
            // ジオメトリがあれば破棄
            if (object.geometry) {
                object.geometry.dispose();
            }
            // マテリアルがあれば破棄 (配列の場合も対応)
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(m => m.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
    }
    // モジュール内変数をリセット
    gizmoGroup = null;
    sizeGizmoHandles.length = 0; // 配列を空にする
}