/**
 * @fileoverview 範囲選択ギズモのドラッグ操作の状態を管理し、
 * ドラッグ中の座標計算と状態更新を実行します。
 */
import * as THREE from 'three';
import { getSelectionRangeBox, setSelectionRange } from './selectionState.js'; // 範囲操作のため
import { getMouseNDCFromEvent } from '../handlers/mouseInteractionHandler.js'; // NDC取得のため

/**
 * 範囲選択ギズモのドラッグ操作に関する状態を保持するオブジェクト。
 * @type {{
 * isDragging: boolean,             // ドラッグ操作中か
 * gizmoType: string | null,        // ドラッグ中のギズモ種別 ('move_center', 'move_axis', 'resize')
 * axisOrFace: string | null,       // 操作中の軸 ('x', 'y', 'z') または面 ('+x', '-x', ...)
 * startPointWorld: THREE.Vector3,  // ドラッグ開始時のRaycast交差点 (ワールド座標)
 * startPointOnPlane: THREE.Vector3,// ドラッグ開始時のドラッグ平面上の点 (ワールド座標)
 * startCenter: THREE.Vector3,      // ドラッグ開始時の選択範囲の中心座標
 * startBox: THREE.Box3,            // ドラッグ開始時の選択範囲Box3
 * dragPlane: THREE.Plane,          // ドラッグ計算に使用する平面
 * oppositeCorner: THREE.Vector3,   // サイズ変更時に固定される対角の頂点座標
 * dragAxisVector: THREE.Vector3,   // ドラッグ方向を示すワールドベクトル (移動軸または面の法線)
 * minBoxSize: number               // 選択ボックスの最小サイズ (各軸の辺の長さ)
 * }}
 */
export const rangeDragState = {
    isDragging: false,
    gizmoType: null,
    axisOrFace: null,
    startPointWorld: new THREE.Vector3(),
    startPointOnPlane: new THREE.Vector3(),
    startCenter: new THREE.Vector3(),
    startBox: new THREE.Box3(),
    dragPlane: new THREE.Plane(),
    oppositeCorner: new THREE.Vector3(),
    dragAxisVector: new THREE.Vector3(),
    minBoxSize: 1.0,
};

// --- 計算用一時変数 (メモリ確保削減のため) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _tempBox = new THREE.Box3(); // Box3の計算・設定用

/**
 * ギズモドラッグ操作を開始します。
 * ヒットしたギズモの種類に応じて、ドラッグに必要な初期状態（平面、軸、対角点など）を設定します。
 * (ユーザー提供の修正を反映)
 * @param {object} gizmoUserData - ヒットしたギズモの userData ({gizmoType, axis?, face?})。
 * @param {THREE.Vector3} intersectionPoint - Raycast の交差点 (ワールド座標)。
 * @param {object} appState - アプリケーション状態 (camera, controls を使用)。
 */
export function beginGizmoDrag(gizmoUserData, intersectionPoint, appState) {
    // 多重ドラッグ防止
    if (rangeDragState.isDragging) return;

    // 基本的なドラッグ状態を設定
    rangeDragState.isDragging = true;
    rangeDragState.gizmoType = gizmoUserData.gizmoType;
    rangeDragState.axisOrFace = gizmoUserData.axis || gizmoUserData.face || null;
    rangeDragState.startPointWorld.copy(intersectionPoint); // ヒットした点を記録

    // 現在の選択範囲を取得、なければデフォルト値を使用
    const currentRange = getSelectionRangeBox();
    if (currentRange && !currentRange.isEmpty()) {
        rangeDragState.startBox.copy(currentRange);
    } else {
        rangeDragState.startBox.setFromCenterAndSize(new THREE.Vector3(0,0,0), new THREE.Vector3(1,1,1));
        console.warn("[RangeDragState] ドラッグ開始時に有効な選択範囲が見つかりません。デフォルト(1x1x1@origin)を使用します。");
    }
    rangeDragState.startBox.getCenter(rangeDragState.startCenter); // 開始時の中心を取得

    // --- ドラッグタイプに応じた平面、軸ベクトル、対角点の設定 ---
    const cameraDirection = appState.camera.getWorldDirection(_v1); // カメラの前方ベクトル
    rangeDragState.dragAxisVector.set(0,0,0); // 軸ベクトルを初期化

    if (rangeDragState.gizmoType === 'move_center' || rangeDragState.gizmoType === 'move_axis') {
        // --- 移動操作 ---
        // ドラッグ平面: カメラに垂直で、"ボックスの中心" を通る平面
        rangeDragState.dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, rangeDragState.startCenter);
        if (rangeDragState.gizmoType === 'move_axis') {
            // 移動軸ベクトルを設定 (ユーザー提供コード: Z+は手前)
            const axis = rangeDragState.axisOrFace;
            if (axis === 'x') rangeDragState.dragAxisVector.set(1, 0, 0);
            else if (axis === 'y') rangeDragState.dragAxisVector.set(0, 1, 0);
            else if (axis === 'z') rangeDragState.dragAxisVector.set(0, 0, 1); // Z+ = (0,0,1)
        }
    } else if (rangeDragState.gizmoType === 'resize') {
        // --- サイズ変更操作 ---
        const face = rangeDragState.axisOrFace;
        const startBox = rangeDragState.startBox;
        // ドラッグ軸ベクトルと、固定される対角コーナーを設定
        if (face === '+x') { rangeDragState.dragAxisVector.set(1, 0, 0); rangeDragState.oppositeCorner.copy(startBox.min); }
        else if (face === '-x') { rangeDragState.dragAxisVector.set(-1, 0, 0); rangeDragState.oppositeCorner.copy(startBox.max); }
        else if (face === '+y') { rangeDragState.dragAxisVector.set(0, 1, 0); rangeDragState.oppositeCorner.copy(startBox.min); }
        else if (face === '-y') { rangeDragState.dragAxisVector.set(0, -1, 0); rangeDragState.oppositeCorner.copy(startBox.max); }
        else if (face === '+z') { rangeDragState.dragAxisVector.set(0, 0, 1); rangeDragState.oppositeCorner.copy(startBox.min); } // Z+ = (0,0,1)
        else if (face === '-z') { rangeDragState.dragAxisVector.set(0, 0, -1); rangeDragState.oppositeCorner.copy(startBox.max); } // Z- = (0,0,-1)
        else { console.error("[RangeDragState] 未知の resize face:", face); rangeDragState.isDragging = false; return; }

        // ドラッグ平面: カメラに垂直で、"操作開始点(ヒット点)" を通る平面 (ユーザー提供コード)
        rangeDragState.dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, rangeDragState.startPointWorld);
    } else {
        console.error("[RangeDragState] 未知のギズモタイプ:", rangeDragState.gizmoType);
        rangeDragState.isDragging = false; return;
    }

    // 平面上の操作開始点を計算 (開始点を平面に投影)
    rangeDragState.dragPlane.projectPoint(rangeDragState.startPointWorld, rangeDragState.startPointOnPlane);

    // ドラッグ開始時の設定
    appState.controls.enabled = false; // カメラコントロール無効化
    document.body.style.cursor = 'grabbing'; // カーソル変更
    console.log(`[RangeDragState] ギズモドラッグ開始: type=${rangeDragState.gizmoType}, axis/face=${rangeDragState.axisOrFace}`);
}


/**
 * ギズモドラッグ中の状態を更新します。マウス位置から新しいボックスを計算し、状態を更新します。
 * (ユーザー提供の修正を反映)
 * @param {PointerEvent} event - マウスイベント。
 * @param {object} appState - アプリケーション状態 (camera, scene を使用)。
 */
export function updateGizmoDrag(event, appState) {
    // ドラッグ中でなければ何もしない
    if (!rangeDragState.isDragging) return;

    // マウス座標から Ray を作成
    const mouseCoords = getMouseNDCFromEvent(event, appState.renderer.domElement);
    _raycaster.setFromCamera(mouseCoords, appState.camera);

    // Ray とドラッグ平面の交点を計算
    const currentPointOnPlane = _raycaster.ray.intersectPlane(rangeDragState.dragPlane, _v1); // 結果は _v1 に格納

    // 交差した場合のみ処理
    if (currentPointOnPlane) {
        // ドラッグ平面上での移動ベクトル (現在の点 - 平面上の開始点)
        const moveVector = _v2.copy(currentPointOnPlane).sub(rangeDragState.startPointOnPlane);
        // 更新結果を格納する Box3 を、ドラッグ開始時のボックスからコピー
        const newBox = _tempBox.copy(rangeDragState.startBox);

        // --- 移動操作 ('move_center' または 'move_axis') ---
        if (rangeDragState.gizmoType === 'move_center' || rangeDragState.gizmoType === 'move_axis') {
            const startCenter = rangeDragState.startCenter; // 開始時の中心
            const newCenter = _v3.copy(startCenter);    // 新しい中心を計算するベクトル

            if (rangeDragState.gizmoType === 'move_center') {
                // 中心移動: 平面上の移動ベクトルをそのまま加算
                newCenter.add(moveVector);
            } else { // 'move_axis'
                // 軸移動: 平面上の移動ベクトルを、指定されたワールド軸に射影して加算
                const axisVector = rangeDragState.dragAxisVector; // 開始時に設定した軸ベクトル
                if (axisVector.lengthSq() > 0) { // 有効な軸ベクトルか確認
                    // dot積で軸方向の移動距離(符号付き)を計算
                    const projectedDistance = moveVector.dot(axisVector);
                    // 軸ベクトル * 移動距離 = 軸方向の移動ベクトル
                    const projectedMove = _v1.copy(axisVector).multiplyScalar(projectedDistance);
                    newCenter.add(projectedMove); // 開始中心に軸方向の移動ベクトルを加算
                }
            }

            // 新しい中心座標を整数に丸める (ユーザー提供コードのロジック)
            const roundedCenter = newCenter.clone().round();
            // 開始中心から丸めた中心へのオフセットベクトルを計算
            const centerOffset = roundedCenter.sub(startCenter);
            // 開始時のボックスを、計算したオフセット分だけ平行移動させる
            newBox.translate(centerOffset);

        }
        // --- サイズ変更操作 ('resize') ---
        else if (rangeDragState.gizmoType === 'resize') {
            const face = rangeDragState.axisOrFace;         // 操作中の面 ('+x', '-x', ...)
            const axisVector = rangeDragState.dragAxisVector; // ドラッグ軸 (面の法線方向、開始時に設定)

            if (axisVector.lengthSq() > 0) { // 有効な軸か確認
                // 平面上の移動ベクトルをドラッグ軸に射影し、軸方向の移動距離(符号付き)を計算
                const dragDistance = moveVector.dot(axisVector);
                let newBoundaryValue; // 計算後の新しい境界座標

                // 操作面に応じて、開始時のボックス境界に移動距離を加算/減算
                if (face === '+x')      newBoundaryValue = rangeDragState.startBox.max.x + dragDistance;
                else if (face === '-x') newBoundaryValue = rangeDragState.startBox.min.x - dragDistance; // 符号反転
                else if (face === '+y') newBoundaryValue = rangeDragState.startBox.max.y + dragDistance;
                else if (face === '-y') newBoundaryValue = rangeDragState.startBox.min.y - dragDistance; // 符号反転
                else if (face === '+z') newBoundaryValue = rangeDragState.startBox.min.z + dragDistance; // Z+はmin.zを更新
                else if (face === '-z') newBoundaryValue = rangeDragState.startBox.max.z - dragDistance; // Z-はmax.zを更新(符号反転)

                // 新しい境界値を整数に丸める
                const roundedBoundary = Math.round(newBoundaryValue);

                // ★注意: クランプ処理 (最小サイズ維持、反転防止) はユーザーのコードでは削除されているため、ここでも削除
                // 反転を許容し、最小サイズ制限なし

                // 丸めた境界値を newBox の対応する min/max に設定
                if (face === '+x') newBox.max.x = roundedBoundary;
                else if (face === '-x') newBox.min.x = roundedBoundary;
                else if (face === '+y') newBox.max.y = roundedBoundary;
                else if (face === '-y') newBox.min.y = roundedBoundary;
                else if (face === '+z') newBox.min.z = roundedBoundary;
                else if (face === '-z') newBox.max.z = roundedBoundary;

            }
        }

        // 計算結果の newBox で選択範囲の状態と表示を更新
        setSelectionRange(newBox, appState.scene);

    } else {
        // Ray が平面と交差しない場合 (通常は稀)
        // console.warn("[RangeDragState] マウスカーソルがドラッグ平面と交差しなくなりました。");
    }
}


/**
 * ギズモドラッグ操作を終了します。状態をリセットし、カメラ操作を有効化します。
 * (ユーザー提供のコードに基づき、ボックス正規化処理はコメントアウト)
 * @param {object} appState - アプリケーション状態 (controls を使用)。
 */
export function endGizmoDrag(appState) {
    // ドラッグ中でなければ何もしない
    if (!rangeDragState.isDragging) return;
    console.log("[RangeDragState] ギズモドラッグ終了");

    // ドラッグ状態をリセット
    rangeDragState.isDragging = false;
    // 最後のギズモタイプや軸/面情報は保持しておいても良いかもしれない (デバッグ用など)
    // rangeDragState.gizmoType = null;
    // rangeDragState.axisOrFace = null;

    // カメラコントロールを有効化
    appState.controls.enabled = true;
    // カーソルをデフォルトに戻す
    document.body.style.cursor = 'default';

    // --- 選択範囲の正規化 (min/maxが入れ替わっている場合に戻す処理) ---
    // ユーザーにより反転が許容されたため、この処理はコメントアウト
    /*
    const currentRange = getSelectionRangeBox();
    if (currentRange) {
        const min = new THREE.Vector3(
            Math.min(currentRange.min.x, currentRange.max.x), ... );
        const max = new THREE.Vector3(
            Math.max(currentRange.min.x, currentRange.max.x), ... );
        const normalizedBox = new THREE.Box3(min, max);
        if (!currentRange.equals(normalizedBox)) {
             console.log("[RangeDragState] ドラッグ終了時にボックスを正規化しました。");
             setSelectionRange(normalizedBox, appState.scene);
        }
    }
    */

    // TODO: アンドゥ履歴登録などの後処理をここで行う (Step 6)
}

/**
 * ギズモドラッグ状態を完全にリセットします (エラー時や初期化用)。
 */
export function resetGizmoDrag() {
     rangeDragState.isDragging = false;
     rangeDragState.gizmoType = null;
     rangeDragState.axisOrFace = null;
     rangeDragState.startPointWorld.set(0,0,0);
     rangeDragState.startPointOnPlane.set(0,0,0);
     rangeDragState.startCenter.set(0,0,0);
     rangeDragState.startBox.makeEmpty();
     rangeDragState.dragPlane.set(new THREE.Vector3(0,1,0), 0); // デフォルトYアップ平面
     rangeDragState.oppositeCorner.set(0,0,0);
     rangeDragState.dragAxisVector.set(0,0,0);
     // minBoxSize は定数なのでリセット不要
}