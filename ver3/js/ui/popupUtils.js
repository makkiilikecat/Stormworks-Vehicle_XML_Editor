/**
 * @fileoverview 汎用的なポップアップメッセージ表示機能を提供します。
 */

/**
 * ポップアップメッセージを表示します。メッセージは一定時間後に自動的に消えます。
 * @param {string} message - 表示するメッセージテキスト。
 * @param {'info' | 'success' | 'warning' | 'error'} [type='info'] - メッセージの種類 (スタイルに影響)。
 * @param {number} [duration=3000] - メッセージが表示される時間 (ミリ秒)。
 */
export function showPopup(message, type = 'info', duration = 3000) {
    // 1. ポップアップ要素を作成
    const popupElement = document.createElement('div');
    popupElement.classList.add('popup-message', `popup-${type}`); // 基本クラスとタイプ別クラスを追加
    popupElement.textContent = message; // メッセージ内容を設定

    // 2. Body要素の末尾に追加
    document.body.appendChild(popupElement);

    // 3. フェードインアニメーションを開始 (少し遅らせてCSS Transitionを発動)
    requestAnimationFrame(() => {
        popupElement.classList.add('show');
    });

    // 4. 指定時間後にフェードアウト＆削除タイマーを設定
    setTimeout(() => {
        popupElement.classList.remove('show'); // フェードアウト開始
        // フェードアウトアニメーション完了後に要素を削除
        popupElement.addEventListener('transitionend', () => {
            if (popupElement.parentElement) { // まだ削除されていなければ削除
                popupElement.parentElement.removeChild(popupElement);
            }
        }, { once: true }); // イベントリスナーを一度だけ実行
    }, duration);

    console.log(`[Popup] 表示 (${type}): ${message}`);
}

/**
 * (オプション) 全ての表示中ポップアップを強制的に非表示にする関数
 */
export function hideAllPopups() {
    document.querySelectorAll('.popup-message.show').forEach(popup => {
        popup.classList.remove('show');
        // 即座に削除するか、アニメーション終了を待つかは設計次第
        if (popup.parentElement) {
            popup.parentElement.removeChild(popup);
        }
    });
}

// 初期化処理 (必要であれば)
// export function initializePopups() { ... }