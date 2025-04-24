/**
 * @fileoverview ブロックに対するペイント関連アクション（色適用、色置き換え）を実装します。
 * paintInteractionHandler から呼び出され、BlockData の更新とアンドゥ履歴登録を行います。
 *
 * 現状の実装レベル: Stage 4.2
 * - applyPaintNormal: 通常ペイント（surfaceColors の指定面を変更）を実装済み。
 * - applyPaintAdditive: 特殊ペイント（additiveColor を変更）を実装済み。
 * - applyPaintReplace: 色置き換え（シーン全体の指定色を変更）を実装済み。
 *
 * 未解決の課題:
 * - 面インデックスのマッピング: Raycast結果の faceIndex を sc属性インデックス(0-5) に
 * 変換する正確なロジックが必要です (現状は暫定実装)。
 */

import { addAction } from '../state/historyManager.js';
// import { mapFaceIndexToScIndex } from './geometryUtils.js'; // ★ 面インデックスマッピング関数 (別途実装が必要)

/**
 * 指定されたブロックの面に「通常」ペイントツールで色を適用します。
 * surfaceColors 配列の指定されたインデックスの色を更新し、操作をアンドゥ履歴に登録します。
 * bc (Base Color) は変更しません。
 *
 * @param {BlockData} blockData - ペイント対象のブロックデータ。
 * @param {number} faceIndex - ジオメトリの面インデックス (Raycast結果)。
 * このインデックスから sc 属性インデックスへのマッピングが必要です。
 * @param {string} colorCode - 適用する色コード (6桁16進数、例: "FF0000")。
 */
export function applyPaintNormal(blockData, faceIndex, colorCode) {
    // 引数の基本的な検証
    if (!blockData || faceIndex === undefined || faceIndex === null || !colorCode) {
        console.warn("[PaintActions] applyPaintNormal: 無効な引数です。", { blockData, faceIndex, colorCode });
        return;
    }

    // --- 面インデックスのマッピング (★暫定実装 - 要改善) ---
    // Raycast結果の faceIndex を sc属性のインデックス(0-5)に変換する必要があります。
    // このマッピングはブロック形状に依存します。
    // ここでは、6面を持つ立方体(BoxGeometry)を想定した単純なマッピングを仮定します。
    // faceIndex 0,1 -> scIndex 0 (+X)
    // faceIndex 2,3 -> scIndex 1 (-X)
    // faceIndex 4,5 -> scIndex 2 (+Y)
    // faceIndex 6,7 -> scIndex 3 (-Y)
    // faceIndex 8,9 -> scIndex 4 (+Z)
    // faceIndex 10,11-> scIndex 5 (-Z)
    const scIndex = Math.floor(faceIndex / 2);
    // const scIndex = mapFaceIndexToScIndex(blockData, faceIndex); // 将来的に専用関数を実装
    // ----------------------------------------------------

    // 計算された scIndex が有効範囲内かチェック
    if (scIndex < 0 || scIndex >= blockData.surfaceColors.length) {
        console.warn(`[PaintActions] 無効な scIndex (${scIndex}) が計算されました (faceIndex: ${faceIndex})。 Block ID: ${blockData.id}, SurfaceColors Length: ${blockData.surfaceColors.length}`);
        return;
    }

    // 現在の色を取得し、変更があるか確認
    const currentColor = blockData.getSurfaceColor(scIndex);
    // 色コードを比較用に正規化 (大文字、#なし)
    const normalizedCurrentColor = currentColor ? currentColor.toUpperCase().replace('#', '') : 'FFFFFF'; // null や 'x' は白扱い
    const normalizedTargetColor = colorCode.toUpperCase().replace('#', '');

    if (normalizedCurrentColor === normalizedTargetColor) {
        // console.log(`[PaintActions] Block ${blockData.id}, scIndex ${scIndex} は既に色 ${targetColorCode} です。`);
        return; // 色が同じなら何もしない
    }

    const oldValue = currentColor || "FFFFFF"; // Undo用に元の色を保持 (null は白扱い)
    const newValue = normalizedTargetColor; // 正規化した新しい色

    // 1. BlockData の surfaceColors を更新
    blockData.setSurfaceColor(scIndex, newValue);
    console.log(`[PaintActions] Block ID ${blockData.id}, scIndex ${scIndex} の色を ${oldValue} -> ${newValue} に変更 (Normal)。`);

    // 2. アンドゥ履歴に登録
    addAction({
        type: 'PAINT_BLOCK', // ペイント操作を示すタイプ
        changes: [ // 変更内容を配列で記録
            {
                blockId: blockData.id,
                paintType: 'surface', // どの色属性を変更したか
                index: scIndex,       // surfaceColors のどのインデックスか
                oldValue: oldValue,   // 変更前の色
                newValue: newValue    // 変更後の色
            }
        ]
    });

    // 3. レンダリング更新トリガー (呼び出し元、または HistoryManager 経由で行う)
    // document.dispatchEvent(new CustomEvent('blockpainted', { detail: { blockId: blockData.id } }));
}

/**
 * 指定されたブロックに「特殊」ペイントツールで色を適用します。
 * additiveColor (ac属性) を更新し、操作をアンドゥ履歴に登録します。
 *
 * @param {BlockData} blockData - ペイント対象のブロックデータ。
 * @param {string} colorCode - 適用する色コード (6桁16進数、例: "FF0000")。
 */
export function applyPaintAdditive(blockData, colorCode) {
    // 引数の検証
    if (!blockData || !colorCode) {
        console.warn("[PaintActions] applyPaintAdditive: 無効な引数です。", { blockData, colorCode });
        return;
    }

    // 現在の色と新しい色を正規化して比較
    const currentColor = blockData.getAdditiveColor();
    const normalizedCurrentColor = currentColor ? currentColor.toUpperCase().replace('#', '') : null;
    const normalizedTargetColor = colorCode.toUpperCase().replace('#', '');

    // 色が同じ場合は何もしない
    if (normalizedCurrentColor === normalizedTargetColor) {
        return;
    }

    const oldValue = currentColor; // Undo用に元の色を保持 (null の可能性あり)
    const newValue = normalizedTargetColor; // 正規化した新しい色

    // 1. BlockData の additiveColor を更新
    blockData.setAdditiveColor(newValue);
    console.log(`[PaintActions] Block ID ${blockData.id} の AdditiveColor を ${oldValue || 'null'} -> ${newValue} に変更。`);

    // 2. アンドゥ履歴に登録
    addAction({
        type: 'PAINT_BLOCK',
        changes: [
            {
                blockId: blockData.id,
                paintType: 'additive', // 種類を 'additive' に
                // index: undefined, // additive には index は不要
                oldValue: oldValue,    // 変更前の色 (null かもしれない)
                newValue: newValue     // 変更後の色
            }
        ]
    });

    // 3. レンダリング更新トリガー
    // document.dispatchEvent(new CustomEvent('blockpainted', { detail: { blockId: blockData.id } }));
}

/**
 * クリックされたブロックの面の色を取得し、シーン内の全ブロックで同じ色を持つ箇所
 * (surfaceColors, baseColor, additiveColor) を、指定された新しい色で置き換えます。
 * 色の比較は大文字小文字を区別せず、'x' は 'FFFFFF' として扱います。
 *
 * @param {BlockData} clickedBlockData - クリックされたブロックデータ。
 * @param {number} clickedFaceIndex - クリックされた面のジオメトリインデックス。
 * @param {string} targetColorCode - 置き換え後の新しい色コード (6桁16進数)。
 * @param {BlockData[]} allBlocks - シーン内の全ブロックデータ配列。
 */
export function applyPaintReplace(clickedBlockData, clickedFaceIndex, targetColorCode, allBlocks) {
    // 引数の検証
    if (!clickedBlockData || clickedFaceIndex === undefined || clickedFaceIndex === null || !targetColorCode || !Array.isArray(allBlocks)) {
        console.warn("[PaintActions] applyPaintReplace: 無効な引数です。");
        return;
    }

    // 1. クリックされた面の色を取得 & 正規化
    // ★ 暫定マッピング (applyPaintNormal と同様)
    const clickedScIndex = Math.floor(clickedFaceIndex / 2);
    let colorToReplace = clickedBlockData.getSurfaceColor(clickedScIndex);
    // 'x' や null は 白 ("FFFFFF") として扱う
    colorToReplace = (colorToReplace && colorToReplace.toLowerCase() !== 'x') ? colorToReplace.toUpperCase().replace('#', '') : 'FFFFFF';

    // 置き換え後の色も正規化
    const normalizedTargetColor = targetColorCode.toUpperCase().replace('#', '');

    // 置き換え対象の色と置き換え後の色が同じ場合は何もしない
    if (colorToReplace === normalizedTargetColor) {
        console.log(`[PaintActions] 置き換え対象の色 (${colorToReplace}) がターゲット色と同じです。`);
        return;
    }

    console.log(`[PaintActions] Replace Paint: "${colorToReplace}" を "${normalizedTargetColor}" に置き換えます。`);

    // 2. シーン全体のブロックを走査し、変更箇所を記録
    const changes = []; // アンドゥ用の変更リスト

    allBlocks.forEach(block => {
        const blockId = block.id;

        // --- Surface Colors (sc) をチェック & 変更 ---
        block.surfaceColors.forEach((currentColor, index) => {
            // 現在の色を正規化 ('x' と null は "FFFFFF")
            const normalizedCurrent = (currentColor && currentColor.toLowerCase() !== 'x') ? currentColor.toUpperCase().replace('#', '') : 'FFFFFF';
            // 置き換え対象の色と一致したら変更
            if (normalizedCurrent === colorToReplace) {
                const oldValue = currentColor || 'FFFFFF'; // Undo用 (元の'x'やnullを保持)
                changes.push({
                    blockId: blockId, paintType: 'surface', index: index,
                    oldValue: oldValue, newValue: normalizedTargetColor
                });
                // BlockData を直接変更
                block.setSurfaceColor(index, normalizedTargetColor);
            }
        });

        // --- Base Color (bc) をチェック & 変更 ---
        const currentBaseColor = block.getBaseColor();
        const normalizedBase = currentBaseColor ? currentBaseColor.toUpperCase().replace('#', '') : null;
        // nullでない、かつ置き換え対象の色と一致したら変更
        if (normalizedBase && normalizedBase === colorToReplace) {
            changes.push({
                blockId: blockId, paintType: 'base', /*index: undefined,*/
                oldValue: currentBaseColor, newValue: normalizedTargetColor
            });
            block.setBaseColor(normalizedTargetColor);
        }

        // --- Additive Color (ac) をチェック & 変更 ---
        const currentAdditiveColor = block.getAdditiveColor();
        const normalizedAdditive = currentAdditiveColor ? currentAdditiveColor.toUpperCase().replace('#', '') : null;
        // nullでない、かつ置き換え対象の色と一致したら変更
        if (normalizedAdditive && normalizedAdditive === colorToReplace) {
             changes.push({
                blockId: blockId, paintType: 'additive', /*index: undefined,*/
                oldValue: currentAdditiveColor, newValue: normalizedTargetColor
            });
            block.setAdditiveColor(normalizedTargetColor);
        }
    });

    // 3. 変更があった場合のみ履歴に登録
    if (changes.length > 0) {
        console.log(`[PaintActions] ${changes.length}箇所の色を置き換えました。`);
        addAction({
            type: 'REPLACE_COLOR', // 色置き換え操作を示すタイプ
            changes: changes       // 発生した全ての変更を記録
        });
        // レンダリング更新トリガー
        document.dispatchEvent(new CustomEvent('blocksChanged', { detail: { action: 'replace_color' } }));
    } else {
        console.log(`[PaintActions] 置き換え対象の色 (${colorToReplace}) はシーン内に見つかりませんでした。`);
    }
}