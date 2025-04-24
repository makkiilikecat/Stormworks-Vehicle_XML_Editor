/**
 * @fileoverview ブロックに対する主要な編集アクション（配置、削除）を実装します。
 * これらのアクションは、対称編集が有効な場合に自動的に対称な位置にも適用され、
 * アンドゥ・リドゥ機能のための履歴登録も行います。
 *
 * @version 4.1.1 - コメントの明確化
 */

import * as THREE from 'three'; // Matrix4, Vector3 を使用
// 選択状態の取得やクリアのため (削除時に使用)
import { getSelectedBlocks, clearSelection } from '../interactions/selectionState.js';
// ブロックデータのクラス定義
import { BlockData } from '../data/blockData.js';
// アンドゥ/リドゥ履歴管理
import { addAction } from '../state/historyManager.js';
// メッシュ生成用レンダラー関数
import { createBlockMesh } from '../rendering/blockRenderer.js';
// ブロック定義取得 (メッシュのオフセット計算などに必要)
import { getBlockDefinition } from '../data/blockDefinitions.js';
// 対称編集の状態とヘルパー関数
import { getActiveSymmetryAxes, getSymmetricPosition, getSymmetricRotation } from '../state/symmetryState.js';
// 座標変換ユーティリティ (XML座標 <-> Three.js座標)
import { positionToXml } from '../utils/coordinateConverter.js';

/**
 * 指定された位置と向きで新しいブロックをワークベンチに配置します。
 *
 * 処理の流れ:
 * 1. 指定位置に既にブロックがないか確認します。
 * 2. 新しい BlockData インスタンスを生成します (主ブロック)。
 * 3. loadedBlocks 配列に主ブロックを追加します。
 * 4. 主ブロックに対応する3Dメッシュを生成し、シーンに追加します。
 * 5. 対称編集が有効な場合、対称な位置を計算し、再帰的にこの関数を呼び出して対称ブロックを配置します。
 * 6. (通常操作の場合のみ) アンドゥ履歴に、配置された全ブロック（主ブロック＋対称ブロック）の情報を登録します。
 * 7. ブロック構成が変更されたことを示すイベントを発行します。
 *
 * @param {THREE.Vector3} positionThreeJs - 配置する位置 (Three.js ワールド座標系、整数座標を想定)。
 * @param {THREE.Matrix4} orientationMatrix - 配置する向き (Three.js ワールド座標系の回転行列)。
 * @param {string} blockDefinitionId - 配置するブロックの定義ID (例: '01_block')。
 * @param {BlockData[]} loadedBlocks - 現在ロードされている全ブロックデータの配列 (この関数内で変更されます)。
 * @param {THREE.Scene} scene - 3Dシーンオブジェクト (メッシュを追加するために使用)。
 * @param {boolean} [isHistoryAction=false] - この関数呼び出しがアンドゥ/リドゥ操作、または対称配置の再帰呼び出しかどうかを示すフラグ。
 * true の場合、この呼び出し自体ではアンドゥ履歴への登録を行いません。
 * @returns {BlockData | null} 最初に（主として）配置したブロックの BlockData インスタンス。配置に失敗した場合は null。
 */
export function placeBlock(positionThreeJs, orientationMatrix, blockDefinitionId, loadedBlocks, scene, isHistoryAction = false) {
    // --- 1. 配置位置の重複チェック ---
    // 指定された位置に既にブロックの中心があるか確認
    const isOccupied = loadedBlocks.some(block => block.position.equals(positionThreeJs));
    if (isOccupied) {
        // console.warn(`[BlockActions] 配置位置 ${positionThreeJs.x},${positionThreeJs.y},${positionThreeJs.z} は占有済のためスキップ。`);
        return null; // 既にブロックがあれば配置失敗
    }

    // --- 2. BlockDataインスタンスの作成 (主ブロック) ---
    // BlockDataコンストラクタはXML座標系を期待するため変換
    const positionXml = positionToXml(positionThreeJs);

    // 新しいBlockDataインスタンス生成
    const primaryBlock = new BlockData(
        blockDefinitionId, // ブロックタイプ
        positionXml,       // XML形式の位置
        null,              // rotationString (initialMatrix を使うので null)
        null,              // scString (null を渡し、BlockData内でデフォルト処理させる)
        null,              // bcString (デフォルトなし)
        null,              // acString (デフォルトなし)
        null,              // tAttributeValue (デフォルト0)
        new Map(),         // cAttributes (空)
        new Map(),         // oAttributes (空)
        [],                // oChildren (空)
        orientationMatrix, // initialMatrix (指定された向き)
        null               // restoreId (新規作成なので null)
    );

    // --- 3. 内部データ配列への追加 (主ブロック) ---
    loadedBlocks.push(primaryBlock);

    // --- 4. 3Dシーンへのメッシュ追加 (主ブロック) ---
    // blockRenderer を使ってメッシュを生成
    const primaryMesh = createBlockMesh(primaryBlock);
    primaryBlock.mesh = primaryMesh; // 生成したメッシュへの参照を BlockData に保持
    if (primaryMesh) {
        // メッシュ生成に成功したらシーンに追加し、行列を更新
        scene.add(primaryMesh);
        primaryBlock.updateMeshMatrix(); // BlockData の情報に基づいてメッシュの位置・向きを設定
    } else {
        console.error(`[BlockActions] 主ブロック (ID: ${primaryBlock.id}, Def: ${blockDefinitionId}) のメッシュ生成に失敗。`);
        // エラー発生時、追加した BlockData を loadedBlocks から取り除くべきか検討が必要
    }
    // console.log(`[BlockActions] 主ブロック配置: ID ${primaryBlock.id}, Def: ${primaryBlock.definitionId}`);

    // --- 5. 対称編集処理 ---
    /** @type {BlockData[]} 対称編集によって実際に追加された BlockData のリスト */
    const symmetricBlocksPlaced = [];
    // isHistoryAction が false (通常のユーザー操作による配置) の場合のみ、対称配置を試みる
    if (!isHistoryAction) {
        const activeAxes = getActiveSymmetryAxes(); // 現在有効な対称軸を取得
        if (activeAxes.length > 0) {
            // console.log(`[BlockActions] 対称軸 (${activeAxes.join(',')}) で配置試行`);
            activeAxes.forEach(axis => {
                // a) 主ブロックの位置・向きに対する対称な位置・向きを計算
                const symmetricPosition = getSymmetricPosition(primaryBlock.position, axis);
                const symmetricRotation = getSymmetricRotation(primaryBlock.rotationMatrix, axis); // 回転も対称化 (現在の実装はコピー)

                // b) 配置可能かチェック:
                //    - 対称位置が元の位置と同じでないか？ (ブロックが対称面上にないか)
                //    - 対称位置に既に他のブロックが存在しないか？
                if (!symmetricPosition.equals(primaryBlock.position) &&
                    !loadedBlocks.some(b => b.position.equals(symmetricPosition)))
                {
                    // c) 配置可能なら、placeBlock を再帰呼び出しして対称ブロックを配置
                    //    ★ 必ず isHistoryAction = true を渡して、二重に履歴登録しないようにする
                    const symmetricBlock = placeBlock(
                        symmetricPosition, symmetricRotation, blockDefinitionId,
                        loadedBlocks, scene,
                        true // 履歴登録をスキップするフラグ
                    );
                    // d) 対称ブロックの配置に成功したら、リストに追加
                    if (symmetricBlock) {
                        symmetricBlocksPlaced.push(symmetricBlock);
                        // console.log(`[BlockActions] 対称ブロック (${axis}軸) 配置: ID ${symmetricBlock.id}`);
                    }
                }
            });
        }
    } // --- End of 対称編集処理 ---

    // --- 6. アンドゥ履歴の登録 ---
    // isHistoryAction が false (通常のユーザー操作) の場合のみ、履歴に登録
    if (!isHistoryAction) {
        // 配置された全ブロック（主ブロック + 対称ブロック）の情報を集める
        const placedBlocksInfo = [primaryBlock, ...symmetricBlocksPlaced]
            .filter(block => block !== null) // 念のため null チェック
            .map(block => ({
                // アンドゥ/リドゥに必要な情報のみをディープコピーして保存
                id: block.id,
                definitionId: block.definitionId,
                position: block.position.clone(),             // Vector3 は clone()
                rotationMatrix: block.rotationMatrix.clone(), // Matrix4 も clone()
                surfaceColors: [...block.surfaceColors],      // 配列はスプレッド構文でコピー
                baseColor: block.getBaseColor(),              // getter を使う
                additiveColor: block.getAdditiveColor(),      // getter を使う
                tAttribute: block.tAttribute,
                cAttributes: new Map(block.cAttributes),      // Map も new Map() でコピー
                oAttributes: new Map(block.oAttributes),      // Map も new Map() でコピー
                oChildren: block.oChildren.map(node => node.cloneNode(true)), // 子Nodeもクローン
                // メッシュオブジェクトへの参照は履歴に含めない (Undo/Redo時に再生成するため)
                mesh: null,
                foregroundMesh: null
            }));

        // 実際に配置されたブロックがある場合のみ履歴登録
        if (placedBlocksInfo.length > 0) {
            addAction({
                type: 'PLACE_SYMMETRY',          // アクションタイプ (対称配置)
                placedBlocksData: placedBlocksInfo // 配置されたブロック情報の配列
            });
            // console.log(`[BlockActions] アンドゥ履歴 'PLACE_SYMMETRY' 登録 (${placedBlocksInfo.length} ブロック)`);

            // --- 7. ブロック構成変更イベントの発行 ---
            // 他のUIモジュール（情報表示エリアなど）に通知
            document.dispatchEvent(new CustomEvent('blocksChanged', {
                detail: { action: 'place_symmetry', count: placedBlocksInfo.length }
            }));
            // console.log("[BlockActions] 'blocksChanged' イベント発行 (placeBlock - symmetry)");
        }
    }

    // 最初に配置した主ブロックの参照を返す (対称配置など内部呼び出しの場合も主ブロックを返す)
    return primaryBlock;
}


/**
 * 指定された BlockData オブジェクトをワークベンチから削除します。
 *
 * 処理の流れ:
 * 1. (通常操作の場合) 対称編集が有効なら、対称な位置にあるブロックも削除対象リストに追加します。
 * 2. 削除対象リストの各ブロックについて、アンドゥ用の情報を保存します。
 * 3. 各ブロックの3Dメッシュをシーンから削除します（関連リソースの破棄は renderer 側に任せる想定）。
 * 4. loadedBlocks 配列から該当する BlockData を削除します。
 * 5. (通常操作の場合のみ) アンドゥ履歴に、削除された全ブロックの情報を登録します。
 * 6. ブロック構成が変更されたことを示すイベントを発行します。
 * 7. 削除されたブロックが選択されていた場合、選択状態をクリアします。
 *
 * @param {BlockData | null} blockDataToDelete - 削除対象の主ブロックデータ。null の場合は警告を出して終了。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この関数内で変更されます)。
 * @param {THREE.Scene} scene - 3Dシーンオブジェクト (メッシュを削除するために使用)。
 * @param {boolean} [isHistoryAction=false] - この関数呼び出しがアンドゥ/リドゥ操作か複合操作の一部か。true なら履歴登録しない。
 * @returns {boolean} 少なくとも主ブロックの削除が成功した場合は true、対象が見つからない等で失敗した場合は false。
 */
export function deleteBlock(blockDataToDelete, loadedBlocks, scene, isHistoryAction = false) {
    // 削除対象が指定されているかチェック
    if (!blockDataToDelete) {
        console.warn("[BlockActions] 削除対象のブロックが指定されていません。");
        return false;
    }

    // --- 1. 対称編集処理: 実際に削除するブロックのリストを作成 ---
    /** @type {BlockData[]} 削除対象となる全ブロック (主ブロック + 対称ブロック) のリスト */
    const blocksToDeleteList = [blockDataToDelete]; // まず主ブロックをリストに追加
    // isHistoryAction が false (通常のユーザー操作) の場合のみ、対称ブロックも探す
    if (!isHistoryAction) {
        const activeAxes = getActiveSymmetryAxes(); // 有効な対称軸を取得
        if (activeAxes.length > 0) {
            // console.log(`[BlockActions] 対称軸 (${activeAxes.join(',')}) で削除対象を検索`);
            activeAxes.forEach(axis => {
                // 対称位置を計算
                const symmetricPosition = getSymmetricPosition(blockDataToDelete.position, axis);
                // 対称位置が元の位置と異なる (対称面上ではない) 場合のみ処理
                if (!symmetricPosition.equals(blockDataToDelete.position)) {
                    // 対称位置にあるブロックを loadedBlocks から探す
                    const symmetricBlock = loadedBlocks.find(b => b.position.equals(symmetricPosition));
                    // 見つかり、かつまだ削除リストに含まれていなければ追加
                    if (symmetricBlock && !blocksToDeleteList.some(b => b.id === symmetricBlock.id)) {
                        blocksToDeleteList.push(symmetricBlock);
                        // console.log(`[BlockActions] 対称ブロック (${axis}軸) を削除リストに追加: ID ${symmetricBlock.id}`);
                    }
                }
            });
        }
    }

    // --- 2. 削除処理の実行 と アンドゥ用情報作成 ---
    /** @type {Array<object>} アンドゥ用に、削除されるブロックの完全な情報を保持する配列 */
    const deletedInfoList = [];
    /** @type {Set<number>} 削除対象ブロックのIDセット (効率的な検索のため) */
    const blockIdsToDelete = new Set(blocksToDeleteList.map(b => b.id));
    /** @type {number} 実際に削除されたブロックの数をカウント */
    let deletedCount = 0;
    /** @type {number[]} 元の loadedBlocks 配列で削除対象だった要素のインデックスを記録 */
    const indicesToRemove = [];

    // loadedBlocks 配列を走査し、削除対象を特定して処理
    loadedBlocks.forEach((block, index) => {
        // 現在のブロックが削除対象リストに含まれているか ID で確認
        if (blockIdsToDelete.has(block.id)) {
            indicesToRemove.push(index); // 削除するインデックスを記録

            // アンドゥ用に、削除前のブロック状態をディープコピーして保存
            deletedInfoList.push({
                id: block.id,
                definitionId: block.definitionId,
                position: block.position.clone(),
                rotationMatrix: block.rotationMatrix.clone(),
                surfaceColors: [...block.surfaceColors],
                baseColor: block.getBaseColor(),
                additiveColor: block.getAdditiveColor(),
                tAttribute: block.tAttribute,
                cAttributes: new Map(block.cAttributes),
                oAttributes: new Map(block.oAttributes),
                oChildren: block.oChildren.map(node => node.cloneNode(true)),
                mesh: null, // メッシュ参照は含めない
                foregroundMesh: null
            });

            // 対応する3Dメッシュをシーンから削除
            if (block.mesh && block.mesh.parent === scene) {
                scene.remove(block.mesh);
                block.mesh = null; // BlockDataからの参照もクリア
                 // メッシュやマテリアルの dispose() は、メモリリークを防ぐために
                 // renderer 側や historyActions で行う方が管理しやすい場合がある
            }
            // 前景メッシュも削除
            if (block.foregroundMesh && block.foregroundMesh.parent === scene) {
                scene.remove(block.foregroundMesh);
                block.foregroundMesh = null;
            }

            deletedCount++; // 削除カウンターを増やす
        }
    });

    // --- 3. loadedBlocks 配列から実際に削除 ---
    // 実際に削除対象が見つかった場合のみ処理
    if (deletedCount > 0) {
        // インデックスのずれを防ぐため、大きいインデックスから削除
        indicesToRemove.sort((a, b) => b - a); // 降順ソート
        indicesToRemove.forEach(index => loadedBlocks.splice(index, 1));
        console.log(`[BlockActions] ${deletedCount} 個のブロック (対称含む) をデータ配列から削除しました。`);
    } else {
         // 主ブロックが loadedBlocks に見つからなかった場合 (通常は起こらないはず)
         console.warn(`[BlockActions] 削除対象の主ブロックが loadedBlocks に見つかりませんでした: ID ${blockDataToDelete.id}`);
         return false; // 削除失敗
    }

    // --- 4. アンドゥ履歴の登録 ---
    // isHistoryAction が false (通常のユーザー操作) で、実際にブロックが削除された場合のみ
    if (!isHistoryAction && deletedInfoList.length > 0) {
        addAction({
            type: 'DELETE_SYMMETRY',        // アクションタイプ (対称削除)
            deletedBlocksData: deletedInfoList // 削除されたブロック情報の配列
        });
        // console.log(`[BlockActions] アンドゥ履歴 'DELETE_SYMMETRY' 登録 (${deletedInfoList.length} ブロック)`);

        // --- 5. ブロック構成変更イベント発行 ---
        document.dispatchEvent(new CustomEvent('blocksChanged', {
            detail: { action: 'delete_symmetry', count: deletedInfoList.length }
        }));
        // console.log("[BlockActions] 'blocksChanged' イベント発行 (deleteBlock - symmetry)");
    }

    // --- 6. 選択状態のクリア ---
    // 削除されたブロックの中に、現在選択中のブロックが含まれているかチェック
    const currentSelection = getSelectedBlocks();
    if (currentSelection.some(b => blockIdsToDelete.has(b.id))) {
        console.log("[BlockActions] 削除されたブロックが選択されていたため、選択をクリアします。");
        clearSelection(); // 選択状態をクリア
    }

    return true; // 削除成功
}