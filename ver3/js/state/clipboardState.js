/**
 * @fileoverview コピー/カットされたブロックデータのクリップボード状態を管理します。
 * クリップボードデータの回転/反転操作も提供します。
 * ギズモの表示制御も連携して行います。
 */

import * as THREE from 'three';
// 回転/反転用の基本行列をインポート
import { rotJMatrix, rotKMatrix, rotLMatrix, flipUMatrix, flipIMatrix, flipOMatrix } from '../interactions/rotationHandler.js';
// ギズモ表示制御関数をインポート
import { setSizeGizmosVisibility } from '../rendering/rangeGizmoRenderer.js';

// --- モジュール内変数 ---

/**
 * クリップボードに格納されるデータ形式。
 * @typedef {object} ClipboardContent
 * @property {Array<CopiedBlockData>} blocks - コピーされたブロックデータの配列。
 * @property {THREE.Vector3} origin - コピー元の選択範囲の中心点 (ワールド座標)。
 */

/**
 * コピーされた個々のブロックデータ形式。
 * ワールド座標での位置と回転を持つ。
 * @typedef {object} CopiedBlockData
 * @property {string} definitionId - ブロック定義ID。
 * @property {number[]} colorIndices - 色インデックス。
 * @property {THREE.Vector3} position - コピー時のワールド座標。
 * @property {THREE.Matrix4} rotationMatrix - コピー時のワールド回転行列。
 * @property {number} originalId - (任意)コピー元のBlockDataのID。
 */

/** @type {ClipboardContent | null} 現在のクリップボードの内容 */
let clipboardData = null;

/** @type {boolean} クリップボードにデータが存在するかを示すフラグ */
let hasData = false;

// --- 計算用一時変数 (transformClipboardData用) ---
const _origin = new THREE.Vector3();
const _inverseOrigin = new THREE.Vector3();
const _transformMatrix = new THREE.Matrix4();
const _translateToOrigin = new THREE.Matrix4();
const _rotateOrFlip = new THREE.Matrix4();
const _translateBack = new THREE.Matrix4();
const _currentPos = new THREE.Vector3();

// --- 公開関数 ---

/**
 * クリップボードの状態を初期化します。
 * 同時にサイズ変更ギズモを表示状態に戻します。
 */
export function initializeClipboardState() {
    clipboardData = null;
    hasData = false;
    console.log("[ClipboardState] クリップボードを初期化しました。");
    setSizeGizmosVisibility(true); // サイズ変更ギズモ表示
}

/**
 * クリップボードにデータを設定します。
 * 同時にサイズ変更ギズモを非表示にします。
 * @param {Array<CopiedBlockData>} copiedBlocksData - コピーされたブロックデータの配列。
 * @param {THREE.Vector3} originPoint - コピー元の基準点 (通常は選択範囲の中心)。
 */
export function setClipboardData(copiedBlocksData, originPoint) {
    if (!Array.isArray(copiedBlocksData) || !(originPoint instanceof THREE.Vector3)) {
        console.error("[ClipboardState] setClipboardData: 無効な引数です。");
        return;
    }
    clipboardData = {
        blocks: copiedBlocksData, // 渡された配列をそのまま格納
        origin: originPoint.clone() // 基準点はクローンして保持
    };
    hasData = true;
    console.log(`[ClipboardState] クリップボードに ${copiedBlocksData.length} 個のブロックデータを設定しました。Origin:`, originPoint);
    // ★連携: サイズ変更ギズモを非表示にする
    setSizeGizmosVisibility(false);
    // クリップボード状態変更イベントを発行
    document.dispatchEvent(new CustomEvent('clipboardstatechange', { detail: { hasData: true } }));
}

/**
 * 現在のクリップボードデータを取得します。
 * 注意: 現在の実装では内部データへの参照を返します。回転操作などで変更される可能性があります。
 * @returns {ClipboardContent | null} クリップボードの内容、またはデータがない場合は null。
 */
export function getClipboardData() {
    return clipboardData;
}

/**
 * クリップボードのデータをクリアします。
 * 同時にサイズ変更ギズモを表示状態に戻します。
 */
export function clearClipboardData() {
    if (hasData) {
        clipboardData = null;
        hasData = false;
        console.log("[ClipboardState] クリップボードをクリアしました。");
        // ★連携: サイズ変更ギズモを表示に戻す
        setSizeGizmosVisibility(true);
        // クリップボード状態変更イベントを発行
        document.dispatchEvent(new CustomEvent('clipboardstatechange', { detail: { hasData: false } }));
    }
}

/**
 * クリップボードにデータが存在するかどうかを返します。
 * @returns {boolean} データがあれば true、なければ false。
 */
export function hasClipboard() {
    return hasData;
}

/**
 * クリップボード内のブロックデータを回転または反転させます。
 * コピー時の基準点 (`origin`) を中心として、各ブロックの位置と向きを更新します。
 * @param {'J'|'K'|'L'|'U'|'I'|'O'} key - 操作キー。
 */
export function transformClipboardData(key) {
    // データがない場合は何もしない
    if (!clipboardData || !clipboardData.blocks || clipboardData.blocks.length === 0) {
        console.log("[ClipboardState] クリップボードにデータがないため、回転/反転できません。");
        return;
    }

    // 1. 操作に対応する基本変換行列を取得
    let operationMatrixSource;
    switch (key) {
        case 'J': operationMatrixSource = rotJMatrix; break;
        case 'K': operationMatrixSource = rotKMatrix; break;
        case 'L': operationMatrixSource = rotLMatrix; break;
        case 'U': operationMatrixSource = flipUMatrix; break;
        case 'I': operationMatrixSource = flipIMatrix; break;
        case 'O': operationMatrixSource = flipOMatrix; break;
        default: console.warn(`transformClipboardData: 無効なキー ${key}`); return;
    }
    _rotateOrFlip.copy(operationMatrixSource); // 計算用変数にコピー

    // 2. 回転/反転の中心点 (= クリップボードの基準点) を取得
    _origin.copy(clipboardData.origin);
    _inverseOrigin.copy(_origin).negate(); // 中心を原点に移動させるベクトル

    // 3. グループ全体を回転/反転させるためのワールド変換行列を計算
    // transformMatrix = Translate(origin) * RotateOrFlip * Translate(-origin)
    _translateToOrigin.makeTranslation(_inverseOrigin.x, _inverseOrigin.y, _inverseOrigin.z);
    _translateBack.makeTranslation(_origin.x, _origin.y, _origin.z);
    _transformMatrix.copy(_translateBack).multiply(_rotateOrFlip).multiply(_translateToOrigin);

    // 4. クリップボード内の各 copiedBlockData に変換を適用
    clipboardData.blocks.forEach(copiedBlock => {
        // a) 位置の更新: newWorldPos = transformMatrix * oldWorldPos
        copiedBlock.position.applyMatrix4(_transformMatrix);
        // 注意: ここでは整数への丸めは行わない（ペースト時に行う）

        // b) 回転行列の更新: newWorldRot = RotateOrFlip * oldWorldRot
        // 各ブロックのローカル座標系に対して回転/反転を適用
        copiedBlock.rotationMatrix.premultiply(_rotateOrFlip);
    });

    console.log(`[ClipboardState] クリップボード内のデータを ${key} で回転/反転しました。`);

    // TODO (任意): クリップボード内容が変更されたことを示すイベントを発行する？
    // document.dispatchEvent(new CustomEvent('clipboarddatatransformed'));
}

// アプリケーション起動時に初期化する (main.js で import して呼び出すべき)
// initializeClipboardState();