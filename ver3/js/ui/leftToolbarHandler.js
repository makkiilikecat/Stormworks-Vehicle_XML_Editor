/**
 * @fileoverview 左ツールバー (#left-toolbar) のUI要素（ペイント関連）とインタラクションを管理します。
 * ペイントツール選択、カラーパレット、RGBスライダーなどを扱います。
 */

// --- 必要なモジュールや関数をインポート ---
// import { setCurrentPaintTool, setCurrentColor } from '../state/paintState.js'; // ★ 将来的に paintState からインポート

// --- モジュール内変数 ---
let appState = null;
let rgbSlidersVisible = false; // RGBスライダー表示状態

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

    // --- イベントリスナー設定 ---
    // ペイントツール選択
    paintToolButtons?.forEach(button => {
        button.addEventListener('click', () => handlePaintToolSelection(button));
    });

    // カラーパレット選択
    colorSwatches?.forEach(swatch => {
        swatch.addEventListener('click', () => handleColorSwatchSelection(swatch));
    });

    // RGBスライダー展開
    toggleRgbSlidersButton?.addEventListener('click', toggleRgbSliders);

    // RGBスライダー操作
    const rgbSliders = [sliderR, sliderG, sliderB];
    rgbSliders.forEach(slider => {
        slider?.addEventListener('input', updateColorFromSliders);
    });

    // --- 初期状態設定 ---
    // ペイントツールの初期アクティブ設定 (通常ツールをデフォルトに)
    paintToolButtons?.forEach(button => {
        button.classList.toggle('active', button.dataset.paintTool === 'normal');
    });
    // カラーパレットの初期アクティブ設定 (最初の色をデフォルトに)
    if (colorSwatches && colorSwatches.length > 0) {
        colorSwatches[0].classList.add('active');
        // 最初の色でスライダー初期化 (失敗してもエラーにならないように)
        try {
            updateSlidersFromColor(colorSwatches[0].dataset.color ? `#${colorSwatches[0].dataset.color}` : '#C2C3C7');
        } catch (e) { console.error("Initial slider update failed:", e); }
    }
    // RGBスライダーは初期非表示
    if (rgbSlidersContainer) rgbSlidersContainer.style.display = 'none';
    rgbSlidersVisible = false; // 状態変数も初期化

    console.log("[LeftToolbarHandler] 初期化完了。");
}

/** @private ペイントツール選択ボタンのクリック処理 */
function handlePaintToolSelection(selectedButton) {
    const tool = selectedButton.dataset.paintTool;
    paintToolButtons?.forEach(btn => btn.classList.remove('active'));
    selectedButton.classList.add('active');
    console.log(`[UI] Paint Tool Selected: ${tool}`);
    // ★仮実装: 将来的に paintState を更新
    // setCurrentPaintTool(tool);
}

/** @private カラーパレットの色見本ボタンのクリック処理 */
function handleColorSwatchSelection(selectedSwatch) {
    const color = selectedSwatch.dataset.color;
    colorSwatches?.forEach(sw => sw.classList.remove('active'));
    selectedSwatch.classList.add('active');
    console.log(`[UI] Palette Color Selected: #${color}`);
    // ★仮実装: 将来的に paintState を更新
    // setCurrentColor(`#${color}`);
    // スライダーも更新
    try {
        updateSlidersFromColor(`#${color}`);
    } catch (e) { console.error("Slider update from swatch failed:", e); }
}

/** @private RGBスライダーの表示/非表示を切り替える */
function toggleRgbSliders() {
    rgbSlidersVisible = !rgbSlidersVisible;
    if (rgbSlidersContainer) {
        rgbSlidersContainer.style.display = rgbSlidersVisible ? 'flex' : 'none';
    }
    toggleRgbSlidersButton?.classList.toggle('active', rgbSlidersVisible);
    console.log(`[UI] RGBスライダー表示: ${rgbSlidersVisible}`);
}

/** @private RGBスライダーの値に基づいて色プレビューと状態を更新 */
function updateColorFromSliders() {
    if (!sliderR || !sliderG || !sliderB || !valueR || !valueG || !valueB || !colorPreview) return;
    const r = parseInt(sliderR.value, 10);
    const g = parseInt(sliderG.value, 10);
    const b = parseInt(sliderB.value, 10);
    valueR.textContent = r; valueG.textContent = g; valueB.textContent = b;
    const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    colorPreview.style.backgroundColor = hexColor;

    console.log(`[UI] Slider Color Selected: ${hexColor.toUpperCase()}`);
    // ★仮実装: 選択色を更新 (将来的に paintState へ)
    // setCurrentColor(hexColor.toUpperCase());

    // パレットのアクティブ状態を解除
    colorSwatches?.forEach(sw => sw.classList.remove('active'));
}

/** @private 指定された色コードでRGBスライダーとプレビューを更新 */
function updateSlidersFromColor(hexColor) {
    if (!sliderR || !sliderG || !sliderB || !valueR || !valueG || !valueB || !colorPreview) {
        console.warn("[updateSlidersFromColor] RGB slider elements not found.");
        return;
    }
    if (!hexColor || !hexColor.startsWith('#') || hexColor.length !== 7) {
         console.warn("[updateSlidersFromColor] Invalid hexColor format:", hexColor);
        return;
    }
    try {
        const r = parseInt(hexColor.substring(1, 3), 16);
        const g = parseInt(hexColor.substring(3, 5), 16);
        const b = parseInt(hexColor.substring(5, 7), 16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) throw new Error("Invalid hex value");
        sliderR.value = r; valueR.textContent = r;
        sliderG.value = g; valueG.textContent = g;
        sliderB.value = b; valueB.textContent = b;
        colorPreview.style.backgroundColor = hexColor;
    } catch (e) {
        console.error("[UI] Invalid hex color for slider update:", hexColor, e);
        // エラー時もデフォルト値などにリセットする？
        sliderR.value = 194; valueR.textContent = 194; // C2
        sliderG.value = 195; valueG.textContent = 195; // C3
        sliderB.value = 199; valueB.textContent = 199; // C7
        colorPreview.style.backgroundColor = '#C2C3C7';
    }
}