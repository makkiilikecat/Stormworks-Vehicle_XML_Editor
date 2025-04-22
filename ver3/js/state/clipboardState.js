/**
 * @fileoverview コピー/カットされたブロックデータのクリップボード状態を管理します。
 * クリップボードの状態に応じて、関連するUI（サイズ変更ギズモなど）の表示制御も行います。
 */

import * as THREE from 'three'; // Vector3のため
// ギズモレンダラーからサイズ変更ギズモの表示/非表示関数をインポート
import { setSizeGizmosVisibility } from '../rendering/rangeGizmoRenderer.js';

// --- モジュール内変数 ---

/**
 * クリップボードに格納されるデータ形式の定義 (TypeScript風コメント)。
 * @typedef {object} ClipboardContent
 * @property {Array<CopiedBlockData>} blocks - コピーされたブロックデータの配列。各要素は CopiedBlockData 型。
 * @property {THREE.Vector3} origin - コピー元の選択範囲の中心点など、ペースト時の基準となる点 (ワールド座標)。
 */

/**
 * クリップボードに格納される個々のブロックデータの形式定義 (TypeScript風コメント)。
 * 元の BlockData から必要な情報をディープコピーし、ワールド座標系で保持します。
 * @typedef {object} CopiedBlockData
 * @property {string} definitionId - ブロック定義ID ('d'属性値)。
 * @property {number[]} colorIndices - 色インデックスの配列。
 * @property {THREE.Vector3} position - コピー時のブロックのワールド座標。
 * @property {THREE.Matrix4} rotationMatrix - コピー時のブロックのワールド回転行列 (スケール/せん断含む)。
 * @property {number} originalId - (任意) コピー元の BlockData のユニークID。
 */

/** @type {ClipboardContent | null} 現在のクリップボードの内容。データがない場合は null。 */
let clipboardData = null;

/** @type {boolean} クリップボードにデータが存在するかを示すフラグ。 */
let hasData = false;

// --- 公開関数 ---

/**
 * クリップボードの状態を初期化します。
 * アプリケーション起動時や、クリップボードが不要になった際に呼び出されます。
 * 同時にサイズ変更ギズモを表示状態に戻します。
 */
export function initializeClipboardState() {
    clipboardData = null; // データを空にする
    hasData = false;      // フラグをfalseに
    console.log("[ClipboardState] クリップボードを初期化しました。");
    // サイズ変更ギズモを有効化（表示）する
    setSizeGizmosVisibility(true);
    // 状態変化イベントを発行 (必要であれば)
    // document.dispatchEvent(new CustomEvent('clipboardstatechange', { detail: { hasData: false } }));
}

/**
 * クリップボードにデータを設定します。
 * 呼び出し元でディープコピーされたデータを渡す必要があります。
 * 同時にサイズ変更ギズモを非表示にします（ペースト操作に備えるため）。
 * @param {Array<CopiedBlockData>} copiedBlocksData - コピーされたブロックデータの配列。
 * @param {THREE.Vector3} originPoint - コピー元の基準点 (通常は選択範囲の中心)。
 */
export function setClipboardData(copiedBlocksData, originPoint) {
    // 引数の型チェック (簡易)
    if (!Array.isArray(copiedBlocksData) || !(originPoint instanceof THREE.Vector3)) {
        console.error("[ClipboardState] setClipboardData: 無効な引数が渡されました。");
        return;
    }
    // クリップボードデータを設定
    clipboardData = {
        blocks: copiedBlocksData,        // ブロックデータ配列 (参照渡し)
        origin: originPoint.clone()      // 基準点はクローンして保持
    };
    hasData = true; // データありフラグを設定
    console.log(`[ClipboardState] クリップボードに ${copiedBlocksData.length} 個のブロックデータを設定しました。基準点:`, originPoint);

    // クリップボードにデータが入ったら、サイズ変更ギズモを非表示にする
    setSizeGizmosVisibility(false);

    // クリップボード状態変更イベントを発行
    document.dispatchEvent(new CustomEvent('clipboardstatechange', { detail: { hasData: true } }));
}

/**
 * 現在のクリップボードデータを取得します。
 * @returns {ClipboardContent | null} クリップボードの内容、またはデータがない場合は null。
 * 注意: 返されるオブジェクト内の配列やベクトルは参照であるため、外部での変更が可能です。
 * 不変性を保証したい場合は、ディープコピーして返す必要があります。
 */
export function getClipboardData() {
    return clipboardData;
}

/**
 * クリップボードのデータをクリアします。
 * 同時にサイズ変更ギズモを表示状態に戻します。
 */
export function clearClipboardData() {
    // データが存在する場合のみクリア処理を実行
    if (hasData) {
        clipboardData = null;
        hasData = false;
        console.log("[ClipboardState] クリップボードをクリアしました。");

        // クリップボードが空になったら、サイズ変更ギズモを表示に戻す
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

// --- 初期化実行 ---
// モジュールロード時に一度だけ初期化を実行
initializeClipboardState();