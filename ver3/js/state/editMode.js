/**
 * 利用可能な編集モードを定義するオブジェクト。
 * @enum {string}
 */
export const EditMode = {
    NORMAL: 'NORMAL',         // 通常モード (配置)
    DELETE: 'DELETE',         // 削除モード
    XML_EDIT: 'XML_EDIT',     // XML編集モード (回転行列操作)
    RANGE_SELECT: 'RANGE_SELECT', // 範囲選択モード
    PAINT: 'PAINT'            // ペイントモード
};

// 現在の編集モードを保持する変数 (初期値は通常モード)
let currentMode = EditMode.NORMAL;

/**
 * 現在の編集モードを取得します。
 * @returns {EditMode} 現在のモード。
 */
export function getCurrentMode() {
    return currentMode;
}

/**
 * 新しい編集モードを設定します。
 * モード変更のイベントディスパッチなどはここに追加可能。
 * @param {EditMode} newMode - 設定する新しいモード。
 */
export function setEditMode(newMode) {
    if (Object.values(EditMode).includes(newMode)) {
        if (currentMode !== newMode) {
            console.log(`モード変更: ${currentMode} -> ${newMode}`);
            currentMode = newMode;
            // TODO: モード変更に伴うUI更新などをトリガーするイベントを発行する
            // (例: document.dispatchEvent(new CustomEvent('editmodechange', { detail: { mode: newMode } })));
        }
    } else {
        console.warn(`無効な編集モードが指定されました: ${newMode}`);
    }
}

/**
 * 指定されたモードがブロック選択を許可するかどうかを返します。
 * @param {EditMode} mode - チェックするモード。
 * @returns {boolean} 選択が許可される場合はtrue。
 */
export function allowsBlockSelection(mode) {
    // XML編集モードと通常モード(将来的に選択したブロックを基点に配置する場合など)で選択可能とする
    return mode === EditMode.XML_EDIT || mode === EditMode.NORMAL;
}

/**
 * 指定されたモードがブロック配置を許可するかどうかを返します。
 * @param {EditMode} mode - チェックするモード。
 * @returns {boolean} 配置が許可される場合はtrue。
 */
export function allowsBlockPlacement(mode) {
    return mode === EditMode.NORMAL;
}

// 他のモードに関する判定関数も必要に応じて追加...