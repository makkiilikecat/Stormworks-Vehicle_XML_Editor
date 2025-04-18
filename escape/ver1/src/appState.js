// アプリケーションの状態を管理するモジュール

let state = {
    isDeleteMode: false,
    // 他の状態も必要に応じて追加 (例: isPaintMode, selectedBlockId, etc.)
};

/**
 * アプリケーションの状態を初期化します。
 */
export function initializeAppState() {
    state = {
        isDeleteMode: false,
    };
    console.log("App state initialized.");
}

/**
 * 削除モードの状態を設定します。
 * @param {boolean} value - trueなら削除モード有効、falseなら無効
 */
export function setDeleteMode(value) {
    if (typeof value === 'boolean' && state.isDeleteMode !== value) {
        state.isDeleteMode = value;
        console.log(`Delete Mode: ${state.isDeleteMode ? 'ON' : 'OFF'}`);
        // UIに状態を反映させる処理をここに追加してもよい (例: カーソル変更)
        document.body.style.cursor = state.isDeleteMode ? 'crosshair' : 'default';
    }
}

/**
 * 現在削除モードが有効かどうかを返します。
 * @returns {boolean}
 */
export function isDeleteModeActive() {
    return state.isDeleteMode;
}

// 必要に応じて他の状態へのアクセサ関数を追加