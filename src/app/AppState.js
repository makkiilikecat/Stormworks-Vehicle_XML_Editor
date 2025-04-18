// src/app/AppState.js

let state = {
    isDeleteMode: false,
    isXmlEditMode: false, // ★追加
    selectedBlockId: null, // ★追加 (単一選択)
};
let listeners = []; // ★追加: 状態変更リスナー

/**
 * アプリケーションの状態を初期化します。
 */
export function initializeAppState() {
    state = {
        isDeleteMode: false,
    };
    console.log("App state initialized.");
}


// ★追加: 状態変更を通知するヘルパー
const notifyListeners = (changedState) => {
    listeners.forEach(listener => listener(changedState, state));
};

// ★追加: 状態変更リスナーを登録
export function addStateChangeListener(listener) {
    listeners.push(listener);
}

export function setDeleteMode(value) {
    if (typeof value === 'boolean' && state.isDeleteMode !== value) {
        state.isDeleteMode = value;
        if (value) state.isXmlEditMode = false; // 排他制御
        document.body.style.cursor = value ? 'crosshair' : 'default';
        notifyListeners({ isDeleteMode: value }); // ★通知
    }
}
export function isDeleteModeActive() { return state.isDeleteMode; }

// ★追加: XML編集モード
export function setXmlEditMode(value) {
    if (typeof value === 'boolean' && state.isXmlEditMode !== value) {
        state.isXmlEditMode = value;
        if (value) state.isDeleteMode = false; // 排他制御
        console.log(`XML Edit Mode: ${value ? 'ON' : 'OFF'}`);
        // TODO: モードに応じたUI変更 (例: 選択解除、カーソル変更など)
        if (!value) setSelectedBlockId(null); // モード解除時に選択解除
        notifyListeners({ isXmlEditMode: value }); // ★通知
    }
}
export function isXmlEditModeActive() { return state.isXmlEditMode; }

// ★追加: 選択中ブロックID
export function setSelectedBlockId(blockId) {
    // null または 有効なID文字列
    if (state.selectedBlockId !== blockId) {
        state.selectedBlockId = blockId;
        console.log("Selected Block ID:", blockId);
        notifyListeners({ selectedBlockId: blockId }); // ★通知
    }
}
export function getSelectedBlockId() { return state.selectedBlockId; }