/**
 * @fileoverview ブロックデータの3Dレンダリングを担当するモジュール。
 * ブロック定義に基づいて適切なジオメトリとマテリアルを選択し、
 * シーン内にメッシュとして表示します。
 * また、編集モードに応じて表示方法（通常、ゴースト+前景キューブ）を切り替えます。
 *
 * 【主な変更点 v4 (ペイントモード対応 Stage 1.4)】
 * - createBlockMeshで BlockData の baseColor または surfaceColors[0] を
 * メッシュの基本色として適用するように修正 (暫定対応)。
 * - setRenderMode のゴースト表示でも同様の色を適用するように修正。
 * - 面ごとの色分けは未実装 (Phase 4.3 で対応予定)。
 */

import * as THREE from 'three';
import { getBlockDefinition } from '../data/blockDefinitions.js'; // ブロック定義情報取得
import { getBlockGeometry } from './proceduralMeshes.js';   // プロシージャルジオメトリ取得
import { EditMode } from '../state/editMode.js';             // 編集モードEnum
// BlockData クラスは直接使わないが、関連処理を理解するためにコメントアウトで残す
// import { BlockData } from '../data/blockData.js';

// === マテリアル定義 ===
const baseBlockMaterial = new THREE.MeshStandardMaterial({
    color: 0x999999, roughness: 0.7, metalness: 0.2, emissive: 0x000000,
    polygonOffset: false, name: 'baseBlockMaterial'
});
const unknownMaterial = new THREE.MeshStandardMaterial({
    map: createCheckerboardTexture(0x1A001A, 0x330033, 16, 2), roughness: 0.8, metalness: 0.1,
    polygonOffset: false, name: 'unknownMaterial'
});
const foregroundCubeMaterialBase = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.6, metalness: 0.1, emissive: 0x000000,
    polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -4.0,
    name: 'foregroundCubeMaterialBase'
});
const ghostMaterialBase = new THREE.MeshStandardMaterial({
    transparent: true, opacity: 0.15, depthWrite: false, emissive: 0x000000,
    polygonOffset: false, side: THREE.FrontSide, name: 'ghostMaterialBase'
});

// === ジオメトリ定義 ===
const foregroundCubeGeometry = new THREE.BoxGeometry(1, 1, 1);

// === 状態 ===
let foregroundCubes = [];

// === ヘルパー関数 ===
/** @private */
function createCheckerboardTexture(color1 = 0x000000, color2 = 0xffffff, size = 16, checks = 2) {
    // (変更なし)
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
 * ★修正: BlockDataの色情報 (baseColor または surfaceColors[0]) を適用します。
 * @param {BlockData} blockData - メッシュの元となるブロックデータ。
 * @returns {THREE.Mesh} 作成されたメッシュオブジェクト。行列は未設定。
 * @export
 */
export function createBlockMesh(blockData) {
    const definition = getBlockDefinition(blockData.definitionId);
    const geometry = getBlockGeometry(definition.type, definition.size);
    const isUnknown = definition.type === 'unknown_cube';

    let materialInstance;
    if (isUnknown) {
        materialInstance = unknownMaterial;
    } else {
        // ★修正: 色を適用
        materialInstance = baseBlockMaterial.clone();
        const baseColor = blockData.getBaseColor();
        const firstSurfaceColor = blockData.surfaceColors && blockData.surfaceColors.length > 0 ? blockData.surfaceColors[0] : null;

        let colorCode = null;
        if (baseColor) {
            colorCode = baseColor;
        } else if (firstSurfaceColor && firstSurfaceColor.toLowerCase() !== 'x') {
            colorCode = firstSurfaceColor;
        }

        if (colorCode) {
            try {
                materialInstance.color.set(`#${colorCode}`); // # を付けて CSS 形式の16進数としてパース
            } catch (e) {
                console.warn(`[BlockRenderer] 無効な色コード "${colorCode}" for Block ID ${blockData.id}. デフォルト色を使用します。`, e);
                materialInstance.color.copy(baseBlockMaterial.color); // エラー時はデフォルト色
            }
        } else {
            // 色情報がない場合もデフォルト色
            materialInstance.color.copy(baseBlockMaterial.color);
        }
        // console.log(`[BlockRenderer] Block ID ${blockData.id} material color set to: #${materialInstance.color.getHexString()}`);
    }

    const mesh = new THREE.Mesh(geometry, materialInstance);
    mesh.userData.isManagedBlockMesh = true; mesh.userData.isForegroundCube = false;
    mesh.userData.blockId = blockData.id;
    mesh.matrixAutoUpdate = false;
    return mesh;
}

// === 公開関数 ===

/**
 * シーン内の全ての管理対象ブロックメッシュ（前景・背景問わず）をクリアします。
 * @param {THREE.Scene} scene - 操作対象のシーン。
 * @export
 */
export function clearBlocks(scene) {
    // (変更なし)
    console.log("[DEBUG][clearBlocks] クリア処理開始...");
    const objectsToRemove = [];
    scene.traverse((object) => { if (object.isMesh && object.userData.isManagedBlockMesh) { objectsToRemove.push(object); } });
    if (objectsToRemove.length > 0) {
        console.log(`[BlockRenderer] ${objectsToRemove.length} 個の管理対象ブロックメッシュをクリアします。`);
        objectsToRemove.forEach(mesh => {
            scene.remove(mesh);
            if (mesh.material?.dispose) {
                // unknownMaterial は共有なので破棄しない、他はクローンなので破棄してOK
                if (mesh.material !== unknownMaterial) {
                    mesh.material.dispose();
                }
            } else if (Array.isArray(mesh.material)) { mesh.material.forEach(m => { if (m?.dispose) m.dispose(); }); }
        });
        foregroundCubes = [];
    }
     console.log("[DEBUG][clearBlocks] クリア処理完了。");
}

/**
 * BlockData配列に基づき、通常モード表示用のメッシュを作成または更新します。
 * 各メッシュの行列は `blockData.updateMeshMatrix()` で設定されます。
 * @param {THREE.Scene} scene - シーンオブジェクト。
 * @param {BlockData[]} blockDataArray - 表示/更新するブロックデータ配列。
 * @export
 */
export function renderBlocks(scene, blockDataArray) {
    // (変更なし、createBlockMesh の修正により色反映は自動で行われる)
    console.log(`[DEBUG][renderBlocks] 通常モード描画開始 (${blockDataArray.length} blocks)...`);
    clearForegroundCubes(scene);
    let addedCount = 0; let updatedCount = 0;
    const processedBlockIds = new Set();

    blockDataArray.forEach((blockData, index) => {
        processedBlockIds.add(blockData.id);
        let mesh = blockData.mesh;
        const definition = getBlockDefinition(blockData.definitionId);
        const geometry = getBlockGeometry(definition.type, definition.size);
        const isUnknown = definition.type === 'unknown_cube';
        let needsRecreation = false;

        if (!mesh || !scene.getObjectById(mesh.id) || mesh.geometry !== geometry ||
            (mesh.material === unknownMaterial && !isUnknown) ||
            (mesh.material !== unknownMaterial && isUnknown) ||
            mesh.material.transparent) { // ゴースト化されていたら再生成
            needsRecreation = true;
        }

        if (needsRecreation) {
            if (mesh) { scene.remove(mesh); if (mesh.material?.dispose && mesh.material !== unknownMaterial) { mesh.material.dispose(); } }
            mesh = createBlockMesh(blockData); // ★ 修正された createBlockMesh を使用
            scene.add(mesh);
            blockData.mesh = mesh; blockData.foregroundMesh = null;
            addedCount++;
        } else {
            // 既存メッシュの場合、色が変更されている可能性があるので再適用
            if (!isUnknown) {
                 const baseColor = blockData.getBaseColor();
                 const firstSurfaceColor = blockData.surfaceColors && blockData.surfaceColors.length > 0 ? blockData.surfaceColors[0] : null;
                 let colorCode = baseColor || (firstSurfaceColor?.toLowerCase() !== 'x' ? firstSurfaceColor : null);
                 try {
                     if (colorCode) mesh.material.color.set(`#${colorCode}`);
                     else mesh.material.color.copy(baseBlockMaterial.color); // 色情報なければデフォルト
                 } catch(e) { mesh.material.color.copy(baseBlockMaterial.color); } // エラー時もデフォルト
            }
            // 他のプロパティは維持される想定
            updatedCount++;
            if (!isUnknown && mesh.material?.emissive) { mesh.material.emissive.setHex(baseBlockMaterial.emissive.getHex()); mesh.material.emissiveIntensity = baseBlockMaterial.emissiveIntensity || 0; }
            blockData.foregroundMesh = null;
        }
        blockData.updateMeshMatrix();
    });

    clearOrphanMeshes(scene, processedBlockIds);
    console.log(`[BlockRenderer] 通常モード表示: ${addedCount} 個追加/再生成, ${updatedCount} 個更新。`);
}


/**
 * レンダリングモードを切り替えます（通常表示 ⇔ XML編集表示）。
 * ★修正: ゴーストマテリアルの色も BlockData の色情報を反映するように変更。
 * @param {EditMode} mode - 新しい編集モード。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列。
 * @param {THREE.Scene} scene - シーンオブジェクト。
 * @export
 */
export function setRenderMode(mode, loadedBlocks, scene) {
    console.log(`[DEBUG][setRenderMode] モード切替開始: TargetMode=${mode}`);

    if (mode === EditMode.XML_EDIT) {
        clearForegroundCubes(scene);
        const newForegroundCubes = [];
        console.log(`[DEBUG][setRenderMode] ${loadedBlocks.length} 個のブロックをXML編集モードで表示開始...`);

        loadedBlocks.forEach((blockData) => {
            // --- 背景ゴースト設定 ---
            if (blockData.mesh && scene.getObjectById(blockData.mesh.id)) {
                // ★修正: ゴーストの色も適用
                let ghostColor = ghostMaterialBase.color; // デフォルトはghostMaterialBaseの色
                const baseColor = blockData.getBaseColor();
                const firstSurfaceColor = blockData.surfaceColors && blockData.surfaceColors.length > 0 ? blockData.surfaceColors[0] : null;
                let colorCode = baseColor || (firstSurfaceColor?.toLowerCase() !== 'x' ? firstSurfaceColor : null);

                if (colorCode) {
                    try {
                        ghostColor = new THREE.Color(`#${colorCode}`);
                    } catch (e) { /* エラー時はデフォルトのまま */ }
                }

                const ghostMatInstance = ghostMaterialBase.clone();
                ghostMatInstance.color.copy(ghostColor); // 計算した色を適用
                if (blockData.mesh.material?.dispose && blockData.mesh.material !== unknownMaterial) { blockData.mesh.material.dispose(); }
                blockData.mesh.material = ghostMatInstance;
                blockData.mesh.visible = true;
                blockData.mesh.matrixWorldNeedsUpdate = true;
            } else { console.warn(`[BlockRenderer][setRenderMode] Block ID ${blockData.id}: 通常メッシュが見つからず背景ゴースト設定不可`); }

            // --- 前景キューブ作成 ---
            const foregroundMaterialInstance = foregroundCubeMaterialBase.clone();
            const foregroundCube = new THREE.Mesh(foregroundCubeGeometry, foregroundMaterialInstance);
            foregroundCube.userData.isManagedBlockMesh = true; foregroundCube.userData.isForegroundCube = true;
            foregroundCube.userData.blockId = blockData.id;
            foregroundCube.matrixAutoUpdate = false;

            blockData.foregroundMesh = foregroundCube; // ★ updateMeshMatrix の前に参照を設定
            blockData.updateMeshMatrix(); // ★ 行列更新

            scene.add(foregroundCube);
            newForegroundCubes.push(foregroundCube);
        });
        foregroundCubes = newForegroundCubes;
        console.log(`[DEBUG][setRenderMode] XML編集モード表示設定完了。 ${foregroundCubes.length} 個の前景キューブを生成。`);

    } else {
        // --- 通常モード表示に戻す ---
        console.log("[DEBUG][setRenderMode] 通常モードへの切り替え処理開始...");
        clearForegroundCubes(scene);
        loadedBlocks.forEach(blockData => { blockData.foregroundMesh = null; if (blockData.mesh) blockData.mesh.visible = true; });
        renderBlocks(scene, loadedBlocks); // 通常表示に更新 (ここで通常マテリアルに戻る)
        console.log("[DEBUG][setRenderMode] 通常モードへの切り替え完了。");
    }
}

/** @private */
function clearForegroundCubes(scene) {
    // (変更なし)
    if (foregroundCubes.length > 0) {
        console.log(`[DEBUG][clearForegroundCubes] ${foregroundCubes.length} 個の前景キューブをクリアします。`);
        foregroundCubes.forEach(cube => { scene.remove(cube); if (cube.material?.dispose) cube.material.dispose(); });
        foregroundCubes = [];
    }
}

/** @private */
function clearOrphanMeshes(scene, processedBlockIds) {
     // (変更なし)
     const meshesToRemove = [];
     scene.traverse((o) => { if (o.isMesh && o.userData.isManagedBlockMesh && !o.userData.isForegroundCube && o.userData.blockId !== undefined && !processedBlockIds.has(o.userData.blockId)) meshesToRemove.push(o); });
     if (meshesToRemove.length > 0) {
         console.log(`[DEBUG][clearOrphanMeshes] ${meshesToRemove.length} 個の孤立メッシュを削除します。`);
         meshesToRemove.forEach(mesh => { scene.remove(mesh); if(mesh.material?.dispose && mesh.material !== unknownMaterial) mesh.material.dispose(); });
     }
 }