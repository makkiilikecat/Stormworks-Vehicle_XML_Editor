/**
 * @fileoverview 算術演算、ベクトル・行列操作などの数学的なユーティリティ関数を提供します。
 * ブロック変形、座標変換、t属性処理などに使用されます。
 */
import * as THREE from 'three';

/** ブロックの基本サイズ (Three.js 単位) */
export const BLOCK_SIZE = 1.0;
/** ドラッグ変形時の厚みの最小値 (縮退防止用) */
export const MIN_THICKNESS = 0.001;
/** 行列の体積がほぼゼロと見なす閾値 (縮退防止用) */
export const MIN_VOLUME_THRESHOLD = 1e-4;

/**
 * 指定された Matrix4 から特定の軸に対応する基底ベクトル（列ベクトル）を取得します。
 *
 * @param {THREE.Matrix4} matrix - 対象の行列。
 * @param {number} axisIndex - 取得する軸のインデックス (0: X軸, 1: Y軸, 2: Z軸)。
 * @param {THREE.Vector3} [targetVector=new THREE.Vector3()] - 結果を格納するベクトル (オプション)。
 * @returns {THREE.Vector3} 指定された軸の基底ベクトル。
 */
export function getBasisVector(matrix, axisIndex, targetVector = new THREE.Vector3()) {
    const te = matrix.elements; // 行列の要素配列 (列優先)
    const offset = axisIndex * 4; // 要素配列内でのオフセット計算
    // 指定された列の最初の3つの要素 (x, y, z 成分) を取得
    return targetVector.set(te[offset + 0], te[offset + 1], te[offset + 2]);
}

/**
 * 指定された Matrix4 の特定の軸に対応する基底ベクトル（列ベクトル）を設定します。
 * 行列の回転・スケール・せん断部分のみが変更されます。
 *
 * @param {THREE.Matrix4} matrix - 変更対象の行列。
 * @param {number} axisIndex - 設定する軸のインデックス (0: X軸, 1: Y軸, 2: Z軸)。
 * @param {THREE.Vector3} vector - 設定する新しい基底ベクトル。
 */
export function setBasisVector(matrix, axisIndex, vector) {
    const te = matrix.elements; // 行列の要素配列 (列優先)
    const offset = axisIndex * 4; // オフセット計算
    // 指定された列の最初の3つの要素 (x, y, z 成分) を設定
    te[offset + 0] = vector.x;
    te[offset + 1] = vector.y;
    te[offset + 2] = vector.z;
    // 4行目 (平行移動成分に影響を与えないように) は 0 または 1 に設定
    te[3] = 0; te[7] = 0; te[11] = 0; te[15] = 1;
}

/**
 * 行列の回転・スケール・せん断部分の要素（左上3x3）を最も近い整数に丸めます。
 * さらに、各基底ベクトルの長さが MIN_THICKNESS 未満にならないようにクランプし、
 * 行列の縮退（体積ゼロ）を防ぎます。
 *
 * @param {THREE.Matrix4} matrix - 変更対象の行列。行列は直接変更されます。
 */
export function roundAndClampMatrix(matrix) {
    const te = matrix.elements;
    const _vec = new THREE.Vector3(); // 計算用の一時ベクトル

    // 左上3x3部分の要素を丸める
    te[0] = Math.round(te[0]); te[1] = Math.round(te[1]); te[2] = Math.round(te[2]);
    te[4] = Math.round(te[4]); te[5] = Math.round(te[5]); te[6] = Math.round(te[6]);
    te[8] = Math.round(te[8]); te[9] = Math.round(te[9]); te[10] = Math.round(te[10]);

    // 4列目、4行目をリセット（回転・スケール・せん断のみを対象とするため）
    te[3] = 0; te[7] = 0; te[11] = 0;
    te[12] = 0; te[13] = 0; te[14] = 0; te[15] = 1; // ★ 修正：平行移動成分もクリア

    // 各基底ベクトルの長さをチェックし、MIN_THICKNESS 未満ならクランプ
    for (let i = 0; i < 3; i++) {
        const basis = getBasisVector(matrix, i, _vec);
        const lengthSq = basis.lengthSq(); // 平方根計算を避けるため2乗で比較
        if (lengthSq < MIN_THICKNESS * MIN_THICKNESS) {
            if (lengthSq > 1e-9) { // ほぼゼロベクトルでない場合
                basis.setLength(MIN_THICKNESS); // 最小厚みに設定
            } else {
                // 完全なゼロベクトルの場合、対応する軸方向に最小厚みを持つベクトルを設定
                // （例：X軸がゼロなら (MIN_THICKNESS, 0, 0) にする）
                basis.set(0, 0, 0).setComponent(i, MIN_THICKNESS);
            }
            setBasisVector(matrix, i, basis); // クランプしたベクトルを行列に書き戻す
        }
    }
    // ★ 修正：平行移動成分を再度設定（通常は(0,0,0)のはずだが、念のため）
    te[12] = 0; te[13] = 0; te[14] = 0;
}

/**
 * ワールド空間の法線ベクトルとオブジェクトのワールド行列から、
 * その法線がオブジェクトのローカル座標系のどの軸 (+X, -X, +Y, -Y, +Z, -Z) に
 * 最も近いかを判定します。ドラッグ変形などで操作軸を特定するのに使用します。
 *
 * @param {THREE.Vector3} worldNormal - ワールド空間での面の法線ベクトル (正規化済みであること)。
 * @param {THREE.Matrix4} objectMatrix - オブジェクトのワールド行列。
 * @returns {{axisIndex: number, sign: number}} ローカル軸情報。
 * axisIndex: 0(X), 1(Y), 2(Z)。 sign: +1 または -1。
 */
export function getLocalAxisInfoFromWorldNormal(worldNormal, objectMatrix) {
    const localNormal = worldNormal.clone(); // 元のベクトルを変更しないようにコピー
    const _quat = new THREE.Quaternion();
    const _pos = new THREE.Vector3();
    const _scale = new THREE.Vector3();
    const _vec = new THREE.Vector3();

    // オブジェクトのワールド行列から回転成分(Quaternion)を抽出
    objectMatrix.decompose(_pos, _quat, _scale);
    // ワールド法線をオブジェクトのローカル座標系に変換
    // (ワールド回転の逆クォータニオンを適用する)
    const invQuat = _quat.invert();
    localNormal.applyQuaternion(invQuat).normalize(); // ローカル空間での法線ベクトル

    let maxDot = -1;     // 内積の最大値（絶対値）を記録
    let axisIndex = 0;   // 最も近いローカル軸のインデックス
    let sign = 1;        // その軸の向き (+1 or -1)

    // ローカル座標系の各軸ベクトル (X, Y, Z) とローカル法線の内積を計算
    for (let i = 0; i < 3; i++) {
        _vec.set(0, 0, 0).setComponent(i, 1); // ローカル軸ベクトル (例: (1,0,0))
        const dot = localNormal.dot(_vec);   // 内積を計算
        const absDot = Math.abs(dot);        // 絶対値を取得

        // これまでで最も内積の絶対値が大きい軸を記録
        if (absDot > maxDot) {
            maxDot = absDot;
            axisIndex = i;
            sign = Math.sign(dot) || 1; // 符号を取得 (0の場合は+1とする)
        }
    }
    return { axisIndex, sign };
}

/**
 * オブジェクトのワールド行列と、上記の `getLocalAxisInfoFromWorldNormal` で得られた
 * ローカル軸情報に基づいて、対応する面のワールド中心座標を計算します。
 * ドラッグ変形操作の基準点などに使用します。
 *
 * @param {THREE.Matrix4} objectMatrix - オブジェクトのワールド行列。
 * @param {{axisIndex: number, sign: number}} axisInfo - 操作対象のローカル軸情報。
 * @returns {THREE.Vector3} 計算された面のワールド中心座標。
 */
export function getFaceCenterWorld(objectMatrix, axisInfo) {
    const localCenter = new THREE.Vector3(); // 面の中心のローカル座標
    const _basisVec = new THREE.Vector3();

    // 指定されたローカル軸の基底ベクトル（ワールド座標系）を取得
    const basis = getBasisVector(objectMatrix, axisInfo.axisIndex, _basisVec);
    // その軸方向の厚み（ベクトルの長さ）を計算 (最小厚みを保証)
    const thickness = Math.max(basis.length(), MIN_THICKNESS);

    // 面の中心のローカル座標を計算
    // (対応する軸方向に、厚みの半分だけ、軸情報の符号方向にずらす)
    localCenter.setComponent(axisInfo.axisIndex, axisInfo.sign * thickness / 2);

    // 計算したローカル中心座標をワールド座標系に変換して返す
    return localCenter.applyMatrix4(objectMatrix);
}


/**
 * t属性値 (0-7) に対応する変換行列 (回転/反転) を返します。
 * この行列は、ブロックの基本ジオメトリに適用され、XMLの 't' 属性で指定される
 * ブロックの向きを実現します。
 *
 * @param {number} tValue - t属性値 (0-7)。
 * @returns {THREE.Matrix4} 対応する変換行列 (回転や反転を含む)。無効な値の場合は単位行列。
 */
export function getTAttributeMatrix(tValue) {
    const matrix = new THREE.Matrix4();
    // ★注意: 以下の各ケースの具体的な回転内容は、元のコードや
    // Stormworksの実際の挙動に合わせて正確に記述する必要があります。
    // これは一般的な回転の例です。
    switch (tValue) {
        case 0: matrix.makeScale( 1,  1,  1); break; // {+X,+Y,+Z}
        case 1: matrix.makeScale(-1,  1,  1); break; // {-X,+Y,+Z}
        case 2: matrix.makeScale( 1, -1,  1); break; // {+X,-Y,+Z} - ユーザー定義
        case 3: matrix.makeScale(-1, -1,  1); break; // {-X,-Y,+Z} - ユーザー定義
        case 4: matrix.makeScale( 1,  1, -1); break; // {+X,+Y,-Z} - ユーザー定義
        case 5: matrix.makeScale(-1,  1, -1); break; // {-X,+Y,-Z} - ユーザー定義
        case 6: matrix.makeScale( 1, -1, -1); break; // {+X,-Y,-Z} - ユーザー定義
        case 7: matrix.makeScale(-1, -1, -1); break; // {-X,-Y,-Z} - ユーザー定義
        default:
            console.warn(`[mathUtils] 無効なt属性値 ${tValue} が指定されました。単位行列を使用します。`);
            matrix.identity(); // 不明な値は無回転
            break;
    }
    return matrix;
}