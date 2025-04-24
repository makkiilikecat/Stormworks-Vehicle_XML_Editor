/**
 * @fileoverview プログラムによって指定サイズの単純なブロック形状ジオメトリを生成。
 */

import * as THREE from 'three';

const geometryCache = new Map();

/**
 * キャッシュを確認し、なければ生成して保存。キャッシュキーにサイズを含める。
 * @param {string} type - 形状タイプ。
 * @param {number[]} size - [width, height, depth]。
 * @param {function(number[]): THREE.BufferGeometry} generatorFunc - 生成関数。
 * @returns {THREE.BufferGeometry}
 * @private
 */
function getOrCreateGeometry(type, size, generatorFunc) {
    const cacheKey = `${type}_${size.join('x')}`; // 例: 'cube_1x1x1', 'wedge_1x2x1'
    if (!geometryCache.has(cacheKey)) {
        console.log(`Generating geometry for: ${cacheKey}`);
        geometryCache.set(cacheKey, generatorFunc(size));
    }
    return geometryCache.get(cacheKey);
}

// === ジオメトリ生成関数 (size引数を追加) ===

/**
 * 指定サイズの立方体ジオメトリを生成します。
 * @param {number[]} size - [width, height, depth]。
 * @returns {THREE.BoxGeometry}
 */
function createCubeGeometry(size) {
    const [width, height, depth] = size;
    // BoxGeometryは中心が原点なので、そのままサイズ指定でOK
    return new THREE.BoxGeometry(width, height, depth);
}

/**
 * 指定サイズのウェッジ（三角柱）ジオメトリを生成します。
 * @param {number[]} size - [width, height, depth]。
 * @returns {THREE.BufferGeometry}
 */
function createWedgeGeometry(size) {
    const [width, height, depth] = size;
    const hw = width / 2, hh = height / 2, hd = depth / 2; // 半分のサイズ

    const geometry = new THREE.BufferGeometry();
    // 頂点座標 (中心が原点になるように配置)
    // 底面がXZ平面にあると仮定し、高さがY方向、斜面が+Z側にあるウェッジ
    const vertices = new Float32Array([
        // 底面 (Y = -hh)
        -hw, -hh,  hd, // 0: 左下前
         hw, -hh,  hd, // 1: 右下前
         hw, -hh, -hd, // 2: 右下奥
        -hw, -hh, -hd, // 3: 左下奥
        // 上の稜線 (Y = hh, Z = -hd)
        -hw,  hh, -hd, // 4: 左上奥
         hw,  hh, -hd, // 5: 右上奥
    ]);

    // 面インデックス (外側から見て反時計回りになるように定義)
    const indices = [
        // 底面 (Y=-hh): 外側(-Y方向)から見て反時計回り
        0, 2, 1,
        0, 3, 2,
        // 後面 (Z=-hd): 外側(-Z方向)から見て反時計回り
        3, 5, 2,
        3, 4, 5,
        // 斜面 (前面): 外側から見て反時計回り (変更なし)
        0, 1, 5,
        0, 5, 4,
        // 右側面 (X=+hw): 外側(+X方向)から見て反時計回り (変更なし)
        1, 2, 5,
        // 左側面 (X=-hw): 外側(-X方向)から見て反時計回り
        3, 0, 4
    ];

    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
}


/**
 * 指定サイズのピラミッド（四角錐）ジオメトリを生成します。
 * @param {number[]} size - [width, height, depth]。幅と奥行を使用。
 * @returns {THREE.BufferGeometry}
 */
function createPyramidGeometry(size) {
     const [width, height, depth] = size;
     const hw = width / 2, hh = height / 2, hd = depth / 2;

    const geometry = new THREE.BufferGeometry();
   // 頂点座標 (4つの頂点)
    // 元の直角四面体の頂点を Y軸周りに -90度 回転させた座標 (x, y, z) -> (-z, y, x)
    const vertices = new Float32Array([
        // 頂点 0: 元の(0, 0, 0) -> 回転後 (0, 0, 0)
        0.0, 0.0, 0.0,   // 0: Origin (Right-angle corner remains at origin)

        // 頂点 1: 元の(width, 0, 0) -> 回転後 (0, 0, width)
        0.0, 0.0, width, // 1: Rotated from X-axis point (now on positive Z-axis)

        // 頂点 2: 元の(0, height, 0) -> 回転後 (0, height, 0)
        0.0, height, 0.0,// 2: Rotated from Y-axis point (remains on Y-axis)

        // 頂点 3: 元の(0, 0, depth) -> 回転後 (-depth, 0, 0)
       -depth, 0.0, 0.0  // 3: Rotated from Z-axis point (now on negative X-axis)
    ]);
    // 注意: この定義でも、ジオメトリの中心は原点にはなりません。

    // 面インデックス (4つの面)
    // 頂点の番号と接続関係は回転前と同じです。
    // 面の向き (巻順) は、頂点座標が変わってもトポロジーは同じなので、
    // computeVertexNormals() が正しく処理してくれることを期待して、元のままにします。
    // もし面の向きがおかしい場合は、インデックスの順序を見直す必要があります。
    const indices = [
        // 面 1: (元XY平面) -> 頂点 0, 1(新), 2(新) を結ぶ面
        0, 2, 1, // 外側から見て反時計回りになるように (法線が-Zish -> +Xish?)

        // 面 2: (元XZ平面) -> 頂点 0, 1(新), 3(新) を結ぶ面
        0, 1, 3, // 外側から見て反時計回りになるように (法線が-Yish -> -Yish?)

        // 面 3: (元YZ平面) -> 頂点 0, 2(新), 3(新) を結ぶ面
        0, 3, 2, // 外側から見て反時計回りになるように (法線が-Xish -> +Zish?)

        // 面 4: 斜面 -> 頂点 1(新), 2(新), 3(新) を結ぶ面
        1, 2, 3  // 外側から見て反時計回りになるように
    ];
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * 指定サイズの逆ピラミッドジオメトリを生成します。
 * 立方体から角の三角錐を取り除いた形状です。
 * (Y軸+90度回転し、さらにY軸反転済み)
 * @param {number[]} size - [width, height, depth]。
 * @returns {THREE.BufferGeometry}
 */
function createInvPyramidGeometry(size) {
    const [width, height, depth] = size;
    const hw = width / 2, hh = height / 2, hd = depth / 2; // 半分のサイズ

    const geometry = new THREE.BufferGeometry();
    // 頂点座標 (Y軸+90度回転後、さらにY座標を反転)
    const vertices = new Float32Array([
        -hd,  hh, -hw, // 0
        -hd, -hh,  hw, // 1
         hd,  hh,  hw, // 2
        -hd, -hh, -hw, // 3
         hd,  hh, -hw, // 4
         hd, -hh,  hw, // 5
         hd, -hh, -hw, // 6
    ]);

    // 面インデックス (頂点のトポロジーは変わらないため、インデックスは同じ)
    const indices = [
        // 正方形 (3面)
        3, 0, 4,  3, 4, 6,
        5, 1, 3,  5, 3, 6,
        6, 4, 2,  6, 2, 5,
        // 直角二等辺三角形 (3面)
        3, 1, 0,
        0, 2, 4,
        5, 2, 1,
        // 正三角形 (切り口)
        0, 1, 2
    ];

    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals(); // 法線を自動計算
    return geometry;
}

/**
 * 未対応ブロック用の代替立方体ジオメトリ (1x1x1固定)。
 * @param {number[]} size - [width, height, depth] (未使用)。
 * @returns {THREE.BoxGeometry}
 */
function createUnknownBlockGeometry(size) {
    // 未対応ブロックは常に 1x1x1 で表示
    return new THREE.BoxGeometry(1, 1, 1);
}


// --- 公開関数 ---
/**
 * 指定されたタイプとサイズに対応するジオメトリを取得（または生成）します。
 * @param {string} type - ジオメトリのタイプ。
 * @param {number[]} size - サイズ [width, height, depth]。
 * @returns {THREE.BufferGeometry} 対応するジオメトリ。
 */
export function getBlockGeometry(type, size) {
    // size 配列が不正な場合のデフォルト値
    const validSize = Array.isArray(size) && size.length === 3 && size.every(Number.isFinite)
                    ? size
                    : [1, 1, 1]; // デフォルトは 1x1x1

    switch (type) {
        case 'cube':
            return getOrCreateGeometry(type, validSize, createCubeGeometry);
        case 'wedge':
            return getOrCreateGeometry(type, validSize, createWedgeGeometry);
        case 'pyramid':
            return getOrCreateGeometry(type, validSize, createPyramidGeometry);
        case 'invpyramid':
            return getOrCreateGeometry(type, validSize, createInvPyramidGeometry);
        case 'unknown_cube':
        default:
             // 未対応は常に 1x1x1
            return getOrCreateGeometry('unknown_cube', [1, 1, 1], createUnknownBlockGeometry);
    }
}