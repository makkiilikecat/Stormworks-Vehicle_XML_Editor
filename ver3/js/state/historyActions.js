/**
 * @fileoverview アンドゥ/リドゥ履歴のアクションに対応する具体的な実行ロジック。
 * historyManager.js から呼び出され、アプリケーションの状態（主にloadedBlocks）を変更します。
 * シーンの再描画は historyManager 側で行われます。
 */

import { BlockData } from '../data/blockData.js';
// BlockActions は履歴操作中は履歴を追加しないフラグを渡して呼び出す
import { placeBlock, deleteBlock } from '../interactions/blockActions.js';
// coordinateConverter は setBlockPropertyValueInternal で使用
import { positionFromXml, rotationMatrixFromXmlElements, positionToXml, rotationMatrixToXmlElements } from '../utils/coordinateConverter.js';

/**
 * アクションを元に戻す処理を実行します。
 * 状態の変更のみを行い、シーンの再描画は呼び出し元(historyManager)で行います。
 * @param {object} action - 元に戻すアクションオブジェクト。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この配列が直接変更されます)。
 * @param {THREE.Scene} scene - 3Dシーン (deleteBlock で使用)。
 * @returns {boolean} 処理が成功した場合はtrue。
 */
export function executeUndo(action, loadedBlocks, scene) {
    console.log('Executing Undo for:', action.type);
    switch (action.type) {
        case 'ADD_BLOCK':
            // 配置されたブロックを削除する
            // action.blockData には配置された BlockData インスタンスが格納されているはず
            // deleteBlock は loadedBlocks 配列とシーンから削除する
            // 第4引数 true は、これが履歴操作であり、さらに履歴を追加しないことを示す
            return deleteBlock(action.blockData, loadedBlocks, scene, true);

        case 'DELETE_BLOCK':
            // 削除されたブロックデータを復元する
            // action.blockData には削除されたブロックのデータ(mesh=null)が格納されている
            // 同じIDのブロックが既に存在しないことを確認してから追加
             if (!loadedBlocks.find(b => b.id === action.blockData.id)) {
                 // BlockData インスタンスを復元（元のクラスメソッドを使う方が安全かもしれない）
                 // ここでは保存されたプレーンなオブジェクトをそのまま追加する
                 loadedBlocks.push(action.blockData);
                 return true; // 成功
            } else {
                 console.warn(`Undo Delete: Block ID ${action.blockData.id} already exists in loadedBlocks.`);
                 return false; // 失敗
            }

        case 'TRANSFORM_BLOCKS':
            // 複数のブロックの回転/反転などの変形を元に戻す
            action.transformations.forEach(t => {
                const block = loadedBlocks.find(b => b.id === t.blockId);
                if (block) {
                    // 保存しておいた古い行列 (oldMatrix) を適用
                    block.rotationMatrix.copy(t.oldMatrix);
                    // 対応するメッシュの行列更新は、呼び出し元の再描画で行われる
                } else {
                    console.warn(`Undo Transform: Block ID ${t.blockId} not found.`);
                }
            });
            return true; // 成功 (一部失敗しても全体としては実行されたとみなす)

         case 'SET_PROPERTIES':
            // UIからのプロパティ変更を元に戻す
             action.changes.forEach(change => {
                 const block = loadedBlocks.find(b => b.id === change.blockId);
                 if (block) {
                     // 保存しておいた古い値 (oldValue) を適用
                     setBlockPropertyValueInternal(
                         block,
                         change.propertyPath,
                         change.matrixRow,
                         change.matrixCol,
                         change.oldValue
                     );
                     // メッシュ更新は再描画で
                 } else {
                      console.warn(`Undo Set Properties: Block ID ${change.blockId} not found.`);
                 }
             });
            return true; // 成功

        default:
            console.warn(`未対応のアンドゥアクションタイプ: ${action.type}`);
            return false; // 失敗
    }
}

/**
 * 元に戻したアクションをやり直す処理を実行します。
 * 状態の変更のみを行い、シーンの再描画は呼び出し元(historyManager)で行います。
 * @param {object} action - やり直すアクションオブジェクト。
 * @param {BlockData[]} loadedBlocks - 現在のブロックデータ配列 (この配列が直接変更されます)。
 * @param {THREE.Scene} scene - 3Dシーン (deleteBlock で使用)。
 * @returns {boolean} 処理が成功した場合はtrue。
 */
export function executeRedo(action, loadedBlocks, scene) {
    console.log('Executing Redo for:', action.type);
    switch (action.type) {
        case 'ADD_BLOCK':
            // アンドゥで削除されたブロックデータを復元
             if (!loadedBlocks.find(b => b.id === action.blockData.id)) {
                 loadedBlocks.push(action.blockData);
                 return true;
            } else {
                 console.warn(`Redo Add: Block ID ${action.blockData.id} already exists.`);
                 return false;
            }

        case 'DELETE_BLOCK':
            // アンドゥで復元されたブロックを再度削除する
            // action.blockData には削除されたブロックの情報が入っている
            const blockToRedoDelete = loadedBlocks.find(b => b.id === action.blockData.id);
            if (blockToRedoDelete) {
                // deleteBlock を履歴操作として呼び出す
                return deleteBlock(blockToRedoDelete, loadedBlocks, scene, true);
            } else {
                 console.warn(`Redo Delete: Block ID ${action.blockData.id} not found in loadedBlocks.`);
                 return false;
            }

        case 'TRANSFORM_BLOCKS':
            // ブロックの変形をやり直す
            action.transformations.forEach(t => {
                const block = loadedBlocks.find(b => b.id === t.blockId);
                if (block) {
                    // 保存しておいた新しい行列 (newMatrix) を適用
                    block.rotationMatrix.copy(t.newMatrix);
                    // メッシュ更新は再描画で
                }
            });
            return true;

        case 'SET_PROPERTIES':
            // UIからのプロパティ変更をやり直す
             action.changes.forEach(change => {
                 const block = loadedBlocks.find(b => b.id === change.blockId);
                 if (block) {
                     // 保存しておいた新しい値 (newValue) を適用
                     setBlockPropertyValueInternal(
                         block,
                         change.propertyPath,
                         change.matrixRow,
                         change.matrixCol,
                         change.newValue
                     );
                     // メッシュ更新は再描画で
                 }
             });
            return true;

        default:
            console.warn(`未対応のリドゥアクションタイプ: ${action.type}`);
            return false;
    }
}


/**
 * BlockDataのプロパティに値を設定する内部関数。
 * アンドゥ/リドゥ操作中に内部状態を変更するために使用します。
 * @param {BlockData} blockData - 対象のBlockData。
 * @param {string | null} propertyPath - 'vp.x', 'vp.y', 'vp.z' または null。
 * @param {number} row - 行列の行インデックス (0-2) または -1。
 * @param {number} col - 行列の列インデックス (0-2) または -1。
 * @param {number} value - 設定する整数値。
 * @private
 */
function setBlockPropertyValueInternal(blockData, propertyPath, row, col, value) {
     if (propertyPath) { // 座標の場合
        const prop = propertyPath.split('.')[1]; // 'x', 'y', 'z'
        const currentPosXml = blockData.getPositionXml(); // 現在のXML座標取得
        currentPosXml[prop] = value; // 指定要素を更新
        // 更新したXML座標を使ってBlockDataの内部状態(Three.js座標)を更新
        blockData.setPositionFromXml(currentPosXml.x, currentPosXml.y, currentPosXml.z);
    } else if (row !== -1 && col !== -1) { // 回転行列の場合
        const currentElements = blockData.getRotationMatrixXmlElements(); // 現在のXML要素取得
        const index = col * 3 + row; // XML要素配列のインデックス計算
        currentElements[index] = value; // 指定要素を更新
        // 更新したXML要素配列を使ってBlockDataの内部状態(Matrix4)を更新
        blockData.setRotationMatrixFromXmlElements(currentElements);
    }
     // メッシュの実際の更新 (position, matrix) は、undo/redo 完了後の
     // renderBlocks() による再描画で行われる想定。
     // BlockDataの setPositionFromXml / setRotationMatrixFromXmlElements 内で
     // this.mesh の更新も行っているので、renderBlocks を呼ばなくても反映される可能性はあるが、
     // clear/render の方が確実。
}