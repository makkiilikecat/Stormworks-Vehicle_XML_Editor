/**
 * @fileoverview ブロックデータの3Dレンダリングを担当するモジュール。
 * プロシージャルジオメトリの生成、マテリアル管理、モードに応じた表示切替を行う。
 */

import * as THREE from 'three';
import { getBlockDefinition } from '../data/blockDefinitions.js'; // ブロック定義情報
import { getBlockGeometry } from './proceduralMeshes.js';   // ジオメトリ取得関数
import { EditMode } from '../state/editMode.js';             // 編集モード定義

// === マテリアル定義 ===

// 通常表示用のベースマテリアル (各ブロックでクローンして使用)
const baseBlockMaterial = new THREE.MeshStandardMaterial({
    color: 0x999999,        // デフォルト色: 明るい灰色
    roughness: 0.7,         // 表面の粗さ
    metalness: 0.2,         // 金属感
    emissive: 0x000000,     // 発光色 (ハイライト用、通常は黒)
    emissiveIntensity: 1.0, // 発光強度
    polygonOffset: false,   // ポリゴンオフセット (通常は不要)
    polygonOffsetFactor: 0,
    polygonOffsetUnits: 0,
    name: 'baseBlockMaterial' // デバッグ用名前
});

// 未対応ブロック用の共有マテリアル (黒と紫のチェック模様)
const unknownMaterial = new THREE.MeshStandardMaterial({
    map: createCheckerboardTexture(0x1A001A, 0x330033, 16, 2), // テクスチャ生成
    roughness: 0.8,
    metalness: 0.1,
    emissive: 0x000000,
    polygonOffset: false,
    name: 'unknownMaterial'
});

// XML編集モード用: 前景キューブの "ベース" マテリアル (クローン元)
// ★修正: 共有せずクローンして使うため、ベースとして定義
const foregroundCubeMaterialBase = new THREE.MeshStandardMaterial({
    color: 0xffffff,        // 色: 白 (視認性のため)
    roughness: 0.6,
    metalness: 0.1,
    emissive: 0x000000,     // ハイライト用にemissiveは使う
    polygonOffset: true,    // Z-fighting対策でオフセット有効
    polygonOffsetFactor: -1.0, // 手前に描画されやすくするファクター
    polygonOffsetUnits: -4.0,  // 手前に描画されやすくする固定値
    name: 'foregroundCubeMaterialBase' // 名前変更
});

// XML編集モード用: 背景ゴーストのベースマテリアル (クローンして色を設定)
const ghostMaterialBase = new THREE.MeshStandardMaterial({
    transparent: true,      // 半透明有効
    opacity: 0.15,          // 不透明度 (低め)
    depthWrite: false,      // 深度バッファへの書き込み無効 (描画順の問題軽減)
    emissive: 0x000000,     // ゴーストは発光しない
    polygonOffset: false,   // オフセットは前景で行う
    side: THREE.FrontSide, // 裏面は描画しない (パフォーマンスのため、必要ならDoubleSide)
    name: 'ghostMaterialBase'
});

// === ジオメトリ定義 ===

// XML編集モード用: 前景キューブの共有ジオメトリ (1x1x1)
const foregroundCubeGeometry = new THREE.BoxGeometry(1, 1, 1);

// === 状態 ===

// 現在シーンに追加されている前景キューブメッシュのリスト
let foregroundCubes = [];

// === ヘルパー関数 ===

/**
 * チェッカーボードテクスチャを生成します。
 * @param {number} color1 - 色1 (16進数)
 * @param {number} color2 - 色2 (16進数)
 * @param {number} [size=16] - テクスチャ解像度 (ピクセル)
 * @param {number} [checks=2] - 1辺あたりのチェック数
 * @returns {THREE.CanvasTexture}
 * @private
 */
function createCheckerboardTexture(color1 = 0x000000, color2 = 0xffffff, size = 16, checks = 2) {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d');
    const c1 = `#${color1.toString(16).padStart(6, '0')}`;
    const c2 = `#${color2.toString(16).padStart(6, '0')}`;
    context.fillStyle = c1;
    context.fillRect(0, 0, size, size);
    context.fillStyle = c2;
    const checkSize = size / checks;
    for (let i = 0; i < checks; i++) {
        for (let j = 0; j < checks; j++) {
            if ((i + j) % 2 === 0) {
                context.fillRect(i * checkSize, j * checkSize, checkSize, checkSize);
            }
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter; // ピクセル感を出すため最近傍フィルタ
    texture.needsUpdate = true;
    return texture;
}

/**
 * 指定されたBlockDataに対応する新しいMeshオブジェクトを作成します。
 * マテリアルはクローンされ、ジオメトリはキャッシュから取得されます。
 * @param {BlockData} blockData - 作成するメッシュの元となるブロックデータ。
 * @returns {THREE.Mesh} 作成されたメッシュオブジェクト。
 */
export function createBlockMesh(blockData) {
    let geometry;
    let materialInstance;

    const definition = getBlockDefinition(blockData.definitionId, null);
    // 実サイズモデルのジオメトリを取得
    geometry = getBlockGeometry(definition.type, definition.size);

    // マテリアル選択
    if (definition.type === 'unknown_cube') {
        materialInstance = unknownMaterial; // 未対応は共有マテリアル
    } else {
        materialInstance = baseBlockMaterial.clone(); // 通常はベースマテリアルをクローン
        // クローン時にハイライト状態 (emissive) はリセットされているはず
    }

    const mesh = new THREE.Mesh(geometry, materialInstance);
    // 識別用ユーザーデータ設定
    mesh.userData.isManagedBlockMesh = true; // このレンダラーが管理するメッシュ
    mesh.userData.isForegroundCube = false;  // これは通常表示用メッシュ
    mesh.userData.blockId = blockData.id;   // 対応するBlockDataのID
    mesh.matrixAutoUpdate = false; // 行列は手動で管理
    return mesh;
}

// === 公開関数 ===

/**
 * シーン内の全ての管理対象ブロックメッシュ（前景・背景問わず）をクリアします。
 * 関連付けられたマテリアルも破棄します（共有マテリアルを除く）。
 * @param {THREE.Scene} scene - 操作対象のシーン。
 */
export function clearBlocks(scene) {
    const objectsToRemove = [];
    // シーンを走査し、管理対象のメッシュ（通常 or 前景）をリストアップ
    scene.traverse((object) => {
        if (object.isMesh && object.userData.isManagedBlockMesh) {
            objectsToRemove.push(object);
        }
    });

    if (objectsToRemove.length > 0) {
        console.log(`[BlockRenderer] ${objectsToRemove.length} 個の管理対象ブロックメッシュをクリアします。`);
        objectsToRemove.forEach(mesh => {
            scene.remove(mesh); // シーンから削除

            // マテリアルの破棄 (クローンされたもののみ)
            if (mesh.material && typeof mesh.material.dispose === 'function') {
                // 共有マテリアルでないことを確認してから破棄
                if (mesh.material !== unknownMaterial && mesh.material.name !== foregroundCubeMaterialBase.name && mesh.material.name !== ghostMaterialBase.name) {
                    // console.log(`[BlockRenderer] マテリアルを破棄: ${mesh.material.name || mesh.material.uuid}`);
                    mesh.material.dispose();
                }
            } else if (Array.isArray(mesh.material)) {
                // マテリアルが配列の場合 (通常はないはずだが念のため)
                mesh.material.forEach(m => { if (m && m.dispose) m.dispose(); });
            }
            // ジオメトリはキャッシュ管理なのでここでは破棄しない
        });
        foregroundCubes = []; // 前景キューブリストもクリア
    }
}

/**
 * BlockData配列に基づき、通常モード表示用のメッシュを作成または更新します。
 * @param {THREE.Scene} scene - シーンオブジェクト。
 * @param {BlockData[]} blockDataArray - 表示/更新するブロックデータ配列。
 */
export function renderBlocks(scene, blockDataArray) {
    console.log(`[BlockRenderer] 通常モードで ${blockDataArray.length} 個のブロックをレンダリング/更新します...`);
    // 既存の前景キューブがあれば削除（モード切替忘れ対策）
    clearForegroundCubes(scene);

    let addedCount = 0;
    let updatedCount = 0;
    const processedBlockIds = new Set(); // 処理済みのブロックIDを記録

    blockDataArray.forEach(blockData => {
        processedBlockIds.add(blockData.id); // 処理済みとしてマーク
        let mesh = blockData.mesh; // BlockDataに紐づく既存メッシュ参照 (実サイズモデルのはず)

        // ブロック定義とジオメトリを取得
        const definition = getBlockDefinition(blockData.definitionId, null);
        const geometry = getBlockGeometry(definition.type, definition.size);

        // ターゲットとなるマテリアル（未対応か通常か）
        const isUnknown = definition.type === 'unknown_cube';
        const targetMaterialBase = isUnknown ? unknownMaterial : baseBlockMaterial;

        // メッシュが存在しない、シーンにない、ジオメトリが変わった、
        // またはマテリアルの種類が変わった (例: ゴーストから通常へ) 場合にメッシュを再生成
        if (
            !mesh ||
            !scene.getObjectById(mesh.id) || // シーンに存在しない
            mesh.geometry !== geometry || // ジオメトリが異なる
            (mesh.material !== unknownMaterial && isUnknown) || // 通常→未対応
            (mesh.material === unknownMaterial && !isUnknown) || // 未対応→通常
            mesh.material.transparent // ゴースト状態だった場合
        ) {
            if (mesh) { // 古いメッシュがあればシーンから削除
                scene.remove(mesh);
                // 古いマテリアルの破棄 (clearBlocksで行う想定だが念のため)
                if (mesh.material && typeof mesh.material.dispose === 'function' && mesh.material !== unknownMaterial) {
                    mesh.material.dispose();
                }
            }
            // メッシュを新規作成 (createBlockMeshを使用)
            mesh = createBlockMesh(blockData); // ここでマテリアルはクローンされる(or unknownMaterial)
            scene.add(mesh);
            blockData.mesh = mesh; // BlockDataに新しいメッシュ参照を保持
            blockData.foregroundMesh = null; // 通常モードなので前景参照はクリア
            addedCount++;
        } else {
            // 既存メッシュを更新する場合
            updatedCount++;
            // ハイライトリセット (念のため)
            if (!isUnknown && mesh.material?.emissive) {
                 mesh.material.emissive.setHex(baseBlockMaterial.emissive.getHex());
                 mesh.material.emissiveIntensity = baseBlockMaterial.emissiveIntensity || 0;
            }
            // 前景参照はクリアしておく
            blockData.foregroundMesh = null;
        }

        // メッシュのワールド行列を計算して設定
        const offset = definition.offset || [0, 0, 0]; // ブロック定義からのオフセット
        const _translatePos = new THREE.Matrix4().makeTranslation(blockData.position.x, blockData.position.y, blockData.position.z);
        const _translateOffset = new THREE.Matrix4().makeTranslation(offset[0], offset[1], offset[2]);
        // ワールド行列 = T(pos) * R(rot) * T(offset)
        mesh.matrix.copy(_translatePos)
            .multiply(blockData.rotationMatrix)
            .multiply(_translateOffset);
        mesh.matrixWorldNeedsUpdate = true; // ワールド行列の更新を強制
    });

    // blockDataArrayに含まれなくなった古いメッシュをシーンから削除
    clearOrphanMeshes(scene, processedBlockIds);

    console.log(`[BlockRenderer] 通常モード表示: ${addedCount} 個追加/再生成, ${updatedCount} 個更新。`);
}


/**
 * レンダリングモードを切り替えます（通常表示 ⇔ XML編集表示）。
 * @param {EditMode} mode - 新しい編集モード。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列。
 * @param {THREE.Scene} scene - シーンオブジェクト。
 */
export function setRenderMode(mode, loadedBlocks, scene) {
    console.log(`[BlockRenderer] レンダリングモードを ${mode} に設定します。`);

    if (mode === EditMode.XML_EDIT) {
        // --- XML編集モード表示に切り替え ---
        clearForegroundCubes(scene); // 既存の前景キューブ削除
        const newForegroundCubes = [];

        loadedBlocks.forEach(blockData => {
            // 1. 背景ゴースト設定 (既存の 'mesh' を変更)
            if (blockData.mesh && scene.getObjectById(blockData.mesh.id)) {
                let originalColor = baseBlockMaterial.color; // デフォルト色
                // 現在のマテリアルから色を取得 (未対応ブロックも考慮)
                if (blockData.mesh.material === unknownMaterial) {
                    // unknownMaterialにはcolorプロパティがないため、デフォルト色を使うか、
                    // テクスチャの色から判断するのは複雑なので、ここでは固定色にする
                    originalColor = new THREE.Color(0x555555); // 暗い灰色など
                } else if (blockData.mesh.material?.color) {
                    originalColor = blockData.mesh.material.color;
                }

                // ゴースト用マテリアルをクローンして色を設定
                const ghostMatInstance = ghostMaterialBase.clone();
                ghostMatInstance.color.copy(originalColor); // 色を引き継ぐ
                // 古い通常マテリアルを破棄 (共有のunknownMaterialは除く)
                if (blockData.mesh.material && typeof blockData.mesh.material.dispose === 'function' && blockData.mesh.material !== unknownMaterial) {
                     blockData.mesh.material.dispose();
                }
                // メッシュのマテリアルをゴースト用に差し替え
                blockData.mesh.material = ghostMatInstance;
                blockData.mesh.visible = true; // 背景ゴーストは表示
                 // 行列は変更しない (renderBlocksで設定されたものがそのまま使われる)
                 blockData.mesh.matrixWorldNeedsUpdate = true;

            } else {
                // もし blockData.mesh が存在しない/シーンにない場合 (エラーケースなど)
                console.warn(`[BlockRenderer] Block ID ${blockData.id} の通常メッシュが見つからないため、背景ゴーストを設定できません。`);
            }

            // 2. 前景キューブ作成 (1x1x1)
            // ★修正: foregroundCubeMaterialBase を "クローン" して使用
            const foregroundMaterialInstance = foregroundCubeMaterialBase.clone();
            const foregroundCube = new THREE.Mesh(foregroundCubeGeometry, foregroundMaterialInstance); // 共有ジオメトリ / クローンマテリアル
            foregroundCube.userData.isManagedBlockMesh = true; // 管理対象フラグ
            foregroundCube.userData.isForegroundCube = true; // 前景フラグ
            foregroundCube.userData.blockId = blockData.id;   // 対応するBlockData ID

            // 行列設定 (オフセットなし、1x1x1基準の変形を反映)
            const _translatePos = new THREE.Matrix4().makeTranslation(blockData.position.x, blockData.position.y, blockData.position.z);
            // ワールド行列 = T(pos) * R(rot)
            foregroundCube.matrix.copy(_translatePos).multiply(blockData.rotationMatrix);
            foregroundCube.matrixAutoUpdate = false; // 行列は手動管理
            foregroundCube.matrixWorldNeedsUpdate = true;

            scene.add(foregroundCube);          // シーンに追加
            newForegroundCubes.push(foregroundCube); // リストに追加
            blockData.foregroundMesh = foregroundCube; // BlockDataに前景メッシュへの参照を保持
        });
        foregroundCubes = newForegroundCubes; // モジュール内のリストを更新

    } else {
        // --- 通常モード表示に戻す ---
        clearForegroundCubes(scene); // 前景キューブを全て削除

        loadedBlocks.forEach(blockData => {
            // 前景メッシュへの参照をクリア
            blockData.foregroundMesh = null;
            // 背景ゴーストになっているはずのメッシュを通常表示に戻す処理は、
            // この後呼び出される renderBlocks 関数内で行われる。
            // ここではメッシュの可視性を確保する程度でよい。
            if (blockData.mesh) {
                blockData.mesh.visible = true;
            }
        });
        // 通常表示用のメッシュに更新 (renderBlocksを呼び出す)
        renderBlocks(scene, loadedBlocks);
    }
}

/**
 * シーンから前景キューブを全て削除し、関連リソースを破棄します。
 * @param {THREE.Scene} scene
 * @private
 */
function clearForegroundCubes(scene) {
    if (foregroundCubes.length > 0) {
        console.log(`[BlockRenderer] ${foregroundCubes.length} 個の前景キューブをクリアします。`);
        foregroundCubes.forEach(cube => {
            scene.remove(cube);
            // ★修正: クローンしたマテリアルを破棄する
            if (cube.material && typeof cube.material.dispose === 'function') {
                cube.material.dispose();
            }
            // 共有ジオメトリなので dispose は不要
        });
        foregroundCubes = []; // リストを空にする
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
     scene.traverse((object) => {
         // 管理対象で、前景キューブでなく、かつ今回処理されなかったIDを持つメッシュを探す
         if (object.isMesh && object.userData.isManagedBlockMesh && !object.userData.isForegroundCube) {
             // userData.blockId が存在し、processedBlockIds に含まれていないものを対象とする
             if (object.userData.blockId !== undefined && !processedBlockIds.has(object.userData.blockId)) {
                 meshesToRemove.push(object);
             }
         }
     });

     if (meshesToRemove.length > 0) {
         console.log(`[BlockRenderer] ${meshesToRemove.length} 個の孤立したブロックメッシュを削除します。`);
         meshesToRemove.forEach(mesh => {
             scene.remove(mesh);
             // マテリアルの破棄 (共有マテリアルは除く)
             if(mesh.material && typeof mesh.material.dispose === 'function' && mesh.material !== unknownMaterial) {
                 mesh.material.dispose();
             }
             console.log(`[BlockRenderer] 孤立メッシュ削除 ID: ${mesh.userData.blockId}`);
         });
     }
 }