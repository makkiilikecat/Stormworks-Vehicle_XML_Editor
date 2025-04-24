/**
 * @fileoverview BlockDataに基づいてブロックの3Dメッシュを生成・管理し、
 * シーンにレンダリング（描画）する責務を持つモジュール。
 * 面ごとの色分け（マルチマテリアル）、不明ブロックの表示、
 * 編集モードに応じた表示切替（通常表示/ゴースト+編集キューブ）を扱います。
 *
 * @version 4.3 (コメント更新)
 * @dependency three.js
 * @dependency ../data/blockDefinitions.js - getBlockDefinition
 * @dependency ./proceduralMeshes.js - getBlockGeometry
 * @dependency ../state/editMode.js - EditMode
 */

import * as THREE from 'three';
import { getBlockDefinition } from '../data/blockDefinitions.js'; // ブロック定義取得
import { getBlockGeometry } from './proceduralMeshes.js';   // ジオメトリ取得 (グループ情報含む)
import { EditMode } from '../state/editMode.js';             // 編集モード定義

// === 定数・ベースマテリアル ===
// 各種マテリアルは、キャッシュやクローン元として使用されます。

/**
 * 通常表示されるブロックメッシュの基本となるマテリアル。
 * 色などは、このマテリアルをクローンして個別に設定されます。
 */
const baseBlockMaterial = new THREE.MeshStandardMaterial({
    color: 0x999999,       // デフォルトの色 (灰色)
    roughness: 0.7,        // 表面の粗さ
    metalness: 0.2,        // 金属感
    emissive: 0x000000,    // 自己発光色 (なし)
    polygonOffset: false,  // ポリゴンオフセット無効
    name: 'baseBlockMaterial' // デバッグ用の名前
});

/**
 * 未定義または不明なブロックタイプに使用される共有マテリアル。
 * 紫系のチェッカーボードテクスチャを適用します。
 */
const unknownMaterial = new THREE.MeshStandardMaterial({
    map: createCheckerboardTexture(0x1A001A, 0x330033, 16, 2), // テクスチャ生成関数を呼び出し
    roughness: 0.8,
    metalness: 0.1,
    polygonOffset: false,
    name: 'unknownMaterial' // デバッグ用の名前
});

/**
 * XML編集モード時に、ブロックの中心に表示される前景キューブの基本マテリアル。
 * ポリゴンオフセットを有効にし、背景ゴーストとのZファイティング（表示のちらつき）を防ぎます。
 */
export const foregroundCubeMaterialBase = new THREE.MeshStandardMaterial({
    color: 0xffffff,       // 色 (白)
    roughness: 0.6,
    metalness: 0.1,
    emissive: 0x000000,    // 自己発光なし
    polygonOffset: true,         // ポリゴンオフセット有効 ★
    polygonOffsetFactor: -1.0,   // オフセット係数 (負の値で手前に描画)
    polygonOffsetUnits: -4.0,    // オフセット単位
    name: 'foregroundCubeMaterialBase' // デバッグ用の名前
});

/**
 * XML編集モード時に、通常メッシュの代わりに表示される半透明ゴーストの基本マテリアル。
 */
export const ghostMaterialBase = new THREE.MeshStandardMaterial({
    transparent: true,     // 半透明を有効化
    opacity: 0.15,         // 不透明度 (低いほど透明)
    depthWrite: false,     // 深度バッファへの書き込み無効 (他のオブジェクトの後ろでも見える)
    emissive: 0x000000,    // 自己発光なし
    polygonOffset: false,  // ポリゴンオフセット不要
    side: THREE.FrontSide, // 通常は前面のみ描画
    name: 'ghostMaterialBase' // デバッグ用の名前
});

// === ジオメトリ定義 ===

/**
 * XML編集モード用 前景キューブのジオメトリ。
 * 全ての編集キューブで共有されるインスタンス。
 */
export const foregroundCubeGeometry = new THREE.BoxGeometry(1, 1, 1);

// === 状態管理用変数 ===

/**
 * 現在シーンに表示されている前景キューブ (XML編集モード用) のメッシュリスト。
 * @type {THREE.Mesh[]}
 */
let foregroundCubes = [];

/**
 * 通常表示用マテリアルのキャッシュ。
 * 同じ色コードのマテリアルの再生成を防ぎ、パフォーマンスを向上させます。
 * キー: 色コード文字列 (例: "FF0000", "DEFAULT")
 * 値: THREE.MeshStandardMaterial インスタンス
 * @type {Map<string, THREE.MeshStandardMaterial>}
 */
const materialCache = new Map();

/**
 * ゴースト表示用マテリアルのキャッシュ。
 * XML編集モードで背景ゴースト表示に使用。
 * キー: 色コード文字列 (例: "C2C3C7")
 * 値: THREE.MeshStandardMaterial インスタンス (半透明)
 * @type {Map<string, THREE.MeshStandardMaterial>}
 */
const ghostMaterialCache = new Map();

// === ヘルパー関数 ===

/**
 * 指定された2色でチェッカーボード（市松模様）のテクスチャを生成します。
 * 不明ブロックのマテリアルなどに使用されます。
 *
 * @param {number} [color1=0x000000] - チェックの色1 (16進数)。
 * @param {number} [color2=0xffffff] - チェックの色2 (16進数)。
 * @param {number} [size=16] - 生成するテクスチャの一辺のピクセル数。
 * @param {number} [checks=2] - 一辺あたりのチェック（マス）の数。
 * @returns {THREE.CanvasTexture} 生成されたCanvasテクスチャ。
 * @private
 */
function createCheckerboardTexture(color1 = 0x000000, color2 = 0xffffff, size = 16, checks = 2) {
    // Canvas要素を作成し、2Dコンテキストを取得
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d');
    // 色をCSS形式 (#RRGGBB) に変換
    const c1 = `#${color1.toString(16).padStart(6, '0')}`;
    const c2 = `#${color2.toString(16).padStart(6, '0')}`;
    // 背景を色1で塗りつぶし
    context.fillStyle = c1; context.fillRect(0, 0, size, size);
    // 色2で市松模様を描画
    context.fillStyle = c2;
    const checkSize = size / checks; // 1マスのサイズ
    for (let i = 0; i < checks; i++) {
        for (let j = 0; j < checks; j++) {
            // (i + j) が偶数になるマスを描画
            if ((i + j) % 2 === 0) {
                context.fillRect(i * checkSize, j * checkSize, checkSize, checkSize);
            }
        }
    }
    // Canvasからテクスチャを生成
    const texture = new THREE.CanvasTexture(canvas);
    // テクスチャの拡大・縮小時にぼかさないように設定 (ピクセル感を出す)
    texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true; // テクスチャ更新フラグ
    return texture;
}

/**
 * 通常表示用のブロックマテリアルをキャッシュから取得、または新規に生成します。
 * 指定された色コードに基づいて `baseBlockMaterial` をクローンし、色を設定します。
 *
 * @param {string | null} colorCode - 設定したい色コード (6桁16進数、大文字推奨、例: "FF0000")。
 * null や無効なコードの場合はデフォルト色 (灰色) になります。
 * @returns {THREE.MeshStandardMaterial} マテリアルインスタンス。
 * @private
 */
export function getOrCreateMaterial(colorCode) {
    // キャッシュキーを生成 (null や undefined は "DEFAULT" とする)
    const cacheKey = colorCode ? colorCode.toUpperCase() : 'DEFAULT';
    // キャッシュに存在しなければ新規作成
    if (!materialCache.has(cacheKey)) {
        const material = baseBlockMaterial.clone(); // ベースマテリアルを複製
        try {
            // 色コードが有効なら色を設定
            if (colorCode && cacheKey !== 'DEFAULT') {
                material.color.set(`#${colorCode}`); // # を付けて設定
            }
            // 色コードが無効または null の場合はデフォルト色 (灰色) が既に設定されている
        } catch (e) {
            // 不正な色コードが渡された場合のエラーハンドリング
            console.warn(`[BlockRenderer] 無効な色コード "${colorCode}"。デフォルト色を使用します。`, e);
            // エラー時もデフォルト色が使われる
        }
        materialCache.set(cacheKey, material); // 生成したマテリアルをキャッシュ
    }
    return materialCache.get(cacheKey); // キャッシュからマテリアルを返す
}


// === 公開関数 ===

/**
 * 指定された BlockData に基づいて、新しい3Dメッシュオブジェクトを作成します。
 * ブロック定義から適切なジオメトリを選択し、BlockData の色情報に基づいて
 * 単一マテリアルまたはマテリアル配列を設定します。
 * 作成されたメッシュの行列は、別途 `blockData.updateMeshMatrix()` で設定する必要があります。
 *
 * @param {BlockData} blockData - メッシュの元となるブロックデータ。
 * @returns {THREE.Mesh | null} 作成されたメッシュオブジェクト。ジオメトリ取得等でエラーが発生した場合は null。
 * @export
 */
export function createBlockMesh(blockData) {
    try {
        // 1. ブロック定義とジオメトリを取得
        const definition = getBlockDefinition(blockData.definitionId);
        // proceduralMeshes モジュールからジオメトリを取得 (キャッシュ利用)
        const geometry = getBlockGeometry(definition.type, definition.size);
        // 不明ブロックかどうかを判定
        const isUnknown = definition.type === 'unknown_cube';

        let meshMaterial; // このメッシュに適用するマテリアル

        // 2. マテリアルを決定
        if (isUnknown) {
            // 不明ブロックの場合は専用マテリアルを使用
            meshMaterial = unknownMaterial;
        } else {
            // 通常ブロックの場合、色情報を取得
            const surfaceColors = blockData.surfaceColors; // 面ごとの色 ["FFFFFF", "FF0000", ...]
            const baseColor = blockData.getBaseColor();    // ベース色 "C2C3C7" など
            // ジオメトリのグループ情報（面ごとのマテリアル割り当て用）
            const numGroups = geometry.groups.length;
            const numSurfaceColors = surfaceColors ? surfaceColors.length : 0;

            // 3. 面ごとの色分け (マルチマテリアル) が可能か判定
            //    - ジオメトリにグループ情報がある (`numGroups > 0`)
            //    - surfaceColors 配列があり、その要素数がグループ数以上 (`numSurfaceColors >= numGroups`)
            const useMultiMaterial = numGroups > 0 && numSurfaceColors >= numGroups;

            if (useMultiMaterial) {
                // --- マルチマテリアル設定 ---
                // ジオメトリの各グループに対応するマテリアルの配列を作成
                meshMaterial = geometry.groups.map(group => {
                    const scIndex = group.materialIndex; // ジオメトリグループに割り当てられたマテリアルインデックス (0-5想定)
                    // 対応する surfaceColors の色を取得。範囲外や "x" の場合は白にフォールバック。
                    const colorCode = (scIndex !== undefined && scIndex < numSurfaceColors && surfaceColors[scIndex]?.toLowerCase() !== 'x')
                                      ? surfaceColors[scIndex]
                                      : DEFAULT_SURFACE_COLOR;
                    // キャッシュからマテリアルを取得/生成
                    return getOrCreateMaterial(colorCode);
                });
            } else {
                // --- 単一マテリアル設定 ---
                // 面ごとの色分けができない場合 (グループがない、色数が足りないなど)
                // 警告表示 (デバッグ用)
                if (numGroups > 0 && numSurfaceColors > 0 && numSurfaceColors < numGroups) {
                     console.warn(`[BlockRenderer] Block ID ${blockData.id}: surfaceColors (${numSurfaceColors}) is less than geometry groups (${numGroups}). Type: ${definition.type}. Using fallback color.`);
                }
                // 適用する色を決定 (優先順位: baseColor -> surfaceColors[0] (x以外) -> デフォルト色)
                const fallbackColor = baseColor || (numSurfaceColors > 0 && surfaceColors[0]?.toLowerCase() !== 'x' ? surfaceColors[0] : null);
                // キャッシュからマテリアルを取得/生成 (fallbackColorがnullならデフォルト色になる)
                meshMaterial = getOrCreateMaterial(fallbackColor);
            }
        }

        // 4. メッシュオブジェクトを生成
        const mesh = new THREE.Mesh(geometry, meshMaterial);

        // 5. ユーザーデータ設定 (後で識別・管理するため)
        mesh.userData.isManagedBlockMesh = true; // このモジュールで管理するメッシュの印
        mesh.userData.isForegroundCube = false; // 通常メッシュであることを示す
        mesh.userData.blockId = blockData.id;   // 対応する BlockData の ID を保持

        // 6. 行列の自動更新は無効化 (BlockData.updateMeshMatrix で管理)
        mesh.matrixAutoUpdate = false;

        return mesh; // 作成したメッシュを返す

    } catch (error) {
        console.error(`[BlockRenderer] createBlockMesh でエラー発生 (Block ID: ${blockData?.id}):`, error);
        return null; // エラー時は null を返す
    }
}

/**
 * シーン内の全ての管理対象ブロックメッシュ（通常メッシュ、前景キューブ）を削除します。
 * ファイルロード時や、状態のリセット時に呼び出されます。
 * マテリアルやジオメトリのキャッシュはクリアしません。
 *
 * @param {THREE.Scene} scene - 操作対象のシーン。
 * @export
 */
export function clearBlocks(scene) {
    // console.log("[BlockRenderer] clearBlocks: 全ての管理対象メッシュをクリアします...");
    const objectsToRemove = [];
    // シーン内の全オブジェクトを走査
    scene.traverse((object) => {
        // isManagedBlockMesh フラグを持つメッシュを収集
        if (object.isMesh && object.userData.isManagedBlockMesh) {
            objectsToRemove.push(object);
        }
    });

    if (objectsToRemove.length > 0) {
        console.log(`[BlockRenderer] ${objectsToRemove.length} 個の管理対象ブロックメッシュを削除します。`);
        objectsToRemove.forEach(mesh => {
            scene.remove(mesh); // シーンから削除
            // メッシュに紐づく BlockData 側の参照もクリアした方が安全かもしれない
            // (現状は呼び出し元で loadedBlocks をクリアしていると想定)

            // --- リソース破棄について ---
            // マテリアル: キャッシュ (materialCache, ghostMaterialCache) または
            //             共有インスタンス (unknownMaterial, foregroundCubeMaterialBase など) を
            //             使用しているため、個別に dispose() しない。
            // ジオメトリ: キャッシュ (geometryCache) または共有インスタンス (foregroundCubeGeometry) を
            //             使用しているため、個別に dispose() しない。
            // アプリケーション終了時にキャッシュや共有インスタンスを破棄する必要がある。
        });
        foregroundCubes = []; // 前景キューブのリストもクリア
    }
    // console.log("[BlockRenderer] clearBlocks: クリア完了。");
}

/**
 * 指定された BlockData 配列に基づいて、通常表示モードの3Dシーンを構築・更新します。
 * 既存のメッシュは再利用・更新し、存在しないものは新規作成、不要なものは削除します。
 * ファイルロード後や、通常モードへの切り替え時に呼び出されます。
 *
 * @param {THREE.Scene} scene - 操作対象のシーン。
 * @param {BlockData[]} blockDataArray - 表示/更新するブロックデータの配列。
 * @export
 */
export function renderBlocks(scene, blockDataArray) {
    // console.log(`[BlockRenderer] renderBlocks: 通常モード描画 (${blockDataArray.length} blocks)...`);
    // 既存の前景キューブがあれば削除 (通常モードでは不要)
    clearForegroundCubes(scene);
    let addedCount = 0; let updatedCount = 0;
    const processedBlockIds = new Set(); // この関数内で処理したブロックIDを記録

    // 各 BlockData についてループ
    blockDataArray.forEach((blockData) => {
        processedBlockIds.add(blockData.id); // 処理済みとしてマーク
        let mesh = blockData.mesh; // BlockData が保持している既存メッシュ参照
        let needsRecreation = false; // メッシュ再生成が必要か？

        // --- 既存メッシュの状態チェックと再生成判定 ---
        if (!mesh || !mesh.parent) {
             // メッシュが存在しない、またはシーンに追加されていない場合 -> 再生成
             needsRecreation = true;
        } else {
            // メッシュが存在する場合、ジオメトリやマテリアルタイプが
            // 現在の BlockData の状態と一致するかチェック
            const definition = getBlockDefinition(blockData.definitionId);
            const expectedGeometry = getBlockGeometry(definition.type, definition.size);
            const isUnknown = definition.type === 'unknown_cube';

            // ジオメトリが異なる場合 -> 再生成
            if (mesh.geometry !== expectedGeometry) needsRecreation = true;
            // Unknown状態が変わった場合 -> 再生成
            if (!needsRecreation && mesh.material === unknownMaterial && !isUnknown) needsRecreation = true;
            if (!needsRecreation && mesh.material !== unknownMaterial && isUnknown) needsRecreation = true;
            // ゴースト表示から通常表示に戻す場合 -> 再生成
            if (!needsRecreation && mesh.material?.transparent === true && !isUnknown) needsRecreation = true;

            // マルチマテリアル必要性が変わった場合 -> 再生成
            const numGroups = expectedGeometry.groups.length;
            const numSurfaceColors = blockData.surfaceColors ? blockData.surfaceColors.length : 0;
            const requiresArrayMaterial = !isUnknown && numGroups > 0 && numSurfaceColors >= numGroups;
            if (!needsRecreation && requiresArrayMaterial && !Array.isArray(mesh.material)) needsRecreation = true;
            if (!needsRecreation && !requiresArrayMaterial && Array.isArray(mesh.material)) needsRecreation = true;
        }

        // --- メッシュの生成または更新 ---
        if (needsRecreation) {
            // --- 再生成 ---
            if (mesh) { // 古いメッシュがあればシーンから削除
                scene.remove(mesh);
                // マテリアル・ジオメトリはキャッシュ前提のため dispose しない
            }
            mesh = createBlockMesh(blockData); // 新しくメッシュを作成
            if (mesh) {
                scene.add(mesh);                   // シーンに追加
                blockData.mesh = mesh;             // BlockData に新しい参照を設定
                addedCount++;
            } else {
                console.error(`[BlockRenderer] renderBlocks: Block ID ${blockData.id} のメッシュ再生成に失敗。`);
                blockData.mesh = null; // 失敗したら参照を null に
            }
            blockData.foregroundMesh = null;   // 通常モードでは前景キューブ参照は不要
        } else if(mesh) {
            // --- 更新 --- (ジオメトリやマテリアルタイプは変更なし)
            const definition = getBlockDefinition(blockData.definitionId);
            const isUnknown = definition.type === 'unknown_cube';
            // マテリアルの色などを更新 (ジオメトリタイプは変わっていない前提)
            if (Array.isArray(mesh.material)) {
                // マルチマテリアルの色更新
                const surfaceColors = blockData.surfaceColors;
                const geometry = mesh.geometry; // 既存のジオメトリを使用
                if (surfaceColors && mesh.material.length === geometry.groups.length && surfaceColors.length >= geometry.groups.length) {
                    geometry.groups.forEach((group, groupIndex) => {
                        const scIndex = group.materialIndex;
                        const colorCode = (scIndex !== undefined && scIndex < surfaceColors.length && surfaceColors[scIndex]?.toLowerCase() !== 'x')
                                          ? surfaceColors[scIndex] : DEFAULT_SURFACE_COLOR;
                        const cachedMat = getOrCreateMaterial(colorCode);
                        // インスタンスが異なる場合のみ差し替え (最適化)
                        if (mesh.material[groupIndex] !== cachedMat) {
                            mesh.material[groupIndex] = cachedMat;
                        }
                    });
                    mesh.material.needsUpdate = true; // マテリアル配列全体の更新フラグ (念のため)
                }
            } else if (!isUnknown) {
                // 単一マテリアルの色更新 (baseColor優先)
                const numSurfaceColors = blockData.surfaceColors ? blockData.surfaceColors.length : 0;
                const baseColor = blockData.getBaseColor();
                const fallbackColor = baseColor || (numSurfaceColors > 0 && blockData.surfaceColors[0]?.toLowerCase() !== 'x' ? blockData.surfaceColors[0] : null);
                const newMat = getOrCreateMaterial(fallbackColor);
                if (mesh.material !== newMat) {
                    // 既存マテリアルの破棄はキャッシュ考慮のため行わない
                    mesh.material = newMat;
                }
                // ハイライト等で変更された可能性のある発光をリセット
                 if (mesh.material.emissive) { mesh.material.emissive.setHex(0x000000); mesh.material.emissiveIntensity = 0; }
            }
            updatedCount++;
            blockData.foregroundMesh = null; // 通常モードでは前景参照クリア
        }

        // 最後にメッシュの行列 (位置・回転) を BlockData の状態に合わせて更新
        if (blockData.mesh) { // メッシュが正常に存在する場合のみ
             blockData.updateMeshMatrix();
        }
    });

    // 処理されなかった (loadedBlocks に含まれない) 古いメッシュをシーンから削除
    clearOrphanMeshes(scene, processedBlockIds);
    // console.log(`[BlockRenderer] renderBlocks 完了: ${addedCount} 追加/再生成, ${updatedCount} 更新。`);
}


/**
 * レンダリングモードを切り替えます（通常表示 ⇔ XML編集表示）。
 * XML編集モードでは、通常メッシュを半透明ゴーストにし、前景に編集キューブを表示します。
 *
 * 【最適化案】 現在の実装はモード切替時にブロックをイテレートし、マテリアル差し替えや
 * 前景キューブの生成/削除を行っています。将来的には、前景キューブをBlockDataに
 * 保持し、マテリアルも通常用とゴースト用を保持しておき、モード切替時には
 * `visible` プロパティと `material` プロパティの差し替えだけで済むように
 * リファクタリングすることで、より軽量化できます。
 *
 * @param {EditMode} mode - 新しい編集モード。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列。
 * @param {THREE.Scene} scene - シーンオブジェクト。
 * @export
 */
export function setRenderMode(mode, loadedBlocks, scene) {
    console.log(`[BlockRenderer] setRenderMode: ${mode} モードに切り替え中...`);

    if (mode === EditMode.XML_EDIT) {
        // --- XML編集モード表示に切り替え ---
        clearForegroundCubes(scene); // 既存の前景キューブがあれば削除
        const newForegroundCubes = []; // 新しく作成/表示する前景キューブリスト

        loadedBlocks.forEach((blockData) => {
            // 1. 背景ゴースト設定: 通常メッシュのマテリアルをゴースト用に変更
            if (blockData.mesh && blockData.mesh.parent) { // 通常メッシュがシーンに存在するか確認
                // ゴースト色を決定 (bc -> sc[0] -> デフォルト灰)
                let ghostColorHex = baseBlockMaterial.color.getHexString(); // デフォルト色
                const baseColor = blockData.getBaseColor();
                const firstSurfaceColor = blockData.surfaceColors?.[0];
                const colorCode = baseColor || (firstSurfaceColor?.toLowerCase() !== 'x' ? firstSurfaceColor : null);
                if (colorCode) { try { ghostColorHex = new THREE.Color(`#${colorCode}`).getHexString(); } catch(e){} }

                // ゴースト用マテリアルをキャッシュから取得/生成
                let ghostMatInstance = ghostMaterialCache.get(ghostColorHex);
                if (!ghostMatInstance) {
                    ghostMatInstance = ghostMaterialBase.clone();
                    ghostMatInstance.color.set(`#${ghostColorHex}`);
                    ghostMaterialCache.set(ghostColorHex, ghostMatInstance);
                }
                // 通常メッシュのマテリアルをゴースト用に差し替え
                blockData.mesh.material = ghostMatInstance;
                blockData.mesh.visible = true; // 念のため可視化
            } else {
                // console.warn(`[BlockRenderer] Block ID ${blockData.id}: 通常メッシュが見つからないためゴースト化スキップ。`);
            }

            // 2. 前景キューブ生成・設定
            //    (最適化案: 既存の foregroundMesh を再利用・表示する)
            const foregroundMaterialInstance = foregroundCubeMaterialBase.clone();
            const foregroundCube = new THREE.Mesh(foregroundCubeGeometry, foregroundMaterialInstance);
            foregroundCube.userData.isManagedBlockMesh = true;
            foregroundCube.userData.isForegroundCube = true; // 前景キューブである印
            foregroundCube.userData.blockId = blockData.id;
            foregroundCube.matrixAutoUpdate = false;

            // BlockData に参照を設定 (updateMeshMatrix で使用される)
            blockData.foregroundMesh = foregroundCube;
            blockData.updateMeshMatrix(); // これで前景キューブの位置・向きも設定される

            // シーンに追加
            scene.add(foregroundCube);
            newForegroundCubes.push(foregroundCube); // リストに追加
        });
        foregroundCubes = newForegroundCubes; // 管理リストを更新
        console.log(`[BlockRenderer] XML編集モード表示に切り替え完了。 ${foregroundCubes.length} 個の前景キューブを表示。`);

    } else {
        // --- 通常モード表示に戻す ---
        console.log("[BlockRenderer] 通常モード表示への切り替え中...");
        // 1. 前景キューブを削除
        clearForegroundCubes(scene);
        // 2. BlockData側の参照もクリアし、通常メッシュを可視化
        loadedBlocks.forEach(blockData => {
            blockData.foregroundMesh = null; // 前景参照をクリア
            if (blockData.mesh) {
                blockData.mesh.visible = true; // 通常メッシュを表示
            }
        });
        // 3. 通常メッシュのマテリアルを元に戻すために renderBlocks を呼び出す
        //    (最適化案: ここでマテリアルを差し替えるだけで済ませる)
        renderBlocks(scene, loadedBlocks);
        console.log("[BlockRenderer] 通常モード表示に切り替え完了。");
    }
}

/**
 * シーンから全ての前景キューブを削除し、関連リソース (クローンしたマテリアル) を破棄します。
 * `foregroundCubes` リストもクリアします。
 * @param {THREE.Scene} scene - 操作対象のシーン。
 * @private
 */
function clearForegroundCubes(scene) {
    if (foregroundCubes.length > 0) {
        // console.log(`[BlockRenderer] ${foregroundCubes.length} 個の前景キューブをクリアします。`);
        foregroundCubes.forEach(cube => {
            scene.remove(cube); // シーンから削除
            // 前景キューブのマテリアルはクローンなので、ここで破棄してOK
            if (cube.material?.dispose) {
                cube.material.dispose();
            }
            // ジオメトリは共有インスタンスなので破棄しない
        });
        foregroundCubes = []; // リストを空にする
    }
}

/**
 * シーン内に存在するが、現在の `loadedBlocks` (のIDセット) には
 * 含まれていない「孤立した」通常メッシュを検索し、シーンから削除します。
 * `renderBlocks` の最後に呼び出され、不要になったメッシュをクリーンアップします。
 * @param {THREE.Scene} scene - 操作対象のシーン。
 * @param {Set<number>} processedBlockIds - `renderBlocks` で処理された有効なブロックIDのセット。
 * @private
 */
function clearOrphanMeshes(scene, processedBlockIds) {
     const meshesToRemove = [];
     // シーンを走査し、前景キューブでなく、かつ processedBlockIds に含まれない管理対象メッシュを探す
     scene.traverse((object) => {
         if (object.isMesh &&
             object.userData.isManagedBlockMesh &&
             !object.userData.isForegroundCube && // 前景キューブは除外
             object.userData.blockId !== undefined &&
             !processedBlockIds.has(object.userData.blockId)) // 有効なIDセットに含まれていない
         {
             meshesToRemove.push(object);
         }
     });

     // 削除対象が見つかった場合
     if (meshesToRemove.length > 0) {
         console.log(`[BlockRenderer] ${meshesToRemove.length} 個の孤立した通常メッシュを削除します。`);
         meshesToRemove.forEach(mesh => {
             scene.remove(mesh);
             // マテリアル・ジオメトリはキャッシュ等を使っているので dispose しない
         });
     }
 }