/**
 * @fileoverview ファイル読み込み機能を提供します。
 * 元の fileHandler.js から loadFileAsText 関数を分離。
 */

/**
 * ユーザーが選択したファイルオブジェクトを読み込み、内容をテキストとして返します。
 * @param {File} file - ユーザーが選択したファイルオブジェクト。
 * @returns {Promise<string>} ファイルの内容 (XML文字列) を解決するPromise。
 */
export function loadFileAsText(file) {
    return new Promise((resolve, reject) => {
        // ファイルオブジェクトが存在しない場合はエラー
        if (!file) {
            reject(new Error('ファイルが選択されていません。'));
            return;
        }
        // FileReaderを使ってテキストとして読み込む
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result); // 成功時
        reader.onerror = (event) => {                         // 失敗時
            console.error("[FileLoader] ファイル読み込みエラー:", event.target.error);
            reject(new Error('ファイルの読み込みに失敗しました。'));
        };
        reader.readAsText(file); // 読み込み開始
    });
}