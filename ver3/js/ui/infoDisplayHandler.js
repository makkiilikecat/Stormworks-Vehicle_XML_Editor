/**
 * @fileoverview 左上の情報表示エリア (#info-display) の内容を管理・更新します。
 * 総ブロック数、合計質量、合計コスト、バウンディングボックスサイズを表示します。
 * main.js や fileHandlers.js から updateInfoDisplay が呼び出されます。
 */

import * as THREE from 'three'; // Box3, Vector3のため
// blockDefinitions から必要な関数を直接インポート
import { getBlockDefinition } from '../data/blockDefinitions.js';

// --- DOM要素キャッシュ ---
// 各情報表示用<span>要素への参照を保持
let blockCountElement = null;
let massElement = null;
let costElement = null;
let sizeXElement = null, sizeXmElement = null;
let sizeYElement = null, sizeYmElement = null;
let sizeZElement = null, sizeZmElement = null;

// --- 計算用一時変数 (メモリ確保削減) ---
/** バウンディングボックス計算用 */
const _box = new THREE.Box3();
/** ボックスサイズ取得用 */
const _size = new THREE.Vector3();
/** ブロックがない場合のデフォルト中心点 */
const _vectorZero = new THREE.Vector3(0, 0, 0);

/**
 * 情報表示エリア関連のDOM要素への参照を取得し、初期表示を行います。
 * main.js の init 関数から呼び出されます。
 */
export function initializeInfoDisplay() {
    console.log("[InfoDisplay] 初期化中...");
    // 各表示要素のDOMを取得
    blockCountElement = document.getElementById('info-block-count');
    massElement = document.getElementById('info-mass');
    costElement = document.getElementById('info-cost');
    sizeXElement = document.getElementById('size-x');
    sizeXmElement = document.getElementById('size-x-m');
    sizeYElement = document.getElementById('size-y');
    sizeYmElement = document.getElementById('size-y-m');
    sizeZElement = document.getElementById('size-z');
    sizeZmElement = document.getElementById('size-z-m');

    // DOM要素が見つかるか確認 (見つからない場合はエラーログ)
    if (!blockCountElement || !massElement || !costElement || !sizeXElement || !sizeYElement || !sizeZElement || !sizeXmElement || !sizeYmElement || !sizeZmElement) {
        console.error("[InfoDisplay] 情報表示用のDOM要素の一部が見つかりません。index.htmlを確認してください。");
    } else {
        console.log("[InfoDisplay] 初期化完了。");
        // アプリケーション起動時の初期表示 (ブロック数0の状態)
        updateInfoDisplay([]);
    }
}

/**
 * 現在のブロックリストに基づいて、情報表示エリアの内容 (総ブロック数, 質量, コスト, サイズ) を更新します。
 * ブロック構成が変更されるたびに main.js や fileHandlers.js から呼び出されます。
 * @param {BlockData[]} loadedBlocks - 現在ロードされているブロックデータの配列。
 */
export function updateInfoDisplay(loadedBlocks) {
    // DOM要素が初期化前なら何もしない
    if (!blockCountElement) {
        console.warn("[InfoDisplay] DOM要素が未初期化のため更新をスキップします。");
        return;
    }
    // 引数で渡されたデータが配列か確認
    if (!Array.isArray(loadedBlocks)) {
        console.error("[InfoDisplay] updateInfoDisplay: loadedBlocks が配列ではありません。", loadedBlocks);
        loadedBlocks = []; // 安全のため空配列として扱う
    }

    // --- 変数の初期化 ---
    let totalBlocks = 0; // 総ブロック数
    let totalMass = 0;   // 合計質量
    let totalCost = 0;   // 合計コスト
    let sizeX = 0, sizeY = 0, sizeZ = 0; // サイズ (ブロック単位)
    const blockPositions = []; // バウンディングボックス計算用の位置配列

    // --- ブロックが存在する場合の計算 ---
    if (loadedBlocks.length > 0) {
        totalBlocks = loadedBlocks.length; // 総ブロック数

        _box.makeEmpty(); // バウンディングボックスをリセット

        // 各ブロックの情報を集計
        loadedBlocks.forEach(blockData => {
            // ブロック定義を取得 (IDが見つからなければ default 定義が返る)
            const def = getBlockDefinition(blockData.definitionId);
            // 質量とコストを加算 (定義になければ0を加算)
            totalMass += def.mass || 0;
            totalCost += def.cost || 0;
            // 位置情報をバウンディングボックス計算用に収集
            blockPositions.push(blockData.position);
        });

        // バウンディングボックスを計算
        if (blockPositions.length > 0) {
            _box.setFromPoints(blockPositions); // 全ブロックの位置を含む最小ボックスを計算

            // 整数座標基準でのサイズを計算 (min/maxを丸めて差を取り、1を加算)
            // これにより、1ブロックだけでもサイズは 1x1x1 となる
            const minX = Math.round(_box.min.x); const maxX = Math.round(_box.max.x);
            const minY = Math.round(_box.min.y); const maxY = Math.round(_box.max.y);
            const minZ = Math.round(_box.min.z); const maxZ = Math.round(_box.max.z);
            // 最小サイズは1ブロックとする
            sizeX = Math.max(1, maxX - minX + 1);
            sizeY = Math.max(1, maxY - minY + 1);
            sizeZ = Math.max(1, maxZ - minZ + 1);
        }
        // 位置情報がないブロックのみの場合は size は 0 のまま
    }

    // --- 計算結果をDOM要素に設定 ---
    // 各要素が存在するか確認しつつ値を設定
    if (blockCountElement) blockCountElement.textContent = totalBlocks.toLocaleString(); // 桁区切り表示
    if (massElement) massElement.textContent = totalMass.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }); // 小数第2位まで表示
    if (costElement) costElement.textContent = totalCost.toLocaleString(); // 桁区切り表示
    if (sizeXElement) sizeXElement.textContent = sizeX;
    if (sizeXmElement) sizeXmElement.textContent = (sizeX * 0.25).toFixed(2); // 1ブロック=0.25m換算
    if (sizeYElement) sizeYElement.textContent = sizeY;
    if (sizeYmElement) sizeYmElement.textContent = (sizeY * 0.25).toFixed(2);
    if (sizeZElement) sizeZElement.textContent = sizeZ;
    if (sizeZmElement) sizeZmElement.textContent = (sizeZ * 0.25).toFixed(2);

    // 更新完了ログ (頻繁に呼ばれるため、デバッグ時以外はコメントアウト推奨)
    // console.log("[InfoDisplay] 情報表示を更新しました。");
}