/**
 * @fileoverview 左ツールバー (#left-toolbar) のUI要素（ペイント関連）とインタラクションを管理します。
 * paintState と連携し、ツール/色選択とUI表示の同期を行います。
 *
 * 【主な変更点 v4 (ペイントモード対応 Stage 4.4 Final)】
 * - paintState との連携を強化し、イベントリスナーによるUI同期処理を確実に実装。
 * - スライダー操作時、対応するカラーパレットがあればアクティブにする処理を追加。
 * - 初期化処理を paintState から取得した値で確実に実行するように修正。
 */

// --- 必要なモジュールや関数をインポート ---
import { PaintTool, getCurrentPaintTool, setCurrentPaintTool, getCurrentColor, setCurrentColor } from '../state/paintState.js';

// --- モジュール内変数 ---
let appState = null;
let rgbSlidersVisible = false;

// --- DOM要素キャッシュ ---
let leftToolbar = null;
let paintToolButtons = null; // NodeListOf<Element>
let colorPaletteContainer = null;
let colorSwatches = null; // NodeListOf<Element>
let toggleRgbSlidersButton = null;
let rgbSlidersContainer = null;
let sliderR = null, sliderG = null, sliderB = null;
let valueR = null, valueG = null, valueB = null;
let colorPreview = null;

/**
 * 左ツールバー（ペイント関連）の初期化を行います。
 * @param {object} appStateRef - アプリケーション状態オブジェクトへの参照。
 */
export function initializeLeftToolbar(appStateRef) {
    console.log("[LeftToolbarHandler] 初期化中...");
    appState = appStateRef;

    // --- DOM要素を取得 ---
    // (変更なし)
    leftToolbar = document.getElementById('left-toolbar');
    paintToolButtons = leftToolbar?.querySelectorAll('.paint-tool-button');
    colorPaletteContainer = document.getElementById('color-palette-container');
    colorSwatches = colorPaletteContainer?.querySelectorAll('.color-swatch');
    toggleRgbSlidersButton = document.getElementById('toggle-rgb-sliders-button');
    rgbSlidersContainer = document.getElementById('rgb-sliders-container');
    sliderR = document.getElementById('slider-r'); valueR = document.getElementById('value-r');
    sliderG = document.getElementById('slider-g'); valueG = document.getElementById('value-g');
    sliderB = document.getElementById('slider-b'); valueB = document.getElementById('value-b');
    colorPreview = document.getElementById('color-preview');

    if (!leftToolbar || !paintToolButtons || !colorSwatches || !toggleRgbSlidersButton || !sliderR) {
        console.error("[LeftToolbarHandler] 必須要素が見つかりません。");
        return;
    }

    // --- イベントリスナー設定 ---
    paintToolButtons.forEach(button => {
        button.addEventListener('click', () => handlePaintToolSelection(button));
    });
    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => handleColorSwatchSelection(swatch));
    });
    toggleRgbSlidersButton.addEventListener('click', toggleRgbSliders);
    const rgbSliders = [sliderR, sliderG, sliderB];
    rgbSliders.forEach(slider => {
        slider?.addEventListener('input', handleSliderInput);
    });

    // --- paintState の変更をリッスン ---
    document.addEventListener('painttoolchanged', (event) => updatePaintToolUI(event.detail.newTool));
    document.addEventListener('paintcolorchanged', (event) => updateColorUI(event.detail.newColor));

    // --- 初期状態設定 ---
    // paintState から初期値を取得してUIに反映
    const initialTool = getCurrentPaintTool();
    updatePaintToolUI(initialTool);

    const initialColor = getCurrentColor();
    updateColorUI(initialColor); // パレットとスライダーを初期化

    if (rgbSlidersContainer) rgbSlidersContainer.style.display = 'none';
    rgbSlidersVisible = false;
    toggleRgbSlidersButton?.classList.remove('active'); // 初期状態は非アクティブ

    console.log("[LeftToolbarHandler] 初期化完了。");
}

/** @private ペイントツール選択ボタンのクリック処理 */
function handlePaintToolSelection(selectedButton) {
    const tool = selectedButton.dataset.paintTool;
    setCurrentPaintTool(tool); // paintState を更新
}

/** @private カラーパレットの色見本ボタンのクリック処理 */
function handleColorSwatchSelection(selectedSwatch) {
    const color = selectedSwatch.dataset.color;
    if (color) {
        setCurrentColor(color); // paintState を更新
    }
}

/** @private RGBスライダーの input イベントハンドラ */
function handleSliderInput() {
    if (!sliderR || !sliderG || !sliderB) return;
    const r = parseInt(sliderR.value, 10);
    const g = parseInt(sliderG.value, 10);
    const b = parseInt(sliderB.value, 10);
    const hexColor = `${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

    // paintState を更新 (これにより 'paintcolorchanged' イベントが発行される)
    setCurrentColor(hexColor);

    // 値表示とプレビューは即時更新 (イベントを待たない)
    if(valueR) valueR.textContent = r;
    if(valueG) valueG.textContent = g;
    if(valueB) valueB.textContent = b;
    if(colorPreview) colorPreview.style.backgroundColor = `#${hexColor}`;
}

/** @private RGBスライダーの表示/非表示を切り替え */
function toggleRgbSliders() {
    rgbSlidersVisible = !rgbSlidersVisible;
    if (rgbSlidersContainer) {
        rgbSlidersContainer.style.display = rgbSlidersVisible ? 'flex' : 'none';
    }
    // ボタンのアクティブ状態もトグル
    toggleRgbSlidersButton?.classList.toggle('active', rgbSlidersVisible);
    console.log(`[UI] RGBスライダー表示: ${rgbSlidersVisible}`);
}

/**
 * ペイントツール変更時にUIを更新する (イベントハンドラ)
 * @param {PaintTool} newTool - 新しく選択されたツール
 * @private
 */
function updatePaintToolUI(newTool) {
    paintToolButtons?.forEach(button => {
        button.classList.toggle('active', button.dataset.paintTool === newTool);
    });
    // console.log(`[LeftToolbarHandler] Paint tool UI updated: ${newTool}`);
}

/**
 * 選択色変更時にUI (カラーパレット、RGBスライダー、プレビュー) を更新する (イベントハンドラ)
 * @param {string} newColor - 新しく選択された色コード (6桁16進数、例: "FF0000")
 * @private
 */
function updateColorUI(newColor) {
    if (!newColor) return;
    const newColorUpper = newColor.toUpperCase();

    // 1. カラーパレットのアクティブ状態更新
    let swatchMatches = false;
    colorSwatches?.forEach(swatch => {
        const swatchColor = swatch.dataset.color?.toUpperCase();
        const isActive = swatchColor === newColorUpper;
        swatch.classList.toggle('active', isActive);
        if (isActive) swatchMatches = true;
    });

    // 2. RGBスライダーとプレビュー更新
    try {
        updateSlidersFromColor(`#${newColorUpper}`);
    } catch(e) { console.error("Failed to update sliders from color:", e); }

    // console.log(`[LeftToolbarHandler] Color UI updated: #${newColorUpper}`);
}


/**
 * 指定された色コードでRGBスライダーとプレビューを更新 (内部ヘルパー)
 * @param {string} hexColor - 色コード (例: "#FF0000")
 * @private
 */
function updateSlidersFromColor(hexColor) {
    if (!sliderR || !sliderG || !sliderB || !valueR || !valueG || !valueB || !colorPreview) { return; }
    if (!hexColor || !hexColor.startsWith('#') || hexColor.length !== 7) { return; }
    try {
        const r = parseInt(hexColor.substring(1, 3), 16);
        const g = parseInt(hexColor.substring(3, 5), 16);
        const b = parseInt(hexColor.substring(5, 7), 16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) throw new Error("Invalid hex value");
        // スライダーの値と表示テキストを更新
        sliderR.value = r; valueR.textContent = r;
        sliderG.value = g; valueG.textContent = g;
        sliderB.value = b; valueB.textContent = b;
        // 色プレビューの背景色を更新
        colorPreview.style.backgroundColor = hexColor;
    } catch (e) {
        console.error("[UI] Invalid hex color for slider update:", hexColor, e);
        // エラー時はデフォルト値（例：白）などに設定する？
        sliderR.value = 255; valueR.textContent = 255;
        sliderG.value = 255; valueG.textContent = 255;
        sliderB.value = 255; valueB.textContent = 255;
        colorPreview.style.backgroundColor = '#FFFFFF';
    }
}