/**
 * @fileoverview ペイントモードの状態（選択中のツール、色など）を管理します。
 * 状態変更時にカスタムイベント ('painttoolchanged', 'paintcolorchanged') を発行し、
 * UIや他のモジュールとの連携を可能にします。
 */

// --- 定数 ---

/**
 * 利用可能なペイントツールの種類を定義する Enum ライクなオブジェクト。
 * @enum {string}
 */
export const PaintTool = {
    /** 面の色 (sc, bc) を塗る */
    NORMAL: 'normal',
    /** Additive Color (ac) を塗る */
    SPECIAL: 'special',
    /** シーン全体の特定色を置き換える */
    REPLACE: 'replace'
};

/**
 * アプリケーション起動時やリセット時に適用されるデフォルトのペイントツール。
 * @type {PaintTool}
 */
const DEFAULT_PAINT_TOOL = PaintTool.NORMAL;

/**
 * アプリケーション起動時やリセット時に適用されるデフォルトの選択色。
 * Stormworks のデフォルトグレーに近い色を想定。
 * @type {string} 6桁の16進数色コード (例: "C2C3C7")
 */
const DEFAULT_COLOR = "C2C3C7";

// --- モジュール内変数 ---

/**
 * 現在選択されているペイントツール。
 * @type {PaintTool}
 */
let currentPaintTool = DEFAULT_PAINT_TOOL;

/**
 * 現在選択されている色コード (6桁の16進数文字列、例: "FF0000")。
 * @type {string}
 */
let currentColor = DEFAULT_COLOR;

// --- 公開関数 ---

/**
 * 現在選択されているペイントツールを取得します。
 * @returns {PaintTool} 現在のペイントツール。
 */
export function getCurrentPaintTool() {
    return currentPaintTool;
}

/**
 * ペイントツールを設定します。
 * ツールが実際に変更された場合、'painttoolchanged' カスタムイベントを発行します。
 * @param {PaintTool} tool - 設定する新しいペイントツール。PaintTool enum の値である必要があります。
 */
export function setCurrentPaintTool(tool) {
    // 指定された tool が PaintTool enum に定義されている値か確認
    if (Object.values(PaintTool).includes(tool)) {
        // 現在のツールと異なる場合のみ更新とイベント発行
        if (currentPaintTool !== tool) {
            const oldTool = currentPaintTool;
            currentPaintTool = tool;
            console.log(`[PaintState] ペイントツール変更: ${oldTool} -> ${currentPaintTool}`);
            // ツール変更イベントを発行
            document.dispatchEvent(new CustomEvent('painttoolchanged', {
                detail: { newTool: currentPaintTool, oldTool: oldTool }
            }));
        }
    } else {
        // 無効なツールが指定された場合は警告
        console.warn(`[PaintState] 無効なペイントツールが指定されました: ${tool}`);
    }
}

/**
 * 現在選択されている色を取得します。
 * @returns {string} 現在の色コード (6桁の16進数文字列、例: "FF0000")。
 */
export function getCurrentColor() {
    return currentColor;
}

/**
 * 選択色を設定します。
 * 色が実際に変更された場合、'paintcolorchanged' カスタムイベントを発行します。
 * 色コードは検証され、6桁の16進数文字列に正規化されます。無効な場合は設定されません。
 * @param {string} colorCode - 設定する色コード (例: "FF0000", "#FF0000")。
 * @returns {boolean} 色の設定/正規化に成功した場合は true、失敗した場合は false。
 */
export function setCurrentColor(colorCode) {
    // 色コードを検証・正規化
    // 1. 先頭の # があれば除去
    // 2. 大文字に変換
    // 3. 6桁の16進数文字 (0-9, A-F) かどうか正規表現でテスト
    let normalizedColor = colorCode ? colorCode.toUpperCase().replace('#', '') : null;
    const validHex = /^[0-9A-F]{6}$/;

    if (normalizedColor && validHex.test(normalizedColor)) {
        // 正規化された有効な色コードの場合
        if (currentColor !== normalizedColor) {
            const oldColor = currentColor;
            currentColor = normalizedColor; // 新しい色を設定
            console.log(`[PaintState] 選択色変更: ${oldColor} -> ${currentColor}`);
            // 色変更イベントを発行
            document.dispatchEvent(new CustomEvent('paintcolorchanged', {
                detail: { newColor: currentColor, oldColor: oldColor }
            }));
            return true; // 成功
        }
        return true; // 変更はなかったが、指定された色は有効なので true を返す
    } else {
        // 無効な色コードの場合
        console.warn(`[PaintState] 無効な色コードが指定されました: ${colorCode}`);
        return false; // 失敗
    }
}

/**
 * PaintState を初期化します (オプション)。
 * アプリケーション起動時に呼び出し、デフォルト値を設定します。
 */
export function initializePaintState() {
    currentPaintTool = DEFAULT_PAINT_TOOL;
    currentColor = DEFAULT_COLOR;
    console.log("[PaintState] 初期化完了。");
    // 初期状態イベントの発行は任意
    // document.dispatchEvent(new CustomEvent('paintstateinitialized', { detail: { tool: currentPaintTool, color: currentColor } }));
}

// --- 初期化の呼び出し例 (通常は main.js や uiInitializer.js で行う) ---
// initializePaintState();