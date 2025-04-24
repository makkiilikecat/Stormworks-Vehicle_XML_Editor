/**
 * @fileoverview ブロックデータの3Dレンダリングを担当するモジュール。
 * ブロック定義に基づいて適切なジオメトリとマテリアルを選択し、
 * シーン内にメッシュとして表示します。
 * また、編集モードに応じて表示方法（通常、ゴースト+前景キューブ）を切り替えます。
 * 【主な変更点】
 * - コメントを全体的に見直し、処理内容を明確化。
 * - 各主要関数にデバッグログを追加（特に行列計算やモード切替）。
 */

import * as THREE from 'three';
import { getBlockDefinition } from '../data/blockDefinitions.js'; // ブロック定義情報取得
import { getBlockGeometry } from './proceduralMeshes.js';   // プロシージャルジオメトリ取得
import { EditMode } from '../state/editMode.js';             // 編集モードEnum
// BlockData クラスは直接使わないが、関連処理を理解するためにコメントアウトで残す
// import { BlockData } from '../data/blockData.js';

// === マテリアル定義 ===
// 各マテリアルは、特定用途向けのベースとして定義し、
// 必要に応じてクローンして使用することで、元の設定を保持しつつ個別の変更（色など）を可能にします。

/** 通常表示用のベースマテリアル (灰色、やや粗い) */
const baseBlockMaterial = new THREE.MeshStandardMaterial({
    color: 0x999999, roughness: 0.7, metalness: 0.2, emissive: 0x000000,
    polygonOffset: false, name: 'baseBlockMaterial'
});

/** 未対応ブロック用マテリアル (共有、チェック模様テクスチャ) */
const unknownMaterial = new THREE.MeshStandardMaterial({
    map: createCheckerboardTexture(0x1A001A, 0x330033, 16, 2), roughness: 0.8, metalness: 0.1,
    polygonOffset: false, name: 'unknownMaterial'
});

/** XML編集モード用: 前景キューブのベースマテリアル (クローン元、白、手前にオフセット) */
const foregroundCubeMaterialBase = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.6, metalness: 0.1, emissive: 0x000000,
    polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -4.0, // 手前に表示
    name: 'foregroundCubeMaterialBase'
});

/** XML編集モード用: 背景ゴーストのベースマテリアル (クローン元、半透明) */
const ghostMaterialBase = new THREE.MeshStandardMaterial({
    transparent: true, opacity: 0.15, depthWrite: false, emissive: 0x000000,
    polygonOffset: false, side: THREE.FrontSide, name: 'ghostMaterialBase'
});

// === ジオメトリ定義 ===

/** XML編集モード用: 前景キューブの共有ジオメトリ (1x1x1) */
const foregroundCubeGeometry = new THREE.BoxGeometry(1, 1, 1);

// === 状態 ===

/** 現在シーンに追加されている前景キューブメッシュのリスト (モード切替時の削除用) */
let foregroundCubes = [];

// === ヘルパー関数 ===

/**
 * チェッカーボードテクスチャを生成します (内部ヘルパー)。
 * @private
 */
function createCheckerboardTexture(color1 = 0x000000, color2 = 0xffffff, size = 16, checks = 2) {
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d'); const c1 = `#${color1.toString(16).padStart(6, '0')}`; const c2 = `#${color2.toString(16).padStart(6, '0')}`;
    context.fillStyle = c1; context.fillRect(0, 0, size, size); context.fillStyle = c2;
    const checkSize = size / checks;
    for (let i = 0; i < checks; i++) { for (let j = 0; j < checks; j++) { if ((i + j) % 2 === 0) { context.fillRect(i * checkSize, j * checkSize, checkSize, checkSize); } } }
    const texture = new THREE.CanvasTexture(canvas); texture.magFilter = THREE.NearestFilter; texture.needsUpdate = true;
    return texture;
}

/**
 * 指定されたBlockDataに対応する新しい通常表示用Meshオブジェクトを作成します。
 * @param {BlockData} blockData - メッシュの元となるブロックデータ。
 * @returns {THREE.Mesh} 作成されたメッシュオブジェクト。行列は未設定。
 * @export (renderBlocksから呼ばれる)
 */
export function createBlockMesh(blockData) {
    const definition = getBlockDefinition(blockData.definitionId);
    console.log(`[DEBUG][createBlockMesh] Block ID ${blockData.id}, Def ID: ${blockData.definitionId}, Type: ${definition.type}`); // ★ログ追加
    const geometry = getBlockGeometry(definition.type, definition.size);
    const isUnknown = definition.type === 'unknown_cube';
    const materialInstance = isUnknown ? unknownMaterial : baseBlockMaterial.clone();

    const mesh = new THREE.Mesh(geometry, materialInstance);
    mesh.userData.isManagedBlockMesh = true; mesh.userData.isForegroundCube = false;
    mesh.userData.blockId = blockData.id;
    mesh.matrixAutoUpdate = false; // 行列は updateMeshMatrix で設定
    return mesh;
}

// === 公開関数 ===

/**
 * シーン内の全ての管理対象ブロックメッシュ（前景・背景問わず）をクリアします。
 * @param {THREE.Scene} scene - 操作対象のシーン。
 * @export
 */
export function clearBlocks(scene) {
    console.log("[DEBUG][clearBlocks] クリア処理開始..."); // ★ログ追加
    const objectsToRemove = [];
    scene.traverse((object) => { if (object.isMesh && object.userData.isManagedBlockMesh) { objectsToRemove.push(object); } });

    if (objectsToRemove.length > 0) {
        console.log(`[BlockRenderer] ${objectsToRemove.length} 個の管理対象ブロックメッシュをクリアします。`);
        objectsToRemove.forEach(mesh => {
            scene.remove(mesh);
            // マテリアル破棄 (共有以外)
            if (mesh.material?.dispose) {
                if (mesh.material !== unknownMaterial && mesh.material.name !== foregroundCubeMaterialBase.name && mesh.material.name !== ghostMaterialBase.name) {
                    mesh.material.dispose();
                }
            } else if (Array.isArray(mesh.material)) { mesh.material.forEach(m => { if (m?.dispose) m.dispose(); }); }
        });
        foregroundCubes = []; // 前景キューブリストもクリア
    }
     console.log("[DEBUG][clearBlocks] クリア処理完了。"); // ★ログ追加
}

/**
 * BlockData配列に基づき、通常モード表示用のメッシュを作成または更新します。
 * 各メッシュの行列は `blockData.updateMeshMatrix()` で設定されます。
 * @param {THREE.Scene} scene - シーンオブジェクト。
 * @param {BlockData[]} blockDataArray - 表示/更新するブロックデータ配列。
 * @export
 */
export function renderBlocks(scene, blockDataArray) {
    console.log(`[DEBUG][renderBlocks] 通常モード描画開始 (${blockDataArray.length} blocks)...`);
    clearForegroundCubes(scene); // 前景キューブがあれば削除

    let addedCount = 0; let updatedCount = 0;
    const processedBlockIds = new Set();

    blockDataArray.forEach((blockData, index) => {
        processedBlockIds.add(blockData.id);
        let mesh = blockData.mesh;
        const definition = getBlockDefinition(blockData.definitionId);
        const geometry = getBlockGeometry(definition.type, definition.size);
        const isUnknown = definition.type === 'unknown_cube';
        const targetMaterialBase = isUnknown ? unknownMaterial : baseBlockMaterial;
        let needsRecreation = false; // 再生成フラグ

        // メッシュ再生成条件チェック
        if (!mesh || !scene.getObjectById(mesh.id) || mesh.geometry !== geometry ||
            (mesh.material !== unknownMaterial && isUnknown) || (mesh.material === unknownMaterial && !isUnknown) ||
            mesh.material.transparent) { // ゴーストマテリアルになっていたら再生成
            needsRecreation = true;
        }

        if (needsRecreation) {
             // console.log(`[DEBUG][renderBlocks] Block ID ${blockData.id}: メッシュ再生成`); // ★ログ追加
            if (mesh) { scene.remove(mesh); if (mesh.material?.dispose && mesh.material !== unknownMaterial) { mesh.material.dispose(); } }
            mesh = createBlockMesh(blockData);
            scene.add(mesh);
            blockData.mesh = mesh; blockData.foregroundMesh = null;
            addedCount++;
        } else {
            // console.log(`[DEBUG][renderBlocks] Block ID ${blockData.id}: 既存メッシュ更新`); // ★ログ追加
            updatedCount++;
            if (!isUnknown && mesh.material?.emissive) { mesh.material.emissive.setHex(baseBlockMaterial.emissive.getHex()); mesh.material.emissiveIntensity = baseBlockMaterial.emissiveIntensity || 0; }
            blockData.foregroundMesh = null;
        }

        // ★ 行列設定: BlockData のメソッドに委譲 (t属性も考慮される)
        // console.log(`[DEBUG][renderBlocks] Block ID ${blockData.id}: updateMeshMatrix() 呼び出し前 Matrix:`, mesh.matrix.elements.slice(12, 15).join(',')); // ★ログ追加 (位置部分)
        console.table(blockData)
        blockData.updateMeshMatrix(); // これが mesh.matrix を更新する
        // console.log(`[DEBUG][renderBlocks] Block ID ${blockData.id}: updateMeshMatrix() 呼び出し後 Matrix:`, mesh.matrix.elements.slice(12, 15).join(',')); // ★ログ追加 (位置部分)
    });

    clearOrphanMeshes(scene, processedBlockIds); // 不要になったメッシュを削除
    console.log(`[BlockRenderer] 通常モード表示: ${addedCount} 個追加/再生成, ${updatedCount} 個更新。`);
}


/**
 * レンダリングモードを切り替えます（通常表示 ⇔ XML編集表示）。
 * @param {EditMode} mode - 新しい編集モード。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列。
 * @param {THREE.Scene} scene - シーンオブジェクト。
 * @export
 */
export function setRenderMode(mode, loadedBlocks, scene) {
    console.log(`[DEBUG][setRenderMode] モード切替開始: TargetMode=${mode}`);

    if (mode === EditMode.XML_EDIT) {
        // --- XML編集モード表示に切り替え ---
        clearForegroundCubes(scene); // 既存の前景キューブ削除
        const newForegroundCubes = [];
        console.log(`[DEBUG][setRenderMode] ${loadedBlocks.length} 個のブロックをXML編集モードで表示開始...`);

        loadedBlocks.forEach((blockData, index) => {
            const blockId = blockData.id;
            console.log(`[DEBUG][setRenderMode] Processing Block ID: ${blockId} (${index + 1}/${loadedBlocks.length})`);

            // 1. 背景ゴースト設定
            if (blockData.mesh && scene.getObjectById(blockData.mesh.id)) {
                // console.log(`[DEBUG][setRenderMode] Block ID ${blockId}: 背景ゴースト設定`);
                let originalColor = baseBlockMaterial.color;
                if (blockData.mesh.material === unknownMaterial) { originalColor = new THREE.Color(0x555555); }
                else if (blockData.mesh.material?.color) { originalColor = blockData.mesh.material.color; }
                const ghostMatInstance = ghostMaterialBase.clone(); ghostMatInstance.color.copy(originalColor);
                if (blockData.mesh.material?.dispose && blockData.mesh.material !== unknownMaterial) { blockData.mesh.material.dispose(); }
                blockData.mesh.material = ghostMatInstance; blockData.mesh.visible = true; blockData.mesh.matrixWorldNeedsUpdate = true;
            } else { console.warn(`[BlockRenderer][setRenderMode] Block ID ${blockId}: 通常メッシュが見つからず背景ゴースト設定不可`); }

            // 2. 前景キューブ作成
            // console.log(`[DEBUG][setRenderMode] Block ID ${blockId}: 前景キューブ作成`);
            const foregroundMaterialInstance = foregroundCubeMaterialBase.clone();
            const foregroundCube = new THREE.Mesh(foregroundCubeGeometry, foregroundMaterialInstance);
            foregroundCube.userData.isManagedBlockMesh = true; foregroundCube.userData.isForegroundCube = true;
            foregroundCube.userData.blockId = blockId;
            foregroundCube.matrixAutoUpdate = false;

            // 3. BlockData に参照を設定 & 行列更新を呼び出し
            // console.log(`[DEBUG][setRenderMode] Block ID ${blockId}: BlockData.foregroundMesh 参照設定`);
            blockData.foregroundMesh = foregroundCube; // ★ 必ず updateMeshMatrix の前に参照を設定

            console.log(`[DEBUG][setRenderMode] Block ID ${blockId}: updateMeshMatrix() 呼び出し前`);
            console.log(`    Pos: (${blockData.position.x.toFixed(2)}, ${blockData.position.y.toFixed(2)}, ${blockData.position.z.toFixed(2)})`);
            console.log(`    Rot[0-3]: ${blockData.rotationMatrix.elements.slice(0, 4).map(e => e.toFixed(2)).join(', ')}`);
            console.log(`    tAttr: ${blockData.tAttribute}`);
            console.log(`    fgCube Matrix[12-14] (Before): ${foregroundCube.matrix.elements.slice(12, 15).map(e => e.toFixed(2)).join(', ')}`);

            blockData.updateMeshMatrix(); // ★★★ これが前景キューブの行列も更新するはず

            console.log(`[DEBUG][setRenderMode] Block ID ${blockId}: updateMeshMatrix() 呼び出し後`);
            const finalMatrixElements = foregroundCube.matrix.elements;
            console.log(`    fgCube Matrix[12-14] (After): ${finalMatrixElements.slice(12, 15).map(e => e.toFixed(2)).join(', ')}`);

            // ★ 問題発生箇所の特定用ログ
            const isMatrixIdentity = finalMatrixElements[0] === 1 && finalMatrixElements[5] === 1 && finalMatrixElements[10] === 1 && finalMatrixElements[15] === 1;
            const isAtOrigin = Math.abs(finalMatrixElements[12]) < 1e-3 && Math.abs(finalMatrixElements[13]) < 1e-3 && Math.abs(finalMatrixElements[14]) < 1e-3;
            if (isAtOrigin && !isMatrixIdentity) { // 単位行列でなく原点にある場合
                 console.warn(`[DEBUG][setRenderMode] ★★★ Block ID ${blockId}: 前景キューブの行列位置が原点ですが、単位行列ではありません！ Matrix:`, finalMatrixElements.slice(0, 16));
            } else if (isAtOrigin && isMatrixIdentity) {
                 console.log(`[DEBUG][setRenderMode] Block ID ${blockId}: 前景キューブの行列は単位行列（原点）です。`);
            }

            // 4. シーンに追加
            // console.log(`[DEBUG][setRenderMode] Block ID ${blockId}: 前景キューブをシーンに追加`);
            scene.add(foregroundCube);
            newForegroundCubes.push(foregroundCube);
        });
        foregroundCubes = newForegroundCubes;
        console.log(`[DEBUG][setRenderMode] XML編集モード表示設定完了。 ${foregroundCubes.length} 個の前景キューブを生成。`);

    } else {
        // --- 通常モード表示に戻す ---
        console.log("[DEBUG][setRenderMode] 通常モードへの切り替え処理開始...");
        clearForegroundCubes(scene); // 前景キューブ削除
        loadedBlocks.forEach(blockData => { blockData.foregroundMesh = null; if (blockData.mesh) blockData.mesh.visible = true; });
        renderBlocks(scene, loadedBlocks); // 通常表示に更新
        console.log("[DEBUG][setRenderMode] 通常モードへの切り替え完了。");
    }
}

/**
 * シーンから前景キューブを全て削除し、関連リソースを破棄します。
 * @param {THREE.Scene} scene
 * @private
 */
function clearForegroundCubes(scene) {
    if (foregroundCubes.length > 0) {
        console.log(`[DEBUG][clearForegroundCubes] ${foregroundCubes.length} 個の前景キューブをクリアします。`);
        foregroundCubes.forEach(cube => { scene.remove(cube); if (cube.material?.dispose) cube.material.dispose(); });
        foregroundCubes = [];
    }
}

/**
 * loadedBlocksに含まれなくなった古いメッシュをシーンから削除します。
 * @param {THREE.Scene} scene
 * @param {Set<number>} processedBlockIds - renderBlocksで処理されたBlockDataのIDセット。
 * @private
 */
function clearOrphanMeshes(scene, processedBlockIds) {
     const meshesToRemove = [];
     scene.traverse((o) => { if (o.isMesh && o.userData.isManagedBlockMesh && !o.userData.isForegroundCube && o.userData.blockId !== undefined && !processedBlockIds.has(o.userData.blockId)) meshesToRemove.push(o); });
     if (meshesToRemove.length > 0) {
         console.log(`[DEBUG][clearOrphanMeshes] ${meshesToRemove.length} 個の孤立メッシュを削除します。`);
         meshesToRemove.forEach(mesh => { scene.remove(mesh); if(mesh.material?.dispose && mesh.material !== unknownMaterial) mesh.material.dispose(); /* console.log(`[DEBUG][clearOrphanMeshes] 削除 ID: ${mesh.userData.blockId}`); */ });
     }
 }