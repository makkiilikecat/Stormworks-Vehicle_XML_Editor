import { EditMode } from '../state/editMode.js'; // モード定義をインポート

// モード表示用テキスト要素への参照
const modeTextElement = document.getElementById('current-mode-text');

// モード名と表示名の対応表
const modeDisplayNames = {
    [EditMode.NORMAL]: '通常',
    [EditMode.DELETE]: '削除 (X)',
    [EditMode.XML_EDIT]: 'XML編集 (Shift+E)',
    [EditMode.RANGE_SELECT]: '範囲選択 (Shift+S)',
    [EditMode.PAINT]: 'ペイント (Shift+C)'
};

/**
 * 画面右上のモード表示UIを更新します。
 * @param {EditMode} currentMode - 現在の編集モード。
 */
export function updateModeIndicator(currentMode) {
    if (modeTextElement) {
        modeTextElement.textContent = modeDisplayNames[currentMode] || '不明';
    } else {
        console.error("Mode indicator element not found.");
    }
}