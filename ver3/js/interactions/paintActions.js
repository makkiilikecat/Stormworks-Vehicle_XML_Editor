/**
 * @fileoverview ブロックに対するペイント関連アクション（色適用など）を実装します。
 * paintInteractionHandler から呼び出され、BlockData の更新と履歴登録を行います。
 */

import { addAction } from '../state/historyManager.js';
// import { getCurrentPaintTool, getCurrentColor } from '../state/paintState.js'; // ★ TODO: Phase 4 で paintState モジュールからインポート
// import { mapFaceIndexToScIndex } from './geometryUtils.js'; // ★ TODO: 面インデックスマッピング関数を別途実装・インポート

/**
 * 指定されたブロックの面に「通常」ペイントツール（Surface Color: sc属性）で色を適用します。
 *
 * この関数は以下の処理を行います:
 * 1. 引数の妥当性をチェックします。
 * 2. Raycast結果の面インデックス (`faceIndex`) を、XMLの `sc` 属性に対応するインデックス (`scIndex`) にマッピングします（★要マッピング実装）。
 * 3. 指定された `scIndex` の現在の色を取得し、適用しようとしている色と同じであれば処理を中断します。
 * 4. 変更前の色を記録します（アンドゥ用）。
 * 5. `BlockData` の `surfaceColors` 配列を更新します。
 * 6. `'PAINT_BLOCK'` タイプのアクションとしてアンドゥ履歴に登録します。
 *
 * @param {BlockData} blockData - ペイント対象のブロックデータ。
 * @param {number} faceIndex - ジオメトリの面インデックス (Raycastの結果)。Three.jsのジオメトリ依存のインデックスです。
 * @param {string} colorCode - 適用する色コード (例: "FF0000", 大文字小文字は区別しない想定)。
 */
export function applyPaintNormal(blockData, faceIndex, colorCode) {
    // --- 引数チェック ---
    if (!blockData || faceIndex === undefined || faceIndex === null || !colorCode) {
        console.warn("[PaintActions] applyPaintNormal: 無効な引数が渡されました。", { blockData, faceIndex, colorCode });
        return;
    }

    // --- 面インデックスのマッピング (faceIndex -> scIndex) ---
    // ★★★【重要・要実装】★★★
    // Three.js の Raycast が返す faceIndex (三角形ポリゴンのインデックス) を、
    // Stormworks の sc 属性が期待する面のインデックス (通常 0-5) に変換する必要があります。
    // このマッピングはブロックのジオメトリタイプや t属性 (向き) によって変わる可能性があります。
    // 例えば、立方体 (BoxGeometry) の場合、各面は2つの三角形から成り、faceIndex 0, 1 が同じ面 (+X面など) を指します。
    // 正確なマッピング関数 (例: mapFaceIndexToScIndex(blockData, faceIndex)) を別途実装してください。
    //
    // ↓↓↓ 以下は立方体ジオメトリを仮定した **不正確な** 暫定マッピングです。必ず適切な実装に置き換えてください。↓↓↓
    const scIndex = Math.floor(faceIndex / 2);
    // ↑↑↑ 上記の暫定マッピングは削除し、別途実装した関数を使用してください。↑↑↑

    // 計算された scIndex が surfaceColors 配列の範囲内かチェック
    if (scIndex < 0 || scIndex >= blockData.surfaceColors.length) {
        console.warn(`[PaintActions] マッピング後の scIndex (${scIndex}) が無効です (faceIndex: ${faceIndex})。 Block ID: ${blockData.id}`);
        return; // 無効なインデックスなら処理中断
    }

    // --- 色変更の必要性チェック ---
    const currentColor = blockData.getSurfaceColor(scIndex);
    // 大文字小文字を区別せずに比較
    if (currentColor && currentColor.toUpperCase() === colorCode.toUpperCase()) {
        // console.log(`[PaintActions] Block ${blockData.id}, scIndex ${scIndex} is already color ${colorCode}.`);
        return; // 既に同じ色なら何もしない
    }

    // --- アンドゥ情報の準備 ---
    const oldValue = currentColor || "FFFFFF"; // 変更前の色 (null/undefined の場合はデフォルトの白として記録)

    // --- BlockData の更新 ---
    blockData.setSurfaceColor(scIndex, colorCode.toUpperCase()); // 色コードは大文字で統一して保存推奨
    console.log(`[PaintActions] Block ID ${blockData.id}, scIndex ${scIndex} color changed: ${oldValue} -> ${colorCode.toUpperCase()}`);

    // --- アンドゥ履歴への登録 ---
    addAction({
        type: 'PAINT_BLOCK', // アクションタイプ
        changes: [ // 配列形式で変更を記録 (他のツールでの変更にも対応できるよう)
            {
                blockId: blockData.id,       // 対象ブロックのID
                paintType: 'surface',      // 変更した色の種類 ('surface', 'base', 'additive')
                index: scIndex,            // surface の場合は面のインデックス (sc属性のインデックス)
                oldValue: oldValue,        // 変更前の色コード
                newValue: colorCode.toUpperCase() // 変更後の色コード
            }
        ]
    });

    // --- レンダリング更新のトリガーについて ---
    // この関数内では BlockData の状態を変更するだけで、直接3Dシーンの再描画は行いません。
    // 呼び出し元 (例: historyManager の undo/redo 処理完了後) で
    // renderBlocks() などを呼び出して表示を更新する必要があります。
    // または、ブロックがペイントされたことを示すカスタムイベントを発行し、
    // レンダリングモジュールがそれを購読して更新する方法も考えられます。
    // document.dispatchEvent(new CustomEvent('blockpainted', { detail: { blockId: blockData.id } }));
}

// =============================================================================
// --- TODO: Phase 4 で実装する関数 ---
// =============================================================================

/**
 * @todo Phase 4.1 で実装
 * 指定されたブロックに「特殊」ペイントツール（Additive Color: ac属性）で色を適用します。
 * @param {BlockData} blockData - ペイント対象のブロックデータ。
 * @param {string} colorCode - 適用する色コード。
 */
export function applyPaintAdditive(blockData, colorCode) {
    console.warn("[PaintActions] applyPaintAdditive is not implemented yet.");
    // 1. blockData.setAdditiveColor(colorCode) を呼び出す
    // 2. 変更をアンドゥ履歴に登録 (type: 'PAINT_BLOCK', paintType: 'additive')
}

/**
 * @todo Phase 4.2 で実装
 * シーン内の全ブロックを対象に、クリックされた面の色を指定された色に置き換えます。
 * (sc, bc, ac すべてが対象)
 * @param {BlockData[]} allBlocks - シーン内の全ブロックデータの配列。
 * @param {BlockData} clickedBlockData - 最初にクリックされたブロック。
 * @param {number} clickedFaceIndex - 最初にクリックされた面のインデックス (Raycast結果)。
 * @param {string} targetColorCode - 置き換え後の色コード。
 */
export function applyPaintReplace(allBlocks, clickedBlockData, clickedFaceIndex, targetColorCode) {
    console.warn("[PaintActions] applyPaintReplace is not implemented yet.");
    // 1. クリックされた面の色 (originalColor) を特定 (sc, bc, ac のどれか？ 仕様要確認)
    //    - mapFaceIndexToScIndex などで scIndex を取得
    //    - clickedBlockData.getSurfaceColor(scIndex), getBaseColor(), getAdditiveColor() を確認
    // 2. allBlocks をループ
    // 3. 各ブロックの surfaceColors, baseColor, additiveColor を確認
    // 4. originalColor と一致するものがあれば targetColorCode に置き換える
    // 5. 変更が発生した全てのブロックと変更内容をまとめてアンドゥ履歴に登録 (type: 'REPLACE_COLOR' など)
}

// =============================================================================
// --- TODO: 面インデックスマッピング関数 ---
// =============================================================================

/**
 * @todo Phase 3 または 4 で実装
 * Raycast結果の面インデックス (三角形ポリゴンのインデックス) を、
 * ブロックの sc 属性インデックス (通常 0-5) に変換する関数。
 * @param {BlockData} blockData - 対象ブロックのデータ (形状タイプや向きの情報が必要な場合)。
 * @param {number} faceIndex - Three.js ジオメトリの面インデックス。
 * @returns {number} 対応する sc 属性のインデックス (0-5)。失敗した場合は -1 など。
 */
/*
function mapFaceIndexToScIndex(blockData, faceIndex) {
    // この関数の実装は、proceduralMeshes.js でのジオメトリ定義方法と、
    // t属性による向きの考慮が必要なため、複雑になる可能性があります。
    // 立方体 (BoxGeometry) の場合は比較的単純です。
    // 例 (BoxGeometry の場合):
    // faceIndex 0, 1 -> +X (sc index ?)
    // faceIndex 2, 3 -> -X (sc index ?)
    // faceIndex 4, 5 -> +Y (sc index ?)
    // faceIndex 6, 7 -> -Y (sc index ?)
    // faceIndex 8, 9 -> +Z (sc index ?)
    // faceIndex 10, 11 -> -Z (sc index ?)
    // この対応関係を blockData.tAttribute や rotationMatrix を考慮して決定する必要があります。
    console.warn("[PaintActions] mapFaceIndexToScIndex is not implemented yet. Using temporary mapping.");
    return Math.floor(faceIndex / 2); // ★ 必ず正しい実装に置き換えてください
}
*/