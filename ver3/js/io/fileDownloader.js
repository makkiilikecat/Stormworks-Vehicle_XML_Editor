/**
 * @fileoverview ファイルダウンロード機能を提供します。
 * 元の fileHandler.js から downloadXmlFile 関数を分離。
 */

/**
 * 指定されたテキストコンテンツをXMLファイルとしてダウンロードさせます。
 * @param {string} xmlString - ダウンロードするXMLの内容。
 * @param {string} [filename='vehicle.xml'] - ダウンロード時のデフォルトファイル名。
 */
export function downloadXmlFile(xmlString, filename = 'vehicle.xml') {
    try {
        // Blobオブジェクトを作成 (MIMEタイプをXMLに設定)
        const blob = new Blob([xmlString], { type: 'text/xml;charset=utf-8' });
        // ダウンロード用のURLを生成
        const url = URL.createObjectURL(blob);

        // 一時的な<a>要素（リンク）を作成
        const link = document.createElement('a');
        link.href = url;
        link.download = filename; // ダウンロードファイル名を設定

        // リンクをDOMに追加してプログラム的にクリックし、その後削除
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 生成したURLを解放
        URL.revokeObjectURL(url);
        console.log(`[FileDownloader] "${filename}" としてXMLファイルを保存しました。`);

    } catch (error) {
        console.error("[FileDownloader] ファイルのダウンロード中にエラーが発生しました:", error);
        // 必要に応じてユーザーにエラー通知を行う (例: showPopup)
        alert(`ファイルのダウンロードに失敗しました: ${error.message}`);
    }
}