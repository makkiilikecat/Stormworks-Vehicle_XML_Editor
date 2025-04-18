import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { isXMLEditModeActive } from './appState.js';
import { updateSelectedBlockTransform } from './selectionController.js'; // 更新関数をインポート

let camera, domElement, scene, transformControls;
let selectionController = null; // 参照を保持

// 計算用ヘルパー
const tempMatrix = new THREE.Matrix4();
const tempPos = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();
const tempScale = new THREE.Vector3();
const newOrientation = new THREE.Matrix4();

export function initTransformControlsController(cam, rendererDom, scn, selectionCtrl) {
    camera = cam;
    domElement = rendererDom;
    scene = scn;
    selectionController = selectionCtrl;

    // TransformControlsの初期化
    transformControls = new TransformControls(camera, domElement);
    transformControls.setSize( 0.8 ); // ギズモの見た目のサイズ調整
    transformControls.addEventListener('change', handleTransformChange); // ドラッグ中のイベント
    transformControls.addEventListener('dragging-changed', function ( event ) {
        // ドラッグ中はOrbitControlsを無効化 (操作競合を防ぐ)
        // cameraControls.js に disable/enable メソッドが必要
        // if (cameraControls) cameraControls.enabled = !event.value;
    } );
     transformControls.addEventListener('mouseUp', handleTransformEnd); // ドラッグ終了時のイベント (Undo/Redo用)

    transformControls.enabled = false; // 最初は無効
    transformControls.visible = false;
    scene.add(transformControls);
}

/** ギズモを指定したメッシュにアタッチ */
export function attachGizmo(mesh) {
    if (!transformControls || !isXMLEditModeActive()) return; // XML編集モードでのみ動作
    console.log("Attaching Gizmo to:", mesh.userData.blockId);
    transformControls.attach(mesh);
    transformControls.enabled = true;
    transformControls.visible = true;
    // デフォルトモードを設定 (例: 移動)
    setGizmoMode('translate');
}

/** ギズモをデタッチ */
export function detachGizmo() {
    if (!transformControls) return;
    console.log("Detaching Gizmo");
    transformControls.detach();
    transformControls.enabled = false;
    transformControls.visible = false;
}

/** ギズモのモードを設定 */
export function setGizmoMode(mode) {
    if (!transformControls || !transformControls.object) return; // オブジェクトがない場合は無視
    if (['translate', 'rotate', 'scale'].includes(mode)) {
        transformControls.setMode(mode);
        console.log("Gizmo mode set to:", mode);
    }
}

/** TransformControlsの'change'イベントハンドラ (ドラッグ中) */
function handleTransformChange() {
    // 頻繁に呼ばれるので、ここでは重い処理（データ更新）はしない方が良いかも
     if (transformControls.object) {
        // 必要なら、メッシュのワールド行列を手動で更新
        // transformControls.object.updateMatrixWorld(true);
    }
}

/** TransformControlsの'mouseUp'イベントハンドラ (ドラッグ終了時) */
function handleTransformEnd() {
    if (!transformControls.object) return;

    const mesh = transformControls.object;
    // 更新されたワールド行列を取得
    tempMatrix.copy(mesh.matrixWorld); // attachされたオブジェクトのワールド行列

    // ワールド行列を position と orientation (回転+スケール) に分解
    tempMatrix.decompose(tempPos, tempQuat, tempScale);
    // orientation 行列を作成 (位置は 0,0,0)
    newOrientation.compose(new THREE.Vector3(0,0,0), tempQuat, tempScale);

    // selectionController経由で placedBlocks データを更新
    if (selectionController) {
        selectionController.updateSelectedBlockTransform(tempPos, newOrientation);
    }

    // Undo/Redo履歴に登録するならここ
    // commandHistory.add(new TransformCommand(mesh.userData.blockId, oldPosition, oldOrientation, tempPos, newOrientation));
}

// モード変更などの他の制御関数もここに追加可能