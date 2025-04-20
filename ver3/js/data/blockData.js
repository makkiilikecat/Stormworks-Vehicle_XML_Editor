import * as THREE from 'three';

// ブロックにユニークIDを付与するためのカウンター
let nextBlockId = 0;

/**
 * Stormworksのビークル内の単一ブロックのデータを表現するクラス。
 * 読み込み時または生成時に、データはThree.jsの座標系に変換されて格納されます。
 */
export class BlockData {
    /**
     * BlockDataインスタンスを作成します。
     * @param {string} definitionId - ブロック定義ID (例: '01_block', '02_wedge')。d属性がない場合は'01_block'が使われます。
     * @param {object} positionXml - ブロックの座標 {x, y, z} (XMLから読み込んだ値)。
     * @param {string | null} rotationString - 回転行列の文字列表現 "r11,r21,..." (XMLから読み込んだ値)。配置時はnullを許容。
     * @param {string | null} colorString - カラーインデックスの文字列表現 "idx1,c1,..." (XMLから読み込んだ値)。配置時はnullを許容。
     * @param {THREE.Matrix4} [initialMatrix=null] - (オプション) ブロック配置時に指定される初期向き(Three.js座標系)。指定された場合、rotationStringは無視されます。
     */
    constructor(definitionId, positionXml, rotationString, colorString, initialMatrix = null) {
        /** @type {number} アプリケーション内でユニークなブロックID */
        this.id = nextBlockId++;

        /** @type {string} ブロックの種類定義ID */
        this.definitionId = definitionId || '01_block'; // d属性がない場合のデフォルト

        /** @type {THREE.Vector3} Three.js座標系でのブロックの中心位置 */
        this.position = new THREE.Vector3(
            parseInt(positionXml?.x || '0', 10),
            parseInt(positionXml?.y || '0', 10),
            -parseInt(positionXml?.z || '0', 10) // Z座標の符号を反転
        );

        /** @type {THREE.Matrix4} Three.js座標系でのブロックの向きとスケールを表す行列 */
        // 配置時(initialMatrix指定あり)はそれを使い、読み込み時(initialMatrixなし)は文字列からパース・変換
        this.rotationMatrix = initialMatrix instanceof THREE.Matrix4
                              ? initialMatrix.clone() // 渡された行列をコピーして保持
                              : this.parseAndConvertRotationMatrix(rotationString); // 文字列から生成

        /** @type {number[]} ブロックのカラーパレットインデックス配列 */
        this.colorIndices = this.parseColorIndices(colorString);

        /** @type {THREE.Mesh | null} このデータに対応するThree.jsのメッシュオブジェクトへの参照 */
        this.mesh = null; // 初期状態ではnull (renderBlocksまたはplaceBlockで設定される)
    }

    /**
     * 回転行列の文字列(Stormworks形式)を解析し、
     * Three.js座標系へ変換したTHREE.Matrix4オブジェクトを生成します。
     * @param {string | null} rString - "r11,r21,r31,r12,r22,r32,r13,r23,r33" 形式の文字列。
     * @returns {THREE.Matrix4} 座標系変換された回転行列。無効または指定なしの場合は単位行列。
     * @private
     */
    parseAndConvertRotationMatrix(rString) {
        const matrix = new THREE.Matrix4(); // デフォルトは単位行列
        const defaultValues = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

        if (rString) {
            const values = rString.split(',').map(Number);
            if (values.length === 9 && values.every(v => !isNaN(v))) {
                // Stormworksの 'r' 属性 (列優先 3x3) を読み込む
                const [r11, r21, r31, r12, r22, r32, r13, r23, r33] = values;

                // Three.js座標系への変換 (Z軸反転): M_three = T * M_sw * T^-1
                // T = diag(1, 1, -1, 1)
                // Z成分(3行目)とZ基底(3列目)に関連する要素の符号が変わる
                matrix.set(
                     r11,  r12, -r13, 0, // Col 1 (X basis) - Z成分符号反転
                     r21,  r22, -r23, 0, // Col 2 (Y basis) - Z成分符号反転
                    -r31, -r32,  r33, 0, // Col 3 (Z basis) - X,Y成分符号反転
                     0,    0,    0,   1
                );
            } else {
                console.warn(`無効な回転行列文字列です: "${rString}"。単位行列を使用します。`);
                matrix.fromArray(defaultValues);
            }
        } else {
            // r属性がない場合は単位行列を使用
             matrix.fromArray(defaultValues);
        }
        return matrix;
    }

    /**
     * カラーインデックスの文字列を解析し、数値の配列を返します。
     * @param {string | null} scString - "idx1,c1,c2,..." 形式の文字列。
     * @returns {number[]} カラーインデックスの配列。無効または指定なしの場合は [0]。
     * @private
     */
    parseColorIndices(scString) {
        if (scString) {
            const indices = scString.split(',')
                                .map(s => parseInt(s.trim(), 10)) // trimを追加して空白に対応
                                .filter(n => !isNaN(n)); // 数値でないものは除外
            // 有効な数値が一つでもあればそれを返す
            if (indices.length > 0) {
                return indices;
            }
        }
        // sc属性がない、または解析結果が空の場合はデフォルト値 [0] を返す
        return [0];
    }
}