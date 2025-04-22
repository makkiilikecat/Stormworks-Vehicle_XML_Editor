/**
 * @fileoverview クリップボードの内容を半透明でプレビュー表示するレンダラー。
 */

import * as THREE from 'three';
// ブロックのジオメトリ取得と定義情報が必要
import { getBlockGeometry } from './proceduralMeshes.js';
import { getBlockDefinition } from '../data/blockDefinitions.js';

// --- モジュール内変数 ---

/** @type {THREE.Group | null} プレビューメッシュ全体をまとめるグループ */
let previewGroup = null;

/** プレビュー用マテリアル (半透明、色を少し薄くするなど) */
const previewMaterial = new THREE.MeshStandardMaterial({
    color: 0xaaaaaa, // デフォルト色を少し明るめに
    transparent: true,
    opacity: 0.5,
    depthWrite: false, // 他のオブジェクトの背後でも見えるように
    // side: THREE.DoubleSide, // 必要に応じて裏面も表示
    // wireframe: true, // ワイヤーフレーム表示にする場合
});

// --- 計算用一時変数 ---
const _pastePosition = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _translatePos = new THREE.Matrix4();
const _translateOffset = new THREE.Matrix4();
const _finalMatrix = new THREE.Matrix4();

// --- 公開関数 ---

/**
 * 現在表示されているペーストプレビューをクリア（削除）します。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 */
export function clearPastePreview(scene) {
    if (previewGroup) {
        console.log("[PastePreview] プレビューをクリアします。");
        // グループ内の全メッシュのリソースを解放
        previewGroup.traverse((object) => {
            if (object.isMesh) {
                if (object.geometry) object.geometry.dispose();
                // マテリアルは共有しているものを使い回すか、個別にクローンするかで破棄方法が変わる
                // 今回は共有 previewMaterial を使う想定なので破棄しない
                // if (object.material) object.material.dispose();
            }
        });
        // シーンからグループを削除
        scene.remove(previewGroup);
        previewGroup = null; // 参照をクリア
    }
}

/**
 * クリップボードの内容に基づいて、指定された中心点にプレビューメッシュ群を表示/更新します。
 * @param {THREE.Scene} scene - Three.js シーンオブジェクト。
 * @param {object | null} clipboardContent - クリップボードの内容 ({ blocks: CopiedBlockData[], origin: Vector3 })。nullの場合はクリア。
 * @param {THREE.Vector3} pasteCenter - 貼り付け先の中心となるワールド座標 (整数)。
 */
export function updatePastePreview(scene, clipboardContent, pasteCenter) {
    // 先に既存のプレビューをクリア
    clearPastePreview(scene);

    // クリップボードが空、または貼り付け中心が無効なら表示しない
    if (!clipboardContent || !clipboardContent.blocks || clipboardContent.blocks.length === 0 || !pasteCenter) {
        return;
    }

    console.log(`[PastePreview] ${clipboardContent.blocks.length} 個のブロックのプレビューを更新します...`);

    // プレビュー用メッシュを格納する新しいグループを作成
    previewGroup = new THREE.Group();
    previewGroup.name = "PastePreviewGroup";
    scene.add(previewGroup);

    const copyOrigin = clipboardContent.origin;

    clipboardContent.blocks.forEach(copiedBlockData => {
        try {
            // 1. プレビュー位置計算 (pasteFromClipboard と同じロジック)
            _pastePosition.copy(copiedBlockData.position) // コピー時のワールド座標
                          .sub(copyOrigin)           // コピー基準点からの相対ベクトル
                          .add(pasteCenter)          // 貼り付け基準点に加算
                          .round();                  // 最終座標を整数に丸める

            // 2. ブロック定義とジオメトリ取得
            const definition = getBlockDefinition(copiedBlockData.definitionId);
            const geometry = getBlockGeometry(definition.type, definition.size);

            // 3. メッシュ作成 (共有マテリアルを使用)
            const previewMesh = new THREE.Mesh(geometry, previewMaterial);
            previewMesh.matrixAutoUpdate = false; // 行列は手動設定

            // 4. 行列設定 (BlockData.updateMeshMatrix とほぼ同じロジック)
            const rotationMatrix = copiedBlockData.rotationMatrix; // クリップボードの回転
            const offsetArray = definition.offset || [0,0,0];
            _offset.fromArray(offsetArray); // オフセットをVector3に

            _translatePos.makeTranslation(_pastePosition.x, _pastePosition.y, _pastePosition.z);
            _translateOffset.makeTranslation(_offset.x, _offset.y, _offset.z);
            _finalMatrix.copy(_translatePos)
                        .multiply(rotationMatrix)
                        .multiply(_translateOffset);
            previewMesh.matrix.copy(_finalMatrix);
            previewMesh.matrixWorldNeedsUpdate = true; // ワールド行列の更新を指示

            // 5. グループに追加
            previewGroup.add(previewMesh);

        } catch (error) {
            console.error("[PastePreview] プレビューメッシュの作成中にエラー:", error, copiedBlockData);
        }
    });

    console.log("[PastePreview] プレビュー表示を更新しました。");
}

/**
 * ペーストプレビューで使用しているリソースを破棄します (アプリ終了時など)。
 * @param {THREE.Scene} scene - シーンオブジェクト。
 */
export function disposePastePreview(scene) {
    clearPastePreview(scene); // clear内でリソース破棄を行う
    console.log("[PastePreview] リソースを破棄しました。");
}