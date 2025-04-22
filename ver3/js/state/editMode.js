/**
 * @fileoverview アプリケーションの編集モード状態を管理します。
 */

/**
 * 利用可能な編集モードを定義するオブジェクト。
 * 各モードは一意の文字列で識別されます。
 * @enum {string}
 */
export const EditMode = {
    NORMAL: 'NORMAL',         // 通常モード (ブロック配置)
    DELETE: 'DELETE',         // 削除モード
    XML_EDIT: 'XML_EDIT',     // XML編集モード (数値編集、ドラッグ変形)
    RANGE_SELECT: 'RANGE_SELECT', // 範囲選択モード
    PAINT: 'PAINT'            // ペイントモード (未実装)
};

// --- モジュール内変数 ---
// 現在の編集モードを保持 (初期値は通常モード)
let currentMode = EditMode.NORMAL;

// --- 公開関数 ---

/**
 * 現在の編集モードを取得します。
 * @returns {EditMode} 現在のモード。
 */
export function getCurrentMode() {
    return currentMode;
}

/**
 * 新しい編集モードを設定します。
 * モードが実際に変更された場合、'editmodechange' カスタムイベントを発行します。
 * @param {EditMode} newMode - 設定する新しいモード。EditMode enumのいずれかの値である必要があります。
 */
export function setEditMode(newMode) {
    // newModeがEditModeで定義された値か確認
    if (Object.values(EditMode).includes(newMode)) {
        // 現在のモードと異なる場合のみ処理
        if (currentMode !== newMode) {
            const oldMode = currentMode; // 変更前のモードを保持
            currentMode = newMode;       // 新しいモードを設定
            console.log(`[EditMode] モード変更: ${oldMode} -> ${newMode}`);
            // モード変更イベントを発行 (詳細情報として新旧モードを渡す)
            document.dispatchEvent(new CustomEvent('editmodechange', {
                detail: { newMode: currentMode, oldMode: oldMode }
            }));
        }
    } else {
        // 無効なモードが指定された場合は警告
        console.warn(`[EditMode] 無効な編集モードが指定されました: ${newMode}`);
    }
}

/**
 * 指定されたモードがブロック選択 (クリックによるハイライト操作) を許可するかどうかを返します。
 * @param {EditMode} mode - チェックするモード。
 * @returns {boolean} 選択が許可される場合はtrue。
 */
export function allowsBlockSelection(mode) {
    // XML編集モードでのみクリックによる選択を許可する
    return mode === EditMode.XML_EDIT;
}

/**
 * 指定されたモードがブロック配置を許可するかどうかを返します。
 * @param {EditMode} mode - チェックするモード。
 * @returns {boolean} 配置が許可される場合はtrue。
 */
export function allowsBlockPlacement(mode) {
    // 通常モードでのみブロック配置を許可
    return mode === EditMode.NORMAL;
}

/**
 * 指定されたモードがブロック削除を許可するかどうかを返します。
 * @param {EditMode} mode - チェックするモード。
 * @returns {boolean} 削除が許可される場合はtrue。
 */
export function allowsBlockRemoval(mode) { // 関数名を allowsBlockRemoval に変更 (より一般的)
    // 削除モードでのみブロック削除を許可
    return mode === EditMode.DELETE;
}

/**
 * 指定されたモードがペイント操作を許可するかどうかを返します。
 * @param {EditMode} mode - チェックするモード。
 * @returns {boolean} ペイントが許可される場合はtrue。
 */
export function allowsPainting(mode) {
    // ペイントモードでのみペイント操作を許可
    return mode === EditMode.PAINT;
}