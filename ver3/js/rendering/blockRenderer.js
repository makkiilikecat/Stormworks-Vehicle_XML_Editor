/**
 * @fileoverview ブロックデータの3Dレンダリングを担当するモジュール。
 * BlockDataからメッシュを生成・更新し、シーンに表示します。
 * 面ごとの色分けや編集モードに応じた表示切替も管理します。
 *
 * @version 4 (ペイントモード対応 Stage 4.3 Final)
 * @dependency three.js, blockDefinitions.js, proceduralMeshes.js, editMode.js
 */

import * as THREE from 'three';
import { getBlockDefinition } from '../data/blockDefinitions.js'; // ブロック定義取得用
import { getBlockGeometry } from './proceduralMeshes.js';   // ジオメトリ取得用 (グループ情報含む)
import { EditMode } from '../state/editMode.js';             // 編集モード定義

// === マテリアル定義 (ベース) ===
// これらのマテリアルは直接使用せず、クローンして色などを設定します。

/** 通常表示用ブロックのベースマテリアル */
const baseBlockMaterial = new THREE.MeshStandardMaterial({
    color: 0x999999,       // デフォルト色 (灰色)
    roughness: 0.7,
    metalness: 0.2,
    emissive: 0x000000,    // 発光なし
    polygonOffset: false,  // ポリゴンオフセット無効
    name: 'baseBlockMaterial' // デバッグ用名前
});

/** 未対応/不明なブロックタイプ用マテリアル (共有インスタンス) */
const unknownMaterial = new THREE.MeshStandardMaterial({
    map: createCheckerboardTexture(0x1A001A, 0x330033, 16, 2), // チェック模様テクスチャ
    roughness: 0.8,
    metalness: 0.1,
    polygonOffset: false,
    name: 'unknownMaterial'
});

/** XML編集モード時の前景キューブ用ベースマテリアル */
const foregroundCubeMaterialBase = new THREE.MeshStandardMaterial({
    color: 0xffffff,       // 白色
    roughness: 0.6,
    metalness: 0.1,
    emissive: 0x000000,
    polygonOffset: true,         // ポリゴンオフセット有効 (Zファイティング対策)
    polygonOffsetFactor: -1.0,   // 手前に描画するための係数
    polygonOffsetUnits: -4.0,
    name: 'foregroundCubeMaterialBase'
});

/** XML編集モード時の背景ゴースト用ベースマテリアル */
const ghostMaterialBase = new THREE.MeshStandardMaterial({
    transparent: true,     // 半透明有効
    opacity: 0.15,         // 不透明度
    depthWrite: false,     // 深度バッファ書き込み無効 (他のオブジェクトの後ろでも見える)
    emissive: 0x000000,
    polygonOffset: false,
    side: THREE.FrontSide, // 前面のみ描画 (通常)
    name: 'ghostMaterialBase'
});

// === ジオメトリ定義 ===

/** XML編集モード用 前景キューブのジオメトリ (共有インスタンス) */
const foregroundCubeGeometry = new THREE.BoxGeometry(1, 1, 1);

// === 状態管理 ===

/** @type {THREE.Mesh[]} 現在シーンに追加されている前景キューブメッシュのリスト */
let foregroundCubes = [];
/** @type {Map<string, THREE.MeshStandardMaterial>} 通常ブロック用マテリアルのキャッシュ (色コード -> マテリアル) */
const materialCache = new Map();
/** @type {Map<string, THREE.MeshStandardMaterial>} ゴースト用マテリアルのキャッシュ (色コード -> マテリアル) */
const ghostMaterialCache = new Map();

// === ヘルパー関数 ===

/**
 * チェッカーボードテクスチャを生成します。
 * @param {number} [color1=0x000000] - 色1 (16進数)
 * @param {number} [color2=0xffffff] - 色2 (16進数)
 * @param {number} [size=16] - テクスチャのサイズ (ピクセル)
 * @param {number} [checks=2] - 一辺のチェック数
 * @returns {THREE.CanvasTexture} 生成されたテクスチャ
 * @private
 */
function createCheckerboardTexture(color1 = 0x000000, color2 = 0xffffff, size = 16, checks = 2) {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d');
    const c1 = `#${color1.toString(16).padStart(6, '0')}`; // 色コード文字列に変換
    const c2 = `#${color2.toString(16).padStart(6, '0')}`;
    context.fillStyle = c1; context.fillRect(0, 0, size, size); // 背景を色1で塗る
    context.fillStyle = c2; // チェック模様を色2で塗る
    const checkSize = size / checks;
    for (let i = 0; i < checks; i++) {
        for (let j = 0; j < checks; j++) {
            if ((i + j) % 2 === 0) { // 市松模様
                context.fillRect(i * checkSize, j * checkSize, checkSize, checkSize);
            }
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter; // ぼかしなし
    texture.needsUpdate = true;
    return texture;
}

/**
 * 通常表示用マテリアルをキャッシュから取得または生成します。
 * 指定された色コードで baseBlockMaterial をクローンして色を設定します。
 * @param {string | null} colorCode - 色コード (例: "FF0000")。nullの場合はデフォルト色。
 * @returns {THREE.MeshStandardMaterial} マテリアルインスタンス。
 * @private
 */
function getOrCreateMaterial(colorCode) {
    const cacheKey = colorCode ? colorCode.toUpperCase() : 'DEFAULT'; // キー生成 (null/undefinedは'DEFAULT')
    if (!materialCache.has(cacheKey)) {
        const material = baseBlockMaterial.clone(); // ベースマテリアルを複製
        try {
            if (colorCode && cacheKey !== 'DEFAULT') {
                material.color.set(`#${colorCode}`); // 色コードを設定 (#必須)
            } else {
                material.color.copy(baseBlockMaterial.color); // デフォルト色を使用
            }
        } catch (e) {
            console.warn(`[BlockRenderer] 無効な色コード "${colorCode}"。デフォルト色を使用。`, e);
            material.color.copy(baseBlockMaterial.color); // エラー時もデフォルト
        }
        materialCache.set(cacheKey, material); // キャッシュに保存
    }
    return materialCache.get(cacheKey); // キャッシュから返す
}


// === 公開関数 ===

/**
 * 指定されたBlockDataに対応する新しい通常表示用Meshオブジェクトを作成します。
 * ブロック定義からジオメトリを取得し、BlockDataの色情報に基づいてマテリアル
 * (単一または配列) を設定します。
 * @param {BlockData} blockData - メッシュの元となるブロックデータ。
 * @returns {THREE.Mesh} 作成されたメッシュオブジェクト。行列は未設定。
 * @export
 */
export function createBlockMesh(blockData) {
    // ブロック定義とジオメトリを取得
    const definition = getBlockDefinition(blockData.definitionId);
    const geometry = getBlockGeometry(definition.type, definition.size); // 1x1x1 サイズのジオメトリ
    const isUnknown = definition.type === 'unknown_cube';

    let meshMaterial; // メッシュに設定するマテリアル (単一 or 配列)

    if (isUnknown) {
        // 未対応ブロックは専用マテリアルを使用
        meshMaterial = unknownMaterial;
    } else {
        const surfaceColors = blockData.surfaceColors;
        const baseColor = blockData.getBaseColor();
        const numGroups = geometry.groups.length; // ジオメトリの面グループ数
        const numSurfaceColors = surfaceColors ? surfaceColors.length : 0; // sc属性の色数

        // 面ごとの色分けが可能か判断
        if (numGroups > 0 && numSurfaceColors >= numGroups) {
            // ジオメトリにグループ情報があり、surfaceColors の数が十分にある場合
            // -> マテリアル配列を作成
            meshMaterial = geometry.groups.map(group => {
                const scIndex = group.materialIndex; // ジオメトリグループに割り当てられたインデックス
                // scインデックスに対応する色を取得、なければ白('FFFFFF')を使用
                const colorCode = (scIndex !== undefined && scIndex < numSurfaceColors && surfaceColors[scIndex]?.toLowerCase() !== 'x')
                                  ? surfaceColors[scIndex]
                                  : 'FFFFFF'; // 'x' または範囲外は白
                return getOrCreateMaterial(colorCode); // キャッシュからマテリアルを取得/生成
            });
        } else {
            // 面ごとの色分けができない場合 (グループ/色数不足、または定義なし)
            // -> 単一マテリアルを使用 (baseColor優先、なければ最初の表面色、それもなければデフォルト)
            if (numGroups > 0 && numSurfaceColors > 0 && numSurfaceColors < numGroups) {
                 console.warn(`[BlockRenderer] Block ID ${blockData.id}: surfaceColors (${numSurfaceColors}) is less than geometry groups (${numGroups}). Type: ${definition.type}. Using fallback color.`);
            }
            const fallbackColor = baseColor || (numSurfaceColors > 0 && surfaceColors[0]?.toLowerCase() !== 'x' ? surfaceColors[0] : null); // 'x' は除外
            meshMaterial = getOrCreateMaterial(fallbackColor); // nullを渡すとデフォルト色になる
        }
    }

    // メッシュを生成
    const mesh = new THREE.Mesh(geometry, meshMaterial);
    // ユーザーデータ設定 (レンダリング管理用)
    mesh.userData.isManagedBlockMesh = true; // このモジュールで管理するメッシュである印
    mesh.userData.isForegroundCube = false; // 通常メッシュフラグ
    mesh.userData.blockId = blockData.id;   // 対応する BlockData の ID
    mesh.matrixAutoUpdate = false; // 行列は BlockData.updateMeshMatrix で管理
    return mesh;
}

/**
 * シーン内の全ての管理対象ブロックメッシュ（通常メッシュ、前景キューブ）をクリアします。
 * メッシュをシーンから削除し、関連するマテリアルリソースを破棄します（キャッシュされたものは除く）。
 * @param {THREE.Scene} scene - 操作対象のシーン。
 * @export
 */
export function clearBlocks(scene) {
    console.log("[DEBUG][clearBlocks] クリア処理開始...");
    const objectsToRemove = [];
    // シーンを走査し、管理対象のメッシュを収集
    scene.traverse((object) => {
        if (object.isMesh && object.userData.isManagedBlockMesh) {
            objectsToRemove.push(object);
        }
    });

    if (objectsToRemove.length > 0) {
        console.log(`[BlockRenderer] ${objectsToRemove.length} 個の管理対象ブロックメッシュをクリアします。`);
        objectsToRemove.forEach(mesh => {
            scene.remove(mesh); // シーンから削除
            // マテリアルの破棄 (配列の場合も対応)
            // unknownMaterial やキャッシュされたマテリアルは破棄しない
            if (Array.isArray(mesh.material)) {
                // 配列内のマテリアルがキャッシュや共有インスタンスでないか確認が必要
                // 現状の実装では getOrCreateMaterial でキャッシュを返すため、ここでは破棄しない
                // mesh.material.forEach(m => { /* dispose if not cached/shared */ });
            } else if (mesh.material?.dispose && mesh.material !== unknownMaterial) {
                // 単一マテリアルで、unknown でなく、キャッシュにもない場合 (現状ほぼ発生しないはず)
                // if (!materialCache.has(...) && !ghostMaterialCache.has(...)) { mesh.material.dispose(); }
            }
            // ジオメトリはキャッシュしているので破棄しない
            // if (mesh.geometry?.dispose) { mesh.geometry.dispose(); }
        });
        foregroundCubes = []; // 前景キューブリストもクリア
    }
     console.log("[DEBUG][clearBlocks] クリア処理完了。");
}

/**
 * BlockData配列に基づき、通常モード表示用のメッシュを作成または更新します。
 * 既存メッシュがあれば状態を確認し、必要なら再生成またはマテリアルを更新します。
 * @param {THREE.Scene} scene - シーンオブジェクト。
 * @param {BlockData[]} blockDataArray - 表示/更新するブロックデータ配列。
 * @export
 */
export function renderBlocks(scene, blockDataArray) {
    // console.log(`[DEBUG][renderBlocks] 通常モード描画開始 (${blockDataArray.length} blocks)...`);
    clearForegroundCubes(scene); // 既存の前景キューブ削除
    let addedCount = 0; let updatedCount = 0;
    const processedBlockIds = new Set(); // 処理済みブロックIDを記録

    blockDataArray.forEach((blockData) => {
        processedBlockIds.add(blockData.id); // 処理済みとして記録
        let mesh = blockData.mesh; // BlockData が保持しているメッシュ参照
        const definition = getBlockDefinition(blockData.definitionId);
        const geometry = getBlockGeometry(definition.type, definition.size); // 対応するジオメトリ取得
        const isUnknown = definition.type === 'unknown_cube';
        let needsRecreation = false; // メッシュ再生成が必要かどうかのフラグ

        // --- 再生成が必要な条件をチェック ---
        const numGroups = geometry.groups.length;
        const numSurfaceColors = blockData.surfaceColors ? blockData.surfaceColors.length : 0;
        // 面ごとの色分けが必要か？ (unknown でなく、グループがあり、色数も十分あるか)
        const requiresArrayMaterial = !isUnknown && numGroups > 0 && numSurfaceColors >= numGroups;

        if (!mesh ||                                     // メッシュ参照がない
            !scene.getObjectById(mesh.id) ||             // シーンにメッシュが存在しない
            mesh.geometry !== geometry ||                // ジオメトリタイプが変わった
            (mesh.material === unknownMaterial && !isUnknown) || // Unknown -> 通常 に変わった
            (mesh.material !== unknownMaterial && isUnknown) || // 通常 -> Unknown に変わった
            (mesh.material && mesh.material.transparent) || // ゴースト表示から戻った
            (requiresArrayMaterial && !Array.isArray(mesh.material)) || // 配列マテリアルが必要なのに単一
            (!requiresArrayMaterial && Array.isArray(mesh.material)))   // 単一マテリアルが必要なのに配列
        {
            needsRecreation = true;
        }

        if (needsRecreation) {
            // --- メッシュを再生成 ---
            if (mesh) { // 古いメッシュがあれば削除
                scene.remove(mesh);
                // 古いマテリアルの破棄 (キャッシュや共有以外) - clearBlocks と同様の注意点
                if (Array.isArray(mesh.material)) { /* No dispose for cached */ }
                else if(mesh.material?.dispose && mesh.material !== unknownMaterial) { /* No dispose for cached */ }
            }
            mesh = createBlockMesh(blockData); // 新しいメッシュ作成
            scene.add(mesh);                   // シーンに追加
            blockData.mesh = mesh;             // BlockData に新しい参照を設定
            blockData.foregroundMesh = null;   // 前景キューブ参照はクリア
            addedCount++;
        } else {
            // --- 既存メッシュを更新 ---
            if (Array.isArray(mesh.material)) {
                // マテリアル配列の色を更新
                const surfaceColors = blockData.surfaceColors;
                if (surfaceColors && mesh.material.length === numGroups && numSurfaceColors >= numGroups) {
                    geometry.groups.forEach((group, groupIndex) => {
                        const scIndex = group.materialIndex;
                        const colorCode = (scIndex !== undefined && scIndex < numSurfaceColors && surfaceColors[scIndex]?.toLowerCase() !== 'x')
                                          ? surfaceColors[scIndex] : 'FFFFFF';
                        const cachedMat = getOrCreateMaterial(colorCode);
                        // インスタンスが異なれば差し替え (パフォーマンスのため)
                        if (mesh.material[groupIndex] !== cachedMat) {
                            mesh.material[groupIndex] = cachedMat;
                        }
                    });
                    mesh.material.needsUpdate = true; // 配列でも必要か？念のため
                }
            } else if (!isUnknown) {
                // 単一マテリアルの色を更新 (baseColor優先)
                const fallbackColor = blockData.getBaseColor() || (numSurfaceColors > 0 && blockData.surfaceColors[0]?.toLowerCase() !== 'x' ? blockData.surfaceColors[0] : null);
                const newMat = getOrCreateMaterial(fallbackColor);
                if (mesh.material !== newMat) {
                    // 既存マテリアルがキャッシュされていなければ破棄
                    // if (mesh.material?.dispose && !isCached(mesh.material)) mesh.material.dispose();
                    mesh.material = newMat;
                }
            }
            // ハイライトなどで変更された可能性のある Emissive をリセット
            if (!isUnknown && mesh.material) {
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                materials.forEach(mat => {
                    if (mat.emissive) { mat.emissive.setHex(0x000000); mat.emissiveIntensity = 0; }
                });
            }
            updatedCount++;
            blockData.foregroundMesh = null; // 通常モードでは前景参照は不要
        }
        // メッシュの行列は BlockData の状態に基づいて設定
        blockData.updateMeshMatrix();
    });

    // loadedBlocks に含まれない古いメッシュをシーンから削除
    clearOrphanMeshes(scene, processedBlockIds);
    // console.log(`[BlockRenderer] 通常モード表示: ${addedCount} 個追加/再生成, ${updatedCount} 個更新。`);
}


/**
 * レンダリングモードを切り替えます（通常表示 ⇔ XML編集表示）。
 * XML編集モードでは、通常メッシュを半透明ゴーストにし、前景に編集キューブを表示します。
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

        loadedBlocks.forEach((blockData) => {
            // 1. 背景ゴースト設定
            if (blockData.mesh && scene.getObjectById(blockData.mesh.id)) {
                // ゴーストの色を決定 (baseColor or surfaceColors[0] or default)
                let ghostColor = ghostMaterialBase.color.clone();
                const baseColor = blockData.getBaseColor();
                const firstSurfaceColor = blockData.surfaceColors && blockData.surfaceColors.length > 0 ? blockData.surfaceColors[0] : null;
                let colorCode = baseColor || (firstSurfaceColor?.toLowerCase() !== 'x' ? firstSurfaceColor : null);
                if (colorCode) { try { ghostColor.set(`#${colorCode}`); } catch (e) {} }

                // ゴースト用マテリアルをキャッシュから取得/生成
                const ghostMatKey = ghostColor.getHexString();
                let ghostMatInstance = ghostMaterialCache.get(ghostMatKey);
                if (!ghostMatInstance) {
                    ghostMatInstance = ghostMaterialBase.clone();
                    ghostMatInstance.color.copy(ghostColor);
                    ghostMaterialCache.set(ghostMatKey, ghostMatInstance);
                }

                // 既存マテリアルを破棄 (通常メッシュのマテリアル)
                // (キャッシュや共有以外) - renderBlocksと同様の注意点
                if (Array.isArray(blockData.mesh.material)) { /* No dispose for cached */ }
                else if (blockData.mesh.material?.dispose && blockData.mesh.material !== unknownMaterial) { /* No dispose for cached */ }

                blockData.mesh.material = ghostMatInstance; // ゴーストマテリアルを設定
                blockData.mesh.visible = true;              // 可視にする
                blockData.mesh.matrixWorldNeedsUpdate = true;
            } else { /* Warn */ }

            // 2. 前景キューブ作成 (マテリアルはクローン)
            const foregroundMaterialInstance = foregroundCubeMaterialBase.clone();
            const foregroundCube = new THREE.Mesh(foregroundCubeGeometry, foregroundMaterialInstance);
            foregroundCube.userData.isManagedBlockMesh = true; foregroundCube.userData.isForegroundCube = true;
            foregroundCube.userData.blockId = blockData.id;
            foregroundCube.matrixAutoUpdate = false;

            // 3. BlockData に参照を設定 & 行列更新
            blockData.foregroundMesh = foregroundCube; // updateMeshMatrix の前に設定
            blockData.updateMeshMatrix();             // これで前景キューブの行列も設定される

            // 4. シーンに追加
            scene.add(foregroundCube);
            newForegroundCubes.push(foregroundCube);
        });
        foregroundCubes = newForegroundCubes; // 前景キューブリストを更新
        console.log(`[DEBUG][setRenderMode] XML編集モード表示設定完了。 ${foregroundCubes.length} 個の前景キューブを生成。`);

    } else {
        // --- 通常モード表示に戻す ---
        console.log("[DEBUG][setRenderMode] 通常モードへの切り替え処理開始...");
        clearForegroundCubes(scene); // 前景キューブ削除
        loadedBlocks.forEach(blockData => {
            blockData.foregroundMesh = null;   // 前景参照クリア
            if (blockData.mesh) blockData.mesh.visible = true; // 通常メッシュ表示
        });
        // 通常メッシュのマテリアルを元に戻すために renderBlocks を呼び出す
        renderBlocks(scene, loadedBlocks);
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
        // console.log(`[DEBUG][clearForegroundCubes] ${foregroundCubes.length} 個の前景キューブをクリアします。`);
        foregroundCubes.forEach(cube => {
            scene.remove(cube);
            // 前景キューブのマテリアルはクローンなので破棄してOK
            if (cube.material?.dispose) cube.material.dispose();
        });
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
     // isForegroundCube でない (通常) メッシュのみを対象とする
     scene.traverse((o) => {
         if (o.isMesh && o.userData.isManagedBlockMesh && !o.userData.isForegroundCube && o.userData.blockId !== undefined && !processedBlockIds.has(o.userData.blockId)) {
             meshesToRemove.push(o);
         }
     });
     if (meshesToRemove.length > 0) {
         console.log(`[DEBUG][clearOrphanMeshes] ${meshesToRemove.length} 個の孤立メッシュを削除します。`);
         meshesToRemove.forEach(mesh => {
             scene.remove(mesh);
             // マテリアル破棄 (通常メッシュ) - clearBlocks と同様の注意点
             if (Array.isArray(mesh.material)) { /* No dispose for cached */ }
             else if(mesh.material?.dispose && mesh.material !== unknownMaterial) { /* No dispose for cached */ }
         });
     }
 }