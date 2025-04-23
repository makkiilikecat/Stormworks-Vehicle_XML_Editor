/**
 * @fileoverview 画面右上に表示される現在の編集モード表示UIを更新する機能を提供します。
 * main.js や uiInteractions.js などから呼び出されます。
 */

// 編集モードの定義情報をインポート
import { EditMode } from '../state/editMode.js';

// --- DOM要素キャッシュ ---

/**
 * モード名を表示する<span>要素への参照。
 * @type {HTMLElement | null}
 */
const modeTextElement = document.getElementById('current-mode-text');

// --- 定数 ---

/**
 * EditMode の各モードに対応する日本語表示名を定義するオブジェクト。
 * 不明なモードの場合は '不明' と表示されます。
 * @type {Object<EditMode, string>}
 */
const modeDisplayNames = {
    [EditMode.NORMAL]: '通常',
    [EditMode.DELETE]: '削除 (X)',
    [EditMode.XML_EDIT]: 'XML編集 (Shift+E)',
    [EditMode.RANGE_SELECT]: '範囲選択 (Shift+S)',
    [EditMode.PAINT]: 'ペイント (Shift+C)' // ペイントモードの表示名
    // 他のモードを追加する場合はここに追加
};

// --- 公開関数 ---

/**
 * 画面右上のモード表示UI（<span>要素）の内容を、現在の編集モードに合わせて更新します。
 * @param {EditMode} currentMode - 表示を更新する対象の現在の編集モード。
 */
export function updateModeIndicator(currentMode) {
    // DOM要素が正しく取得できているか確認
    if (modeTextElement) {
        // modeDisplayNames オブジェクトから対応する表示名を取得
        // 対応する表示名が見つからない場合は '不明' を表示
        modeTextElement.textContent = modeDisplayNames[currentMode] || '不明';
    } else {
        // 要素が見つからない場合はエラーログを出力
        console.error("[ModeIndicator] モード表示用のDOM要素 (#current-mode-text) が見つかりません。");
    }
}

// --- 初期化 ---
// アプリケーション起動時に一度、現在のモードで表示を更新することが推奨されます。
// 例: main.js の init 内で updateModeIndicator(getCurrentMode()); を呼び出す。
// このファイル自体には初期化処理は含めません。