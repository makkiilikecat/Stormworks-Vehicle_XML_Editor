/**
 * @fileoverview プログラムによって指定サイズの単純なブロック形状ジオメトリを生成します。
 * 各カスタムジオメトリに、面ごとの色分け（マルチマテリアル）のためのグループ情報を追加します。
 *
 * 【注意】
 * - 各カスタムジオメトリの geometry.addGroup で指定している materialIndex (0-5) は、
 * 標準的な面（+X, -X, +Y, -Y, +Z, -Z）への仮のマッピングです。
 * Stormworksの仕様や期待する色分けに合わせて、このマッピングの調整が必要になる場合があります。
 * - 頂点座標(vertices)や面定義(indices)はユーザー提供のものが正しいという前提で変更していません。
 */

import * as THREE from 'three';

// 生成したジオメトリをキャッシュするためのMap
const geometryCache = new Map();

/**
 * ジオメトリをキャッシュから取得、または生成してキャッシュに保存します。
 * キャッシュキーにはタイプとサイズを含めます。
 * @param {string} type - 形状タイプ ('cube', 'wedge', 'pyramid', 'invpyramid', 'unknown_cube')。
 * @param {number[]} size - サイズ配列 [width, height, depth]。
 * @param {function(number[]): THREE.BufferGeometry} generatorFunc - ジオメトリ生成関数。
 * @returns {THREE.BufferGeometry} キャッシュされた、または新しく生成されたジオメトリ。
 * @private
 */
function getOrCreateGeometry(type, size, generatorFunc) {
    const cacheKey = `${type}_${size.join('x')}`; // 例: 'cube_1x1x1', 'wedge_1x2x1'
    if (!geometryCache.has(cacheKey)) {
        console.log(`[ProceduralMeshes] Generating geometry cache for: ${cacheKey}`);
        geometryCache.set(cacheKey, generatorFunc(size));
    }
    return geometryCache.get(cacheKey);
}

// === ジオメトリ生成関数 ===

/**
 * 指定されたサイズの立方体 (Box) ジオメトリを生成します。
 * 面ごとの materialIndex をカスタムマッピングするために、
 * THREE.BoxGeometry の代わりにカスタム BufferGeometry を使用します。
 * @param {number[]} size - サイズ配列 [width, height, depth]。
 * @returns {THREE.BufferGeometry} 生成された立方体ジオメトリ。
 */
function createCubeGeometry(size) {
    const [width, height, depth] = size;
    const hw = width / 2, hh = height / 2, hd = depth / 2;

    const geometry = new THREE.BufferGeometry();

    // 1. 頂点座標 (vertices) を定義
    // 立方体の8つの頂点座標を定義します (例: 中心が原点の場合)
    const vertices = new Float32Array([
        // 手前 (-Z = hd)
        -hw, -hh,  hd,  // 0: 左下前
         hw, -hh,  hd,  // 1: 右下前
         hw,  hh,  hd,  // 2: 右上前
        -hw,  hh,  hd,  // 3: 左上前
        // 奥 (+Z = -hd) ※Three.js座標系に注意
        -hw, -hh, -hd,  // 4: 左下奥
         hw, -hh, -hd,  // 5: 右下奥
         hw,  hh, -hd,  // 6: 右上奥
        -hw,  hh, -hd   // 7: 左上奥
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    // 2. 面インデックス (indices) を定義
    // 各面を2つの三角形で定義します (合計12三角形、36インデックス)。
    // ★★★ 頂点の巻順 (反時計回り) と、どの頂点を使うかが重要です ★★★
    const indices = [
        // +X (右面): 1, 5, 6,  1, 6, 2
        1, 5, 6,  1, 6, 2,  // start=0, count=6
        // -X (左面): 4, 0, 3,  4, 3, 7
        4, 0, 3,  4, 3, 7,  // start=6, count=6
        // +Y (上面): 3, 2, 6,  3, 6, 7
        3, 2, 6,  3, 6, 7,  // start=12, count=6
        // -Y (下面): 4, 5, 1,  4, 1, 0
        4, 5, 1,  4, 1, 0,  // start=18, count=6
        // +Z (前面): 0, 1, 2,  0, 2, 3
        0, 1, 2,  0, 2, 3,  // start=24, count=6
        // -Z (後面): 5, 4, 7,  5, 7, 6
        5, 4, 7,  5, 7, 6   // start=30, count=6
    ];
    geometry.setIndex(indices);

    geometry.addGroup(30, 6, 0); // -Z face
    geometry.addGroup(24, 6, 1); // +Z face
    geometry.addGroup(12, 6, 2); // +Y face
    geometry.addGroup(18, 6, 3); // -Y face
    geometry.addGroup(6, 6, 4);  // -X face
    geometry.addGroup(0, 6, 5);  // +X face
    
    geometry.computeVertexNormals();

    return geometry; // 生成したカスタムジオメトリを返す
}

/**
 * 指定されたサイズのウェッジ（三角柱）ジオメトリを生成します。
 * 5つの面に対応するグループ情報を追加します。
 * @param {number[]} size - サイズ配列 [width, height, depth]。
 * @returns {THREE.BufferGeometry} 生成されたウェッジジオメトリ。
 */
function createWedgeGeometry(size) {
    const [width, height, depth] = size;
    const hw = width / 2, hh = height / 2, hd = depth / 2; // 半分のサイズ

    const geometry = new THREE.BufferGeometry();
    // 頂点座標 (ユーザー提供のものが正しい前提)
    // 底面がXZ平面、高さがY方向、斜面が+Z側にあるウェッジと想定
    const vertices = new Float32Array([
        // Y = -hh (底面)
        -hw, -hh,  hd, // 0: 左下前
         hw, -hh,  hd, // 1: 右下前
         hw, -hh, -hd, // 2: 右下奥
        -hw, -hh, -hd, // 3: 左下奥
        // Y = hh (上稜線)
        -hw,  hh, -hd, // 4: 左上奥
         hw,  hh, -hd, // 5: 右上奥
    ]);

    // 面インデックス (ユーザー提供のものが正しい前提)
    // 各コメントは面の向きを示す（外側から見て反時計回り）
    const indices = [
        // 底面 (2 triangles, 6 indices)
        0, 2, 1,  0, 3, 2, // start=0, count=6
        // 後面 (2 triangles, 6 indices)
        3, 5, 2,  3, 4, 5, // start=6, count=6
        // 斜面 (2 triangles, 6 indices)
        0, 1, 5,  0, 5, 4, // start=12, count=6
        // 右側面 (1 triangle, 3 indices)
        1, 2, 5,           // start=18, count=3
        // 左側面 (1 triangle, 3 indices)
        3, 0, 4            // start=21, count=3
    ];

    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    // --- グループ情報の追加 ---
    // materialIndex の割り当ては仮。Stormworksの仕様に合わせて要調整。
    // 想定マッピング: 0:+X, 1:-X, 2:+Y, 3:-Y, 4:+Z, 5:-Z
    geometry.addGroup(21, 3, 0); // 左側面 -> -X face (index 1)
    geometry.addGroup(18, 3, 1); // 右側面 -> +X face (index 0)
    geometry.addGroup(6, 6, 2);  // 後面 -> -Z face (index 5)
    geometry.addGroup(0, 6, 3);  // 底面 -> -Y face (index 3)
    geometry.addGroup(12, 6, 4); // 斜面 -> +Z face (index 4) ?? (要確認)

    geometry.computeVertexNormals(); // 法線を計算
    return geometry;
}


/**
 * 指定されたサイズのピラミッド（四角錐/三角錐）ジオメトリを生成します。
 * 頂点定義に基づき、4つの面に対応するグループ情報を追加します。
 * @param {number[]} size - サイズ配列 [width, height, depth]。
 * @returns {THREE.BufferGeometry} 生成されたピラミッドジオメトリ。
 */
function createPyramidGeometry(size) {
     const [width, height, depth] = size;
     // hw, hh, hd はこの定義では直接使われない

    const geometry = new THREE.BufferGeometry();
    // 頂点座標 (ユーザー提供のものが正しい前提 - 直角三角錐)
    const vertices = new Float32Array([
        0.0, 0.0, 0.0,   // 0: Origin (Right-angle corner)
        0.0, 0.0, width, // 1: On +Z axis (adjust based on size if needed)
        0.0, height, 0.0,// 2: On +Y axis
       -depth, 0.0, 0.0  // 3: On -X axis (adjust based on size if needed)
    ]);

    // 面インデックス (ユーザー提供のものが正しい前提)
    const indices = [
        // 面 1 (元XY平面に対応, YZ平面上の面) : 頂点 0, 2, 1 (3 indices)
        0, 2, 1, // start=0, count=3
        // 面 2 (元XZ平面に対応, XY平面上の面) : 頂点 0, 1, 3 (3 indices)
        0, 1, 3, // start=3, count=3
        // 面 3 (元YZ平面に対応, XZ平面上の面) : 頂点 0, 3, 2 (3 indices)
        0, 3, 2, // start=6, count=3
        // 面 4 (斜面) : 頂点 1, 2, 3 (3 indices)
        1, 2, 3  // start=9, count=3
    ];

    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    // --- グループ情報の追加 ---
    // materialIndex の割り当ては非常に不確実。Stormworksの仕様に合わせて要検証・調整。
    // ここでは仮に 0, 1, 2, 3 を割り当てる。

    geometry.addGroup(0, 3, 0); // 面1 (YZ平面?) -> 仮に -Z (index 5)
    geometry.addGroup(6, 3, 1); // 面3 (XY平面?) -> 仮に -X (index 1)
    geometry.addGroup(3, 3, 2); // 面2 (XZ平面?) -> 仮に -Y (index 3)
    geometry.addGroup(9, 3, 3); // 斜面 -> 仮に +X (index 0)

    geometry.computeVertexNormals();
    return geometry;
}

/**
 * 指定されたサイズの逆ピラミッドジオメトリを生成します。
 * 立方体から角の三角錐を取り除いた形状です。
 * 面に対応するグループ情報を追加します。
 * @param {number[]} size - サイズ配列 [width, height, depth]。
 * @returns {THREE.BufferGeometry} 生成された逆ピラミッドジオメトリ。
 */
function createInvPyramidGeometry(size) {
    const [width, height, depth] = size;
    const hw = width / 2, hh = height / 2, hd = depth / 2; // 半分のサイズ

    const geometry = new THREE.BufferGeometry();
    // 頂点座標 (ユーザー提供のものが正しい前提)
    const vertices = new Float32Array([
        -hd,  hh, -hw, // 0
        -hd, -hh,  hw, // 1
         hd,  hh,  hw, // 2
        -hd, -hh, -hw, // 3
         hd,  hh, -hw, // 4
         hd, -hh,  hw, // 5
         hd, -hh, -hw, // 6
    ]);

    // 面インデックス (ユーザー提供のものが正しい前提)
    // 各コメントは論理的な面を示す
    const indices = [
        // 面 1: -X面 (後ろ, 2 triangles, 6 indices) : 3, 0, 4,  3, 4, 6
        3, 0, 4,  3, 4, 6, // start=0, count=6
        // 面 2: -Y面 (下, 2 triangles, 6 indices) : 5, 1, 3,  5, 3, 6
        5, 1, 3,  5, 3, 6, // start=6, count=6
        // 面 3: +Z面 (右, 2 triangles, 6 indices) : 6, 4, 2,  6, 2, 5
        6, 4, 2,  6, 2, 5, // start=12, count=6
        // 面 4: -Z面 (左, 1 triangle, 3 indices) : 3, 1, 0
        3, 1, 0,           // start=18, count=3
        // 面 5: +X面 (前, 1 triangle, 3 indices) : 0, 2, 4
        0, 2, 4,           // start=21, count=3
        // 面 6: +Y面 (上, 1 triangle, 3 indices) : 5, 2, 1
        5, 2, 1,           // start=24, count=3
        // 面 7: 斜めカット面 (1 triangle, 3 indices) : 0, 1, 2
        0, 1, 2            // start=27, count=3
    ];

    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    // --- グループ情報の追加 ---
    // materialIndex の割り当ては仮。Stormworksの仕様に合わせて要調整。
    // 6面+カット面なので、どの面をどのインデックス(0-5)に割り当てるか、
    // またはカット面をどう扱うか（例: baseColorを使うなど）の定義が必要。
    geometry.addGroup(12, 6, 0); // 面3 (+X)
    geometry.addGroup(0, 6, 1);  // 面1 (+Z)
    geometry.addGroup(6, 6, 2);  // 面2 (-Y)
    geometry.addGroup(21, 3, 3); // 面5 (+Y)
    geometry.addGroup(18, 3, 4); // 面4 (-X)
    geometry.addGroup(24, 3, 5); // 面6 (-Z)
    geometry.addGroup(27, 3, 6); // 面7 (カット面) -> 仮に index 0

    geometry.computeVertexNormals(); // 法線を自動計算
    return geometry;
}

/**
 * 未対応または不明なブロックタイプ用の代替立方体ジオメトリ (1x1x1固定) を生成します。
 * グループ情報は BoxGeometry が自動で持ちます。
 * @param {number[]} size - サイズ配列 [width, height, depth] (この関数では未使用)。
 * @returns {THREE.BoxGeometry} 1x1x1の立方体ジオメトリ。
 */
function createUnknownBlockGeometry(size) {
    // 未対応ブロックは常に 1x1x1 で表示
    return new THREE.BoxGeometry(1, 1, 1);
}


// --- 公開関数 ---
/**
 * 指定されたタイプとサイズに対応するジオメトリを取得（または生成）します。
 * ジオメトリキャッシュを利用します。
 * @param {string} type - ジオメトリのタイプ ('cube', 'wedge', 'pyramid', 'invpyramid', 'unknown_cube')。
 * @param {number[]} size - サイズ配列 [width, height, depth]。
 * @returns {THREE.BufferGeometry} 対応するジオメトリインスタンス。
 */
export function getBlockGeometry(type, size) {
    // size 配列が不正な場合のデフォルト値 (1x1x1)
    const validSize = Array.isArray(size) && size.length === 3 && size.every(Number.isFinite)
                    ? size
                    : [1, 1, 1];

    // タイプに応じて適切な生成関数を呼び出し、キャッシュを管理
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
             // 未対応タイプは常に 1x1x1 の立方体
            return getOrCreateGeometry('unknown_cube', [1, 1, 1], createUnknownBlockGeometry);
    }
}