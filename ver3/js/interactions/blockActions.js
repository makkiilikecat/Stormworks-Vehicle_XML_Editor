/**
 * @fileoverview ブロックに対する主要な編集アクション（配置、削除）を実装します。
 * 対称編集とアンドゥ・リドゥのための履歴登録も考慮します。
 *
 * 【主な変更点 v4.1】
 * - placeBlock 内の new BlockData 呼び出しで scString に null を渡すように修正 (警告抑制)。
 * - placeBlock 内の履歴登録で colorIndices の代わりに surfaceColors, baseColor, additiveColor を使用するように修正 (エラー修正)。
 */

import * as THREE from 'three';
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
// ★ 座標変換ユーティリティ (positionToXml が placeBlock で必要)
import { positionToXml } from '../utils/coordinateConverter.js';

/**
 * 指定された位置と向きで新しいブロックをワークベンチに配置します。
 * 対称編集が有効な場合は、対称な位置にもブロックを配置します。
 * 一連の配置操作は、単一のアンドゥ単位として登録されます (isHistoryAction=falseの場合)。
 *
 * @param {THREE.Vector3} positionThreeJs - 配置位置 (Three.js ワールド座標系、整数値想定)。
 * @param {THREE.Matrix4} orientationMatrix - 配置向き (Three.js ワールド座標系、回転行列)。
 * @param {string} blockDefinitionId - 配置するブロックの定義ID。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この配列が変更されます)。
 * @param {THREE.Scene} scene - 3Dシーンオブジェクト (メッシュ追加用)。
 * @param {boolean} [isHistoryAction=false] - この関数がアンドゥ/リドゥ操作または内部の対称配置処理によって呼び出されたかを示すフラグ。trueの場合、この関数内では履歴登録を行わない。
 * @returns {BlockData | null} 最初に（主として）配置したブロックのBlockDataインスタンス。配置に失敗した場合はnull。
 */
export function placeBlock(positionThreeJs, orientationMatrix, blockDefinitionId, loadedBlocks, scene, isHistoryAction = false) {
    // --- 1. 配置位置の重複チェック ---
    // 指定された位置に既にブロックが存在するか確認
    const isOccupied = loadedBlocks.some(block => block.position.equals(positionThreeJs));
    if (isOccupied) {
        // console.warn(`[BlockActions] 配置位置 ${positionThreeJs.x},${positionThreeJs.y},${positionThreeJs.z} は占有済。`);
        return null; // 既にブロックがあれば配置失敗
    }

    // --- 2. BlockDataインスタンスの作成 (主ブロック) ---
    // BlockDataコンストラクタはXML座標系を期待するため変換
    // ★ positionToXml をインポートして使用
    const positionXml = positionToXml(positionThreeJs);

    // 新しいBlockDataインスタンス生成
    const primaryBlock = new BlockData(
        blockDefinitionId,
        positionXml,
        null, // rotationStringは不要 (initialMatrixで指定)
        // scString に null を渡す (BlockData側でデフォルト処理される)
        null, // scString (旧: "0")
        null, // bcString (デフォルトなし)
        null, // acString (デフォルトなし)
        // tAttributeValue も null を渡す (BlockData側でデフォルト0になる)
        null, // tAttributeValue
        new Map(), // cAttributes (空)
        new Map(), // oAttributes (空)
        [],        // oChildren (空)
        orientationMatrix // initialMatrix
    );

    // --- 3. 内部データ配列への追加 (主ブロック) ---
    loadedBlocks.push(primaryBlock);

    // --- 4. 3Dシーンへのメッシュ追加 (主ブロック) ---
    const primaryMesh = createBlockMesh(primaryBlock); // レンダラーに依頼
    primaryBlock.mesh = primaryMesh; // BlockDataにメッシュ参照を保持
    if (primaryMesh) { // メッシュ作成に成功した場合のみ追加
        scene.add(primaryMesh);           // シーンに追加
        primaryBlock.updateMeshMatrix(); // 正しい位置・向きに更新
    } else {
        console.error(`[BlockActions] 主ブロック (ID: ${primaryBlock.id}) のメッシュ作成に失敗しました。`);
        // エラーの場合、追加した BlockData を取り除くべきか検討
    }
    console.log(`[BlockActions] 主ブロック配置完了: ID ${primaryBlock.id}, Def: ${primaryBlock.definitionId}`);

    // --- 5. 対称編集処理 ---
    /** @type {BlockData[]} 対称編集によって実際に追加されたブロックのリスト */
    const symmetricBlocksPlaced = [];
    // isHistoryAction が false (＝通常の配置操作) の場合のみ対称配置を実行
    if (!isHistoryAction) {
        // 現在有効な対称軸を取得
        const activeAxes = getActiveSymmetryAxes();
        if (activeAxes.length > 0) {
            console.log(`[BlockActions] 対称編集軸: ${activeAxes.join(', ')} で配置試行`);
            // 各有効な軸についてループ
            activeAxes.forEach(axis => {
                // a) 対称な位置と回転を計算
                const symmetricPosition = getSymmetricPosition(primaryBlock.position, axis);
                const symmetricRotation = getSymmetricRotation(primaryBlock.rotationMatrix, axis); // 現状はコピー

                // b) 配置可能かチェック
                //    - 対称位置が元の位置と同じでない (対称面上ではない)
                //    - 対称位置に既にブロックが存在しない
                if (!symmetricPosition.equals(primaryBlock.position) &&
                    !loadedBlocks.some(b => b.position.equals(symmetricPosition)))
                {
                    // c) placeBlock を再帰呼び出しして対称ブロックを配置
                    //    ★必ず isHistoryAction = true を渡す！
                    const symmetricBlock = placeBlock(
                        symmetricPosition, symmetricRotation, blockDefinitionId,
                        loadedBlocks, scene,
                        true // 対称ブロック個別では履歴登録しない
                    );
                    // d) 配置に成功したらリストに追加
                    if (symmetricBlock) {
                        symmetricBlocksPlaced.push(symmetricBlock);
                        console.log(`[BlockActions] 対称ブロック (${axis}軸) 配置完了: ID ${symmetricBlock.id}`);
                    }
                } else {
                    // console.log(`[BlockActions] 対称位置 (${axis}軸) は配置済みまたは同一のためスキップ`);
                }
            });
        }
    } // --- End of 対称編集処理 ---

    // --- 6. アンドゥ履歴の登録 ---
    // isHistoryAction が false (＝最初の呼び出し) の場合のみ履歴登録
    if (!isHistoryAction) {
        // 主ブロックと、対称配置で追加された全てのブロックの情報を一つのアクションとして登録
        // 履歴情報に colorIndices の代わりに surfaceColors, baseColor, additiveColor を含める
        const placedBlocksInfo = [primaryBlock, ...symmetricBlocksPlaced].map(block => {
            if (!block) return null; // 対称配置失敗などでnullになる可能性を考慮
            return {
                // アンドゥ/リドゥに必要な情報のみをコピーして保存
                id: block.id,
                definitionId: block.definitionId,
                position: block.position.clone(),
                rotationMatrix: block.rotationMatrix.clone(),
                surfaceColors: [...block.surfaceColors], // ★ surfaceColors をコピー
                baseColor: block.getBaseColor(),         // ★ baseColor を取得
                additiveColor: block.getAdditiveColor(), // ★ additiveColor を取得
                tAttribute: block.tAttribute,            // t属性
                cAttributes: new Map(block.cAttributes), // Mapもコピー
                oAttributes: new Map(block.oAttributes), // Mapもコピー
                oChildren: [...block.oChildren],         // 子要素もコピー
                mesh: null, // 参照は含めない
                foregroundMesh: null
            };
        }).filter(info => info !== null); // nullを除外

        // 実際に配置されたブロック情報がある場合のみ履歴登録
        if (placedBlocksInfo.length > 0) {
            // 新しいアクションタイプ 'PLACE_SYMMETRY' で登録
            addAction({
                type: 'PLACE_SYMMETRY',
                placedBlocksData: placedBlocksInfo // 追加された全ブロックの情報配列
            });
            console.log(`[BlockActions] アンドゥ履歴 'PLACE_SYMMETRY' 登録 (${placedBlocksInfo.length} ブロック)`);

            // --- 7. ブロック変更イベント発行 ---
            // 他のモジュール(情報表示など)に変更を通知
            document.dispatchEvent(new CustomEvent('blocksChanged', {
                detail: { action: 'place_symmetry', count: placedBlocksInfo.length }
            }));
            console.log("[BlockActions] 'blocksChanged' イベント発行 (placeBlock - symmetry)");
        }
    }

    // 最初に配置した主ブロックの参照を返す
    return primaryBlock;
}


/**
 * 指定されたBlockDataオブジェクトをワークベンチから削除します。
 * 対称編集が有効な場合は、対称な位置にあるブロックも同時に削除します。
 * 一連の削除操作は、単一のアンドゥ単位として登録されます (isHistoryAction=falseの場合)。
 *
 * @param {BlockData} blockDataToDelete - 削除対象の主ブロックデータ。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この配列が変更されます)。
 * @param {THREE.Scene} scene - 3Dシーンオブジェクト。
 * @param {boolean} [isHistoryAction=false] - 履歴操作か複合操作の一部か。trueなら履歴登録しない。
 * @returns {boolean} 少なくとも主ブロックの削除が成功した場合はtrue。
 */
export function deleteBlock(blockDataToDelete, loadedBlocks, scene, isHistoryAction = false) {
    // 削除対象のデータが存在するかチェック
    if (!blockDataToDelete) {
        console.warn("[BlockActions] 削除対象のブロックが指定されていません。");
        return false;
    }

    // --- 1. 対称編集処理: 実際に削除するブロックのリストを作成 ---
    /** @type {BlockData[]} 削除対象となる全ブロックのリスト */
    const blocksToDeleteList = [blockDataToDelete]; // まず主ブロックを追加
    // isHistoryAction が false (＝通常の削除操作) の場合のみ対称削除を考慮
    if (!isHistoryAction) {
        const activeAxes = getActiveSymmetryAxes(); // 有効な対称軸を取得
        if (activeAxes.length > 0) {
             console.log(`[BlockActions] 対称編集軸: ${activeAxes.join(', ')} で削除対象を検索`);
            activeAxes.forEach(axis => {
                // 主ブロックの対称位置を計算
                const symmetricPosition = getSymmetricPosition(blockDataToDelete.position, axis);
                // 対称位置が元の位置と異なる場合のみ処理
                if (!symmetricPosition.equals(blockDataToDelete.position)) {
                    // 対称位置に存在するブロックを探す
                    const symmetricBlock = loadedBlocks.find(b => b.position.equals(symmetricPosition));
                    // 見つかり、かつまだ削除リストに含まれていなければ追加
                    if (symmetricBlock && !blocksToDeleteList.some(b => b.id === symmetricBlock.id)) {
                        blocksToDeleteList.push(symmetricBlock);
                        console.log(`[BlockActions] 対称ブロック (${axis}軸) を削除リストに追加: ID ${symmetricBlock.id}`);
                    }
                }
            });
        }
    }

    // --- 2. 削除処理の実行 と アンドゥ用情報作成 ---
    /** @type {Array<object>} アンドゥ用に削除されるブロックの情報を保持 */
    const deletedInfoList = [];
    /** @type {Set<number>} 削除対象ブロックのIDセット (効率的な検索用) */
    const blockIdsToDelete = new Set(blocksToDeleteList.map(b => b.id));
    /** @type {number} 実際に削除されたブロックの数 */
    let deletedCount = 0;
    /** @type {number[]} 元の配列で削除対象だった要素のインデックスリスト */
    const indicesToRemove = [];

    // loadedBlocks 配列を走査し、削除対象を特定・処理
    loadedBlocks.forEach((block, index) => {
        if (blockIdsToDelete.has(block.id)) {
            indicesToRemove.push(index); // 削除するインデックスを記録
            // アンドゥ用情報をディープコピーして保存
            // ★ 履歴情報に surfaceColors, baseColor, additiveColor を含める
            deletedInfoList.push({
                id: block.id,
                definitionId: block.definitionId,
                position: block.position.clone(),
                rotationMatrix: block.rotationMatrix.clone(),
                surfaceColors: [...block.surfaceColors], // ★ surfaceColors をコピー
                baseColor: block.getBaseColor(),         // ★ baseColor を取得
                additiveColor: block.getAdditiveColor(), // ★ additiveColor を取得
                tAttribute: block.tAttribute,
                cAttributes: new Map(block.cAttributes),
                oAttributes: new Map(block.oAttributes),
                oChildren: [...block.oChildren],
                mesh: null, // 参照は含めない
                foregroundMesh: null
            });
            // メッシュをシーンから削除 & リソース破棄
            if (block.mesh && block.mesh.parent) {
                scene.remove(block.mesh);
                // マテリアルやジオメトリの破棄は blockRenderer.js に任せる方が一貫性があるかもしれない
                block.mesh = null;
            }
            if (block.foregroundMesh && block.foregroundMesh.parent) {
                scene.remove(block.foregroundMesh);
                // マテリアル破棄は blockRenderer.js 側に？
                block.foregroundMesh = null;
            }
            deletedCount++; // 削除カウンターを増やす
        }
    });

    // --- 3. loadedBlocks 配列から実際に削除 ---
    if (deletedCount > 0) {
        // インデックスが大きい方から削除することで、削除によるインデックスのずれを防ぐ
        indicesToRemove.sort((a, b) => b - a); // 降順ソート
        indicesToRemove.forEach(index => loadedBlocks.splice(index, 1));
        console.log(`[BlockActions] ${deletedCount} 個のブロック (対称含む) を削除しました。`);
    } else {
         // 主ブロックが loadedBlocks に見つからなかった場合 (エラーケース)
         console.warn(`[BlockActions] 削除対象の主ブロックが見つかりませんでした: ID ${blockDataToDelete.id}`);
         return false; // 削除失敗
    }

    // --- 4. アンドゥ履歴の登録 ---
    // isHistoryAction が false で、実際にブロックが削除された場合のみ登録
    if (!isHistoryAction && deletedInfoList.length > 0) {
        addAction({
            type: 'DELETE_SYMMETRY', // 新しいアクションタイプ
            deletedBlocksData: deletedInfoList // 削除された全ブロックの情報
        });
        console.log(`[BlockActions] アンドゥ履歴 'DELETE_SYMMETRY' 登録 (${deletedInfoList.length} ブロック)`);

        // --- 5. ブロック変更イベント発行 ---
        document.dispatchEvent(new CustomEvent('blocksChanged', {
            detail: { action: 'delete_symmetry', count: deletedInfoList.length }
        }));
        console.log("[BlockActions] 'blocksChanged' イベント発行 (deleteBlock - symmetry)");
    }

    // --- 6. 選択解除 ---
    // 削除されたブロックが選択されていた場合は選択をクリア
    const currentSelection = getSelectedBlocks();
    if (currentSelection.some(b => blockIdsToDelete.has(b.id))) {
        console.log("[BlockActions] 削除されたブロックが含まれていたため、選択をクリアします。");
        clearSelection();
    }

    return true; // 削除成功
}