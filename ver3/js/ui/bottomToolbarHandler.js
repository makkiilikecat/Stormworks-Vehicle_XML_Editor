/**
 * @fileoverview 下ツールバー (#bottom-toolbar) のUI要素とインタラクションを管理します。
 * 主にインベントリ開閉ボタンと、ツールバー自体の表示状態（インベントリ表示時の位置調整）を扱います。
 * ホットバーアイテムの処理は hotbarManager.js が担当します。
 */

// --- 必要なモジュールや関数をインポート ---
// import { isInventoryVisible, setInventoryVisibility } from './inventoryPanelHandler.js'; // ★ 将来的に連携

// --- モジュール内変数 ---
let appState = null;
let inventoryVisible = false; // ★ インベントリ表示状態はここで管理 (暫定、panelHandlerと連携推奨)

// --- DOM要素キャッシュ ---
let bottomToolbar = null;
let toggleInventoryButton = null;
let inventoryPanel = null; // 位置調整のために参照が必要な場合
let inventoryOverlay = null; // 表示切替のために参照が必要

/**
 * 下ツールバーの初期化を行います。DOM要素への参照取得とイベントリスナー設定。
 * @param {object} appStateRef - アプリケーション状態オブジェクトへの参照。
 */
export function initializeBottomToolbar(appStateRef) {
    console.log("[BottomToolbarHandler] 初期化中...");
    appState = appStateRef;

    // --- DOM要素を取得 ---
    bottomToolbar = document.getElementById('bottom-toolbar');
    toggleInventoryButton = document.getElementById('toggle-inventory-button');
    inventoryPanel = document.getElementById('inventory-panel'); // 他モジュール管理だが参照取得
    inventoryOverlay = document.getElementById('inventory-overlay'); // 他モジュール管理だが参照取得

    // --- イベントリスナー設定 ---
    toggleInventoryButton?.addEventListener('click', () => toggleInventory()); // 開閉処理を呼び出す
    inventoryOverlay?.addEventListener('click', () => toggleInventory(false)); // オーバーレイクリックで閉じる

    // --- 初期状態設定 ---
    // 初期はインベントリ非表示
    bottomToolbar?.classList.remove('lowered');
    inventoryPanel?.classList.remove('visible');
    inventoryOverlay?.classList.remove('visible');

    console.log("[BottomToolbarHandler] 初期化完了。");
}


/**
 * インベントリパネルの表示/非表示を切り替えます。
 * オーバーレイ表示や下部ツールバーの位置調整も連動させます。
 * ★注意: 本来は inventoryPanelHandler と連携すべき処理です。
 * @param {boolean | null} [forceState=null] - 強制的に設定する状態 (true:表示, false:非表示)。nullならトグル。
 * @private
 */
function toggleInventory(forceState = null) {
    const shouldBeVisible = forceState !== null ? forceState : !inventoryVisible;
    if (shouldBeVisible === inventoryVisible) return; // 状態変化なし

    inventoryPanel?.classList.toggle('visible', shouldBeVisible);
    inventoryOverlay?.classList.toggle('visible', shouldBeVisible);
    bottomToolbar?.classList.toggle('lowered', shouldBeVisible);
    inventoryVisible = shouldBeVisible;
    console.log(`[BottomToolbarHandler -> toggleInventory] インベントリ表示: ${inventoryVisible}`);

    // インベントリ表示中はカメラコントロールを無効化 (uiInteractions.js から移動)
    if (appState?.controls) {
         const isStickDragging = false; // TODO: スティックドラッグ状態の取得
         appState.controls.enabled = !inventoryVisible && !isStickDragging;
    }

    // ★ 将来的には inventoryPanelHandler の関数を呼び出す
    // setInventoryVisibility(shouldBeVisible);
}

/**
 * 外部からインベントリの表示状態を同期するための関数（例：モード変更時など）
 * @param {boolean} isVisible
 */
export function syncInventoryVisibility(isVisible) {
    if (inventoryVisible !== isVisible) {
        toggleInventory(isVisible);
    }
}