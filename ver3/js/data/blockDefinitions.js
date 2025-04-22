/**
 * @fileoverview Stormworksブロック定義IDと内部タイプ、サイズ、オフセット、
 * コスト、質量、タグなどの情報をマッピングします。
 */

/**
 * ブロック定義オブジェクト。
 * キーはStormworksの 'd' 属性値 (ブロックID)。
 * 値は以下のプロパティを持つオブジェクト:
 * - name {string}: ブロック名 (UI表示用)
 * - type {string}: 内部的な形状タイプ (ジオメトリ生成用)
 * - size {number[]}: ブロックサイズ [width, height, depth] (ブロック単位)
 * - offset {number[]}: 基準点からのジオメトリ中心オフセット [x, y, z] (ブロック単位)
 * - cost {number}: ブロックコスト ($)
 * - mass {number}: ブロック質量 (kg) - 注意: Stormworksでは体積と材質で決まるため、これは目安
 * - tags {string[]}: 分類用タグ (インベントリ表示用)
 * - icon {string}?: (任意) UI表示用のアイコン文字やクラス名
 */
export const blockDefinitions = {
    // --- 基本形状 ---
    '01_block':          { name: 'Block',             type: 'cube',       size: [1, 1, 1], offset: [0, 0, 0], cost: 1, mass: 1, tags: ['基本形状', '構造'], icon: '🧱' },
    '01_block_static':   { name: 'Static Block',      type: 'cube',       size: [1, 1, 1], offset: [0, 0, 0], cost: 1, mass: 1, tags: ['基本形状', '構造', '特殊'] }, // 静的接続用
    '01_block_weight':   { name: 'Weight Block',      type: 'cube',       size: [1, 1, 1], offset: [0, 0, 0], cost: 5, mass: 10, tags: ['基本形状', '機能', '重り'] },
    '02_wedge':          { name: 'Wedge',             type: 'wedge',      size: [1, 1, 1], offset: [0, 0, 0], cost: 1, mass: 0.5, tags: ['基本形状', '構造'], icon: '◤' },
    '03_pyramid':        { name: 'Pyramid',           type: 'pyramid',    size: [1, 1, 1], offset: [0, 0, 0], cost: 1, mass: 0.33, tags: ['基本形状', '構造'], icon: '△' }, // offsetは要再調整
    '04_invpyramid':     { name: 'Inverse Pyramid',   type: 'invpyramid', size: [1, 1, 1], offset: [0, 0, 0], cost: 1, mass: 0.67, tags: ['基本形状', '構造'] },

    '05_wedge_2':        { name: 'Wedge 1x2',         type: 'wedge',      size: [2, 1, 1], offset: [0.5, 0, 0], cost: 2, mass: 1, tags: ['基本形状', '構造'] }, // サイズとオフセット見直し
    '06_pyramid_2':      { name: 'Pyramid 1x2',       type: 'pyramid',    size: [2, 1, 1], offset: [0.5, 0, 0], cost: 2, mass: 0.67, tags: ['基本形状', '構造'] }, // offset見直し
    '07_invpyramid_2':   { name: 'Inverse Pyramid 1x2', type: 'invpyramid', size: [2, 1, 1], offset: [0.5, 0, 0], cost: 2, mass: 1.33, tags: ['基本形状', '構造'] }, // offset見直し

    '08_wedge_4':        { name: 'Wedge 1x4',         type: 'wedge',      size: [4, 1, 1], offset: [1.5, 0, 0], cost: 4, mass: 2, tags: ['基本形状', '構造'] }, // offset見直し
    '09_pyramid_4':      { name: 'Pyramid 1x4',       type: 'pyramid',    size: [4, 1, 1], offset: [1.5, 0, 0], cost: 4, mass: 1.33, tags: ['基本形状', '構造'] }, // offset見直し
    '10_invpyramid_4':   { name: 'Inverse Pyramid 1x4', type: 'invpyramid', size: [4, 1, 1], offset: [1.5, 0, 0], cost: 4, mass: 2.67, tags: ['基本形状', '構造'] }, // offset見直し

    '11_pyramid_2x2':    { name: 'Pyramid 2x2',       type: 'pyramid',    size: [2, 1, 2], offset: [0.5, 0, -0.5], cost: 4, mass: 1.33, tags: ['基本形状', '構造'] }, // offset見直し
    '12_pyramid_2x4':    { name: 'Pyramid 2x4',       type: 'pyramid',    size: [4, 1, 2], offset: [1.5, 0, -0.5], cost: 8, mass: 2.67, tags: ['基本形状', '構造'] }, // offset見直し
    '13_pyramid_4x4':    { name: 'Pyramid 4x4',       type: 'pyramid',    size: [4, 1, 4], offset: [1.5, 0, -1.5], cost: 16, mass: 5.33, tags: ['基本形状', '構造'] }, // offset見直し

    // InvPyramid のサイズは Y/Z が逆だった可能性 -> 例として修正
    '14_invpyramid_2x2': { name: 'Inverse Pyramid 2x2', type: 'invpyramid', size: [2, 2, 1], offset: [0.5, -0.5, 0], cost: 4, mass: 2.67, tags: ['基本形状', '構造'] }, // offset見直し
    '15_invpyramid_2x4': { name: 'Inverse Pyramid 2x4', type: 'invpyramid', size: [2, 4, 1], offset: [0.5, -1.5, 0], cost: 8, mass: 5.33, tags: ['基本形状', '構造'] }, // offset見直し
    '16_invpyramid_4x4': { name: 'Inverse Pyramid 4x4', type: 'invpyramid', size: [4, 4, 1], offset: [1.5, -1.5, 0], cost: 16, mass: 10.67, tags: ['基本形状', '構造'] }, // offset見直し

    // --- 他のカテゴリの例 ---
    'light':             { name: 'Light',             type: 'cube', size: [1, 1, 1], offset: [0, 0, 0], cost: 10, mass: 0.1, tags: ['機能', '照明'], icon: '💡' },
    'button':            { name: 'Button',            type: 'cube', size: [1, 1, 1], offset: [0, 0, 0], cost: 5, mass: 0.1, tags: ['機能', 'インタラクション'], icon: '🔘' },
    'seat_pilot':        { name: 'Pilot Seat',        type: 'cube', size: [1, 2, 2], offset: [0, -0.5, -0.5], cost: 50, mass: 5, tags: ['機能', '座席'], icon: '💺' },

    // --- デフォルト ---
    'default':           { name: 'Unknown Block',     type: 'unknown_cube', size: [1, 1, 1], offset: [0, 0, 0], cost: 0, mass: 0, tags: ['その他'], icon: '❓' }
};

/**
 * 指定されたブロック定義IDに対応する定義情報を取得します。
 * 't'属性は現状考慮していません。
 * @param {string | null} definitionId - ブロックの 'd' 属性値 (nullの場合は '01_block')。
 * @param {string | null} typeAttribute - ブロックの 't' 属性値 (現状未使用)。
 * @returns {object} 対応する定義情報。見つからない場合は default の定義を返す。
 */
export function getBlockDefinition(definitionId, typeAttribute = null) {
    const id = definitionId || '01_block';
    // TODO: typeAttribute(t属性) を使った分岐 (特定のブロックは t 属性で見た目や機能が変わるため)
    return blockDefinitions[id] || blockDefinitions['default'];
}

/**
 * 全てのブロック定義を取得します (インベントリ生成用など)。
 * @returns {object} blockDefinitions オブジェクト全体。
 */
export function getAllBlockDefinitions() {
    return blockDefinitions;
}