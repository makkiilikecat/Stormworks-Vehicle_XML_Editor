/**
 * @fileoverview 現在配置するブロックの種類と向きの状態を管理します。
 * 状態変更時にカスタムイベント ('placementblockchanged', 'previeworientationchanged') を発行します。
 */
import * as THREE from 'three'; // Matrix4 のため

// --- モジュール内変数 ---

/** @type {string} 現在選択されている配置ブロックの定義ID */
let currentPlacementBlockId = '01_block'; // 初期値は基本ブロック
/** @type {string} 現在選択されている配置ブロックの名前 (UI表示用) */
let currentPlacementBlockName = 'Block'; // 初期値 (blockDefinitionsから取得推奨)
/** @type {THREE.Matrix4} プレビューおよび配置時のブロックの向きを示す回転行列 */
let previewOrientationMatrix = new THREE.Matrix4(); // 初期値は単位行列 (回転なし)

// --- 公開関数 ---

/**
 * 現在配置対象として選択されているブロックの種類IDを取得します。
 * @returns {string} ブロック定義ID。
 */
export function getCurrentPlacementBlockId() {
    return currentPlacementBlockId;
}

/**
 * 現在配置対象として選択されているブロック名を取得します。
 * @returns {string} ブロック名。
 */
export function getCurrentPlacementBlockName() {
    // TODO: blockId に基づいて blockDefinitions から name を取得する方がより正確
    return currentPlacementBlockName;
}

/**
 * 配置対象のブロック種類を設定します。
 * 実際に状態が変更された場合、'placementblockchanged' カスタムイベントを発行します。
 * @param {string} blockId - 設定するブロック定義ID。
 * @param {string} blockName - 設定するブロック名 (UI表示用)。
 */
export function setPlacementBlock(blockId, blockName) {
    // 現在の値と異なる場合のみ更新とイベント発行
    if (currentPlacementBlockId !== blockId) {
        console.log(`[PlacementState] 配置ブロック変更: ${currentPlacementBlockName}(${currentPlacementBlockId}) -> ${blockName}(${blockId})`);
        const oldBlockId = currentPlacementBlockId;
        const oldBlockName = currentPlacementBlockName;

        currentPlacementBlockId = blockId;
        currentPlacementBlockName = blockName;
        resetPreviewOrientation(); // ブロック種類が変わったら向きを初期化

        // --- 状態変更イベントを発行 ---
        document.dispatchEvent(new CustomEvent('placementblockchanged', {
            detail: {
                newBlockId: currentPlacementBlockId,
                newBlockName: currentPlacementBlockName,
                oldBlockId: oldBlockId,
                oldBlockName: oldBlockName
            }
        }));
    }
}

/**
 * プレビューブロックの現在の向き（回転行列）を取得します。
 * 外部で変更されないようにコピーを返すか、直接参照を返すかは要検討。
 * (現状は直接参照を返しているが、意図しない変更を防ぐなら clone() する)
 * @returns {THREE.Matrix4} 向きを表すMatrix4。
 */
export function getPreviewOrientation() {
    return previewOrientationMatrix;
    // return previewOrientationMatrix.clone(); // 安全性を取るならクローン
}

/**
 * プレビューブロックの向き（回転行列）を更新します。
 * 実際に状態が変更された場合、'previeworientationchanged' カスタムイベントを発行します。
 * @param {THREE.Matrix4} newMatrix - 新しい向きを表すMatrix4。
 */
export function setPreviewOrientation(newMatrix) {
    // Matrix4.equals() で現在の値と比較し、変更がある場合のみ更新とイベント発行
    if (!previewOrientationMatrix.equals(newMatrix)) {
        previewOrientationMatrix.copy(newMatrix); // 新しい行列の内容をコピー
        // --- 向き変更イベントを発行 ---
        document.dispatchEvent(new CustomEvent('previeworientationchanged', {
            detail: { newOrientation: previewOrientationMatrix } // コピーを渡す方が安全かも
        }));
        // console.log("[PlacementState] プレビュー向き変更");
    }
}

/**
 * プレビューブロックの向きを初期状態（単位行列）に戻します。
 * 実際に状態が変更された場合、'previeworientationchanged' カスタムイベントを発行します。
 */
export function resetPreviewOrientation() {
    const identity = new THREE.Matrix4(); // 単位行列
    // 現在の向きが単位行列でない場合のみリセットとイベント発行
    if (!previewOrientationMatrix.equals(identity)) {
        previewOrientationMatrix.identity(); // 単位行列に設定
        // --- 向き変更イベントを発行 ---
        document.dispatchEvent(new CustomEvent('previeworientationchanged', {
            detail: { newOrientation: previewOrientationMatrix }
        }));
         console.log("[PlacementState] プレビュー向きリセット");
    }
}

// --- 初期化 (オプション) ---
// アプリ起動時にデフォルトのブロック名を blockDefinitions から取得するなど
function initializePlacementState() {
    // import { getBlockDefinition } from '../data/blockDefinitions.js';
    // const defaultDef = getBlockDefinition(currentPlacementBlockId);
    // if (defaultDef) {
    //     currentPlacementBlockName = defaultDef.name;
    // }
    // document.dispatchEvent(...) // 初期状態イベント発行
}
// initializePlacementState(); // 必要なら呼び出す