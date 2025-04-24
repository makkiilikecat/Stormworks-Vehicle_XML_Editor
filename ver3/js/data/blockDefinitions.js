/**
 * @fileoverview ブロック定義データを提供します。
 * 各ブロックのID、名前、ジオメトリタイプ、サイズ、物理特性、タグ、アイコン、
 * そしてXML編集用のプロパティ定義を含みます。
 * 【主な変更点】
 * - ユーザー提供の最新定義に更新。
 * - 一部のブロックに properties 配列を追加 (デモ用)。
 * @fileoverview ブロック定義データを提供します。
 * 各ブロックのID、名前、ジオメトリタイプ、サイズ、物理特性、タグ、アイコン、
 * そしてXML編集用のプロパティ定義を含みます。
 * 【主な変更点】
 * - ユーザー提供の最新定義に更新。
 * - 一部のブロックに properties 配列を追加 (デモ用)。
 */

/**
 * 各ブロックの定義情報。
 * id: ブロックのXML 'd' 属性 (存在しない場合はキー自体を使用)
 * name: 表示名
 * type: プロシージャルメッシュ生成用の形状タイプ ('cube', 'wedge', 'pyramid', 'invpyramid', 'unknown_cube')
 * size: [width, height, depth] (Three.js座標系、プロシージャルメッシュ用)
 * offset: [x, y, z] (Three.js座標系、モデル中心から回転中心までのオフセット)
 * cost: コスト
 * mass: 質量
 * tags: ['カテゴリ', 'サブカテゴリ', ...] (インベントリフィルタリング用)
 * icon: インベントリ表示用アイコン (絵文字など)
 * properties: (オプション) XML編集パネルで編集可能なプロパティ定義の配列
 * - name: string - XML属性名
 * - type: 'string' | 'number' | 'boolean' - データ型
 * - defaultValue: string | number | boolean - Stormworksにおけるデフォルト値
 * - source: 'c' | 'o' - 属性が存在するXML要素 (<c> または <o>)
 * - group: string - UIでの表示グループ名
 * 各ブロックの定義情報。
 * id: ブロックのXML 'd' 属性 (存在しない場合はキー自体を使用)
 * name: 表示名
 * type: プロシージャルメッシュ生成用の形状タイプ ('cube', 'wedge', 'pyramid', 'invpyramid', 'unknown_cube')
 * size: [width, height, depth] (Three.js座標系、プロシージャルメッシュ用)
 * offset: [x, y, z] (Three.js座標系、モデル中心から回転中心までのオフセット)
 * cost: コスト
 * mass: 質量
 * tags: ['カテゴリ', 'サブカテゴリ', ...] (インベントリフィルタリング用)
 * icon: インベントリ表示用アイコン (絵文字など)
 * properties: (オプション) XML編集パネルで編集可能なプロパティ定義の配列
 * - name: string - XML属性名
 * - type: 'string' | 'number' | 'boolean' - データ型
 * - defaultValue: string | number | boolean - Stormworksにおけるデフォルト値
 * - source: 'c' | 'o' - 属性が存在するXML要素 (<c> または <o>)
 * - group: string - UIでの表示グループ名
 */
export const blockDefinitions = {
    // --- 基本形状 ---
    '01_block':          { name: 'Block',               type: 'cube',       size: [1, 1, 1], offset: [+0.0, +0.0, +0.0], cost:  2, mass:    1, tags: ['基本形状', '構造'], icon: '🧱' },
    '01_block_static':   { name: 'Static Block',        type: 'cube',       size: [1, 1, 1], offset: [+0.0, +0.0, +0.0], cost:  2, mass:    1, tags: ['基本形状', '構造', '特殊'] },
    '01_block_weight':   { name: 'Weight Block',        type: 'cube',       size: [1, 1, 1], offset: [+0.0, +0.0, +0.0], cost:  5, mass:   10, tags: ['基本形状', '機能', '重り'] },
    '02_wedge':          { name: 'Wedge',               type: 'wedge',      size: [1, 1, 1], offset: [+0.0, +0.0, +0.0], cost:  2, mass:  0.5, tags: ['基本形状', '構造'], icon: '◤' },
    '03_pyramid':        { name: 'Pyramid',             type: 'pyramid',    size: [1, 1, 1], offset: [+0.5, -0.5, -0.5], cost:  2, mass: 0.25, tags: ['基本形状', '構造'], icon: '△' },
    '04_invpyramid':     { name: 'Inverse Pyramid',     type: 'invpyramid', size: [1, 1, 1], offset: [+0.0, +0.0, +0.0], cost:  2, mass: 0.75, tags: ['基本形状', '構造'] },

    '05_wedge_2':        { name: 'Wedge 1x2',           type: 'wedge',      size: [1, 1, 2], offset: [+0.0, +0.0, +0.5], cost:  2, mass:    1, tags: ['基本形状', '構造'] },
    '06_pyramid_2':      { name: 'Pyramid 1x2',         type: 'pyramid',    size: [2, 1, 1], offset: [+0.5, -0.5, -0.5], cost:  2, mass:  0.5, tags: ['基本形状', '構造'] },
    '07_invpyramid_2':   { name: 'Inverse Pyramid 1x2', type: 'invpyramid', size: [2, 1, 1], offset: [+0.0, +0.0, +0.5], cost:  2, mass:  1.5, tags: ['基本形状', '構造'] },

    '08_wedge_4':        { name: 'Wedge 1x4',           type: 'wedge',      size: [1, 1, 4], offset: [+0.0, +0.0, +1.5], cost:  4, mass:    2, tags: ['基本形状', '構造'] },
    '09_pyramid_4':      { name: 'Pyramid 1x4',         type: 'pyramid',    size: [4, 1, 1], offset: [+0.5, -0.5, -0.5], cost:  4, mass:    1, tags: ['基本形状', '構造'] },
    '10_invpyramid_4':   { name: 'Inverse Pyramid 1x4', type: 'invpyramid', size: [4, 1, 1], offset: [+0.0, +0.0, +1.5], cost:  4, mass:    3, tags: ['基本形状', '構造'] },

    '11_pyramid_2x2':    { name: 'Pyramid 2x2',         type: 'pyramid',    size: [2, 1, 2], offset: [+0.5, -0.5, -0.5], cost:  4, mass:    1, tags: ['基本形状', '構造'] },
    '12_pyramid_2x4':    { name: 'Pyramid 2x4',         type: 'pyramid',    size: [4, 1, 2], offset: [+0.5, -0.5, -0.5], cost:  8, mass:    2, tags: ['基本形状', '構造'] },
    '13_pyramid_4x4':    { name: 'Pyramid 4x4',         type: 'pyramid',    size: [4, 1, 4], offset: [+0.5, -0.5, -0.5], cost: 16, mass:    4, tags: ['基本形状', '構造'] },

    '14_invpyramid_2x2': { name: 'Inverse Pyramid 2x2', type: 'invpyramid', size: [2, 1, 2], offset: [-0.5, +0.0, +0.5], cost:  4, mass:    3, tags: ['基本形状', '構造'] },
    '15_invpyramid_2x4': { name: 'Inverse Pyramid 2x4', type: 'invpyramid', size: [4, 1, 2], offset: [-0.5, +0.0, +1.5], cost:  8, mass:    6, tags: ['基本形状', '構造'] },
    '16_invpyramid_4x4': { name: 'Inverse Pyramid 4x4', type: 'invpyramid', size: [4, 1, 4], offset: [+0.5, -0.5, -0.5], cost: 16, mass:   12, tags: ['基本形状', '構造'] },

    // --- ロボティクス (デモ用プロパティ追加) ---
    'multibody_compact_pivot_robotic_a': {
        name: 'Robotic Pivot (Compact)',
        type: 'cube', // 形状は仮
        size: [1, 1, 1],
        offset: [0, 0, 0],
        cost: 100, mass: 2,
        tags: ['機能', 'ロボティクス', 'ピボット'],
        icon: '⚙️',
        properties: [
            { name: 'max_force_scalar', type: 'number', defaultValue: 0.05, source: 'o', group: 'Robotics' },
            { name: 'input_velocity',   type: 'number', defaultValue: 5,    source: 'o', group: 'Robotics' },
        ]
    },

     // --- 表示 (デモ用プロパティ追加) ---
     'monitor_2x3': {
        name: 'Monitor 2x3',
        type: 'cube', // 形状は仮
        size: [3, 1, 2], // サイズも仮 (XMLから推測)
        offset: [1.0, 0, -0.5], // オフセットも仮
        cost: 200, mass: 1,
        tags: ['機能', '表示', 'モニター'],
        icon: '🖥️',
        properties: [
            { name: 'brightness', type: 'number', defaultValue: 1, source: 'o', group: 'Display' },
            { name: 'is_on', type: 'boolean', defaultValue: true, source: 'o', group: 'Display' }, // 例: o要素の属性と仮定
             // 例: <display_1> など子要素は現状では編集対象外とするが、将来的には別の type かも
        ]
    },


    // --- 他のカテゴリの例 ---（これらは正しい値ではない）
    'light':             { name: 'Light',               type: 'cube',       size: [1, 1, 1], offset: [0, 0, 0], cost: 10, mass: 0.1, tags: ['機能', '照明'], icon: '💡' },
    'button':            { name: 'Button',              type: 'cube',       size: [1, 1, 1], offset: [0, 0, 0], cost: 5, mass: 0.1, tags: ['機能', 'インタラクション'], icon: '🔘' },
    'seat_pilot':        { name: 'Pilot Seat',          type: 'cube',       size: [1, 2, 2], offset: [0, -0.5, -0.5], cost: 50, mass: 5, tags: ['機能', '座席'], icon: '💺' },

    // --- デフォルト ---
    'default':           { name: 'Unknown Block',       type: 'unknown_cube', size: [1, 1, 1], offset: [0, 0, 0], cost: 0, mass: 0, tags: ['その他'], icon: '❓' }
    'default':           { name: 'Unknown Block',       type: 'unknown_cube', size: [1, 1, 1], offset: [0, 0, 0], cost: 0, mass: 0, tags: ['その他'], icon: '❓' }
};

/**
 * ブロックIDに対応する定義を取得します。見つからない場合はデフォルト定義を返します。
 * @param {string} definitionId - ブロック定義ID ('d'属性値など)。
 * @param {object} [fallback=blockDefinitions.default] - 見つからなかった場合のフォールバック定義。
 * @returns {object} ブロック定義オブジェクト。
 * ブロックIDに対応する定義を取得します。見つからない場合はデフォルト定義を返します。
 * @param {string} definitionId - ブロック定義ID ('d'属性値など)。
 * @param {object} [fallback=blockDefinitions.default] - 見つからなかった場合のフォールバック定義。
 * @returns {object} ブロック定義オブジェクト。
 */
export function getBlockDefinition(definitionId, fallback = blockDefinitions.default) {
    // definitionId が null や undefined の場合も考慮
    return blockDefinitions[definitionId] || fallback;
export function getBlockDefinition(definitionId, fallback = blockDefinitions.default) {
    // definitionId が null や undefined の場合も考慮
    return blockDefinitions[definitionId] || fallback;
}

/**
 * 全てのブロック定義を配列として取得します（デフォルト定義を除く）。
 * @returns {object[]} ブロック定義オブジェクトの配列。
 * 全てのブロック定義を配列として取得します（デフォルト定義を除く）。
 * @returns {object[]} ブロック定義オブジェクトの配列。
 */
export function getAllBlockDefinitions() {
    return Object.entries(blockDefinitions)
                 .filter(([key, value]) => key !== 'default') // 'default' エントリを除外
                 .map(([key, value]) => ({ id: key, ...value })); // キーを 'id' プロパティとして追加
    return Object.entries(blockDefinitions)
                 .filter(([key, value]) => key !== 'default') // 'default' エントリを除外
                 .map(([key, value]) => ({ id: key, ...value })); // キーを 'id' プロパティとして追加
}