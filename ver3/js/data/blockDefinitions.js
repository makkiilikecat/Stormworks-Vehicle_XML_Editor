/**
 * @fileoverview Stormworksブロック定義IDと内部タイプ、サイズ等のマッピング。
 */

/**
 * ブロック定義オブジェクト。
 * キーはStormworksの 'd' 属性値。
 * 値は { name, type, size:[w,h,d], offset:[x,y,z] } のオブジェクト。
 * offsetはジオメトリ中心(0,0,0)から見たStormworks基準点へのベクトル。
 */
export const blockDefinitions = {
    // --- 基本形状 ---
    //'01_block': { name: 'Block', type: 'cube', size: [1, 1, 1], offset: [0, 0, 0] }, // 底面中心が基準と仮定
    //'01_block_weight': { name: 'Weight Block', type: 'cube', size: [1, 1, 1], offset: [0, 0, 0] },
    //'02_wedge': { name: 'Wedge', type: 'wedge', size: [1, 1, 1], offset: [0, 0, 0] }, // 底面中心が基準と仮定
    //'03_pyramid': { name: 'Pyramid', type: 'pyramid', size: [1, 1, 1], offset: [0.5, -0.5, -0.5] }, // 底面中心が基準と仮定
    //'04_invpyramid': { name: 'Inv. Pyramid', type: 'invpyramid', size: [1, 1, 1], offset: [0.5, -0.5, -0.5] }, // 上面中心が基準？ (要調整)

    //'05_wedge_2': { name: 'Wedge 1x2', type: 'wedge', size: [1, 1, 2], offset: [0, 0, 0.5] }, // 高さが2なのでオフセットも変更
    //'06_pyramid_2': { name: 'Pyramid 1x2', type: 'pyramid', size: [2, 1, 1], offset: [0, -1, -0.5] },
    //'07_invpyramid_2': { name: 'Inv. Pyramid 1x2', type: 'invpyramid', size: [2, 1, 1], offset: [1, -0.5, 0] },

    //'08_wedge_4': { name: 'Wedge 1x4', type: 'wedge', size: [1, 1, 4], offset: [0, 0, 1.5] },
    //'09_pyramid_4': { name: 'Pyramid 1x4', type: 'pyramid', size: [4, 1, 1], offset: [0, -1, -0.5] },
    //'10_invpyramid_4': { name: 'Inv. Pyramid 1x4', type: 'invpyramid', size: [4, 1, 1], offset: [2, -0.5, 0] },

    //'11_pyramid_2x2': { name: 'Pyramid 2x2', type: 'pyramid', size: [2, 1, 2], offset: [0.5, -0.5, -0.5] }, // 高さが1の場合
    //'14_invpyramid_2x2': { name: 'Inv. Pyramid 2x2', type: 'invpyramid', size: [2, 1, 2], offset: [-0.5, -0.5, -0.5] },

    //'15_invpyramid_2x4': { name: 'Inv. Pyramid 2x4', type: 'invpyramid', size: [2, 1, 4], offset: [-0.5, -0.5, -0.5] },
    //'15_invpyramid_2x4': { name: 'Inv. Pyramid 2x4', type: 'invpyramid', size: [2, 1, 4], offset: [-0.5, -0.5, -0.5] },

    'default': { name: 'Unknown Block', type: 'unknown_cube', size: [1, 1, 1], offset: [0, -0.5, 0] }, // 不明ブロックも底面中心仮定

    '01_block': { name: 'Block', type: 'cube', size: [1, 1, 1], offset: [0, 0, 0] },
    '01_block_static': { name: 'Static Block', type: 'cube', size: [1, 1, 1], offset: [0, 0, 0] },
    '01_block_weight': { name: 'Weight Block', type: 'cube', size: [1, 1, 1], offset: [0, 0, 0] },
    '02_wedge': { name: 'Wedge', type: 'wedge', size: [1, 1, 1], offset: [0, 0, 0] },
    '03_pyramid': { name: 'Pyramid', type: 'pyramid', size: [1, 1, 1], offset: [0.5, -0.5, -0.5] },
    '04_invpyramid': { name: 'Inverse Pyramid', type: 'invpyramid', size: [1, 1, 1], offset: [0, 0, 0] },

    '05_wedge_2': { name: 'Wedge 1x2', type: 'wedge', size: [2, 1, 1], offset: [0.5, -0.5, -0.5] },
    '06_pyramid_2': { name: 'Pyramid 1x2', type: 'pyramid', size: [2, 1, 1], offset: [0.5, -0.5, -0.5] },
    '07_invpyramid_2': { name: 'Inverse Pyramid 1x2', type: 'invpyramid', size: [2, 1, 1], offset: [0.5, -0.5, -0.5] },

    '08_wedge_4': { name: 'Wedge 1x4', type: 'wedge', size: [4, 1, 1], offset: [0.5, -0.5, -0.5] },
    '09_pyramid_4': { name: 'Pyramid 1x4', type: 'pyramid', size: [4, 1, 1], offset: [0.5, -0.5, -0.5] },
    '10_invpyramid_4': { name: 'Inverse Pyramid 1x4', type: 'invpyramid', size: [4, 1, 1], offset: [0.5, -0.5, -0.5] },

    '11_pyramid_2x2': { name: 'Pyramid 2x2', type: 'pyramid', size: [2, 1, 2], offset: [0.5, -0.5, -0.5] },
    '12_pyramid_2x4': { name: 'Pyramid 2x4', type: 'pyramid', size: [4, 1, 2], offset: [0.5, -0.5, -0.5] },
    '13_pyramid_4x4': { name: 'Pyramid 4x4', type: 'pyramid', size: [4, 1, 4], offset: [0.5, -0.5, -0.5] },

    '14_invpyramid_2x2': { name: 'Inverse Pyramid 2x2', type: 'invpyramid', size: [2, 2, 1], offset: [0.5, -0.5, -0.5] },
    '15_invpyramid_2x4': { name: 'Inverse Pyramid 2x4', type: 'invpyramid', size: [2, 4, 1], offset: [0.5, -0.5, -0.5] },
    '16_invpyramid_4x4': { name: 'Inverse Pyramid 4x4', type: 'invpyramid', size: [4, 4, 1], offset: [0.5, -0.5, -0.5] }
};

/**
 * 指定されたブロック定義IDに対応する定義情報を取得します。
 * 't'属性は現状考慮していません。
 * @param {string | null} definitionId - ブロックの 'd' 属性値 (nullの場合は '01_block')。
 * @param {string | null} typeAttribute - ブロックの 't' 属性値 (現状未使用)。
 * @returns {{name: string, type: string, size: number[]}} 対応する定義情報。
 */
export function getBlockDefinition(definitionId, typeAttribute = null) {
    const id = definitionId || '01_block';
    // TODO: typeAttribute(t属性) を使った分岐
    return blockDefinitions[id] || blockDefinitions['default'];
}