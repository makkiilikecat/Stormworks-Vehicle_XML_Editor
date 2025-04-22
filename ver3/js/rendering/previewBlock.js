import * as THREE from 'three';
import { getBlockDefinition } from '../data/blockDefinitions.js'; // ブロック定義をインポート
import { getBlockGeometry } from './proceduralMeshes.js';   // ジオメトリ取得関数をインポート
import { getCurrentPlacementBlockId } from '../state/placementState.js'; // 配置ブロックID取得関数

// --- 定数 ---
// プレビュー用マテリアル (半透明、緑色)
const previewMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff00,    // 色: 緑
    transparent: true,  // 透明有効
    opacity: 0.5,       // 不透明度: 50%
    depthWrite: false,  // 深度バッファへの書き込み無効 (他のオブジェクトの背後でも見えるように)
});

// --- モジュール内変数 ---
// プレビュー用メッシュのインスタンス (単一)
let previewMesh = null;
// 現在のプレビューメッシュで使用しているジオメトリタイプとサイズ (再生成判定用)
let currentPreviewType = null;
let currentPreviewSize = null;

// --- プライベート関数 ---

/**
 * プレビューブロックのメッシュを取得または更新（必要ならジオメトリ変更）。
 * 形状は現在配置選択中のブロックタイプに基づきます。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 * @returns {THREE.Mesh | null} プレビュー用メッシュ。存在しない場合は null。
 * @private
 */
function getAndUpdatePreviewMesh(scene) {
    // 現在選択中の配置ブロック定義を取得
    const blockId = getCurrentPlacementBlockId();
    const definition = getBlockDefinition(blockId);
    const newType = definition.type;
    const newSize = definition.size;

    // メッシュが存在しない、またはタイプかサイズが変わった場合に再生成/更新
    if (!previewMesh || currentPreviewType !== newType || JSON.stringify(currentPreviewSize) !== JSON.stringify(newSize)) {
        console.log(`[PreviewBlock] プレビューメッシュのジオメトリを更新: タイプ=${newType}, サイズ=${newSize}`);
        currentPreviewType = newType;
        currentPreviewSize = newSize;
        // 新しいジオメトリを取得
        const geometry = getBlockGeometry(newType, newSize);

        if (previewMesh) {
            // 既存メッシュがあればジオメトリを差し替え
            previewMesh.geometry.dispose(); // 古いジオメトリを破棄
            previewMesh.geometry = geometry;
            console.log("[PreviewBlock] 既存プレビューメッシュのジオメトリを差し替えました。");
        } else {
            // 新規作成
            previewMesh = new THREE.Mesh(geometry, previewMaterial);
            previewMesh.matrixAutoUpdate = false; // 行列は手動で更新
            previewMesh.visible = false;        // 最初は非表示
            scene.add(previewMesh);             // シーンに追加
            console.log("[PreviewBlock] 新しいプレビューメッシュを作成し、シーンに追加しました。");
        }
    }
    return previewMesh;
}

// --- 公開関数 ---

/**
 * プレビューブロックを指定された位置と回転で表示します。
 * 形状は現在選択中のブロックタイプに合わせます。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 * @param {THREE.Vector3} position - 表示位置 (Three.js ワールド座標系)。
 * @param {THREE.Matrix4} orientationMatrix - 表示向き (回転行列)。
 */
export function showPreviewBlock(scene, position, orientationMatrix) {
    // プレビューメッシュを取得/更新
    const mesh = getAndUpdatePreviewMesh(scene);
    if (!mesh) {
        console.warn("[PreviewBlock] プレビューメッシュの取得/更新に失敗しました。表示できません。");
        return;
    }

    // 位置・向きを行列から設定
    orientationMatrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    // 分解後の位置を、引数で与えられた最終的な配置位置で上書き
    mesh.position.copy(position);
    mesh.updateMatrix(); // メッシュのローカル行列を更新
    mesh.updateMatrixWorld(true); // ワールド行列も即時更新

    // 表示状態にする
    mesh.visible = true;
    // console.log("[PreviewBlock] プレビューを表示しました。 Position:", position);
}

/**
 * プレビューブロックを非表示にします。
 */
export function hidePreviewBlock() {
    // previewMesh が存在し、かつ現在表示されている場合に非表示にする
    if (previewMesh && previewMesh.visible) {
        previewMesh.visible = false;
        console.log("[PreviewBlock] プレビューを非表示にしました。");
    } else {
        // console.log("[PreviewBlock] プレビューは既に非表示、または存在しません。");
    }
}

/**
 * プレビューブロックの向き (回転) を更新します。
 * 位置は変更しません。表示中の場合のみ更新されます。
 * @param {THREE.Matrix4} orientationMatrix - 新しい向きを表す回転行列。
 */
export function updatePreviewOrientation(orientationMatrix) {
    // プレビューメッシュが存在し、かつ表示されている場合のみ処理
    if (previewMesh && previewMesh.visible) {
        // 現在の位置を保持
        const currentPos = previewMesh.position.clone();
        // 新しい回転行列から回転情報 (Quaternion) を適用
        orientationMatrix.decompose(new THREE.Vector3(), previewMesh.quaternion, new THREE.Vector3());
        // 位置を元に戻す
        previewMesh.position.copy(currentPos);
        // メッシュの行列を更新
        previewMesh.updateMatrix();
        previewMesh.updateMatrixWorld(true); // ワールド行列も即時更新
        // console.log("[PreviewBlock] プレビューの向きを更新しました。");
    }
}