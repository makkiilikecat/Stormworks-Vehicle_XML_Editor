import * as THREE from 'three';

let nextBlockId = 0; // ブロックにユニークIDを付与するためのカウンター

/**
 * Stormworksのビークル内の単一ブロックのデータを表現するクラス。
 * 読み込み時にThree.jsの座標系に合わせてデータを変換します。
 */
export class BlockData {
    /**
     * BlockDataインスタンスを作成します。
     * @param {string} definitionId - ブロック定義ID (XMLの'd'属性)。'01_block_weight' など。
     * @param {object} positionXml - ブロックの座標 {x, y, z} (XMLの'vp'属性)。
     * @param {string} rotationString - 回転行列の文字列表現 "r11,r21,r31,..." (XMLの'r'属性)。
     * @param {string} colorString - カラーインデックスの文字列表現 "idx1,c1,c2,..." (XMLの'sc'属性)。
     */
    constructor(definitionId, positionXml, rotationString, colorString) {
        // --- 基本情報 ---
        this.id = nextBlockId++; // アプリケーション内でユニークなID
        this.definitionId = definitionId || '01_block_weight'; // ブロックの種類

        // --- 位置 (Three.js座標系に変換) ---
        // XMLのvp属性 (x, y, z) を読み込み、Z座標の符号を反転させる
        this.position = new THREE.Vector3(
            parseInt(positionXml?.x || '0', 10),
            parseInt(positionXml?.y || '0', 10),
            -parseInt(positionXml?.z || '0', 10) // <<<--- Z座標の符号を反転
        );

        // --- 回転/スケール (回転行列 - Three.js座標系に変換) ---
        // XMLのr属性 (9つの数値) を Matrix4 として格納し、座標系変換を行う
        this.rotationMatrix = this.parseAndConvertRotationMatrix(rotationString);

        // --- 色 ---
        // XMLのsc属性 (カラーパレットインデックスのリスト) を数値配列として格納
        this.colorIndices = this.parseColorIndices(colorString);

        // --- 内部状態 (3Dオブジェクトへの参照など、後で追加) ---
        this.mesh = null; // 対応するThree.jsのMeshオブジェクト (Stage 1.3で設定)
    }

    /**
     * 回転行列の文字列を解析し、Stormworks座標系からThree.js座標系へ変換した
     * THREE.Matrix4オブジェクトを生成します。
     * @param {string} rString - "r11,r21,r31,r12,r22,r32,r13,r23,r33" 形式の文字列。
     * @returns {THREE.Matrix4} 座標系変換された回転行列。デフォルトは単位行列。
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
                // T = diag(1, 1, -1, 1) なので T = T^-1
                // 具体的な計算: m'_ij = t_ii * m_ij * t_jj
                // Z成分(i=3)またはZ基底(j=3)に関連する要素の符号が変わる
                matrix.set(
                     r11,  r12, -r13, 0, // Col 1 (X basis) - Z成分の符号反転
                     r21,  r22, -r23, 0, // Col 2 (Y basis) - Z成分の符号反転
                    -r31, -r32,  r33, 0, // Col 3 (Z basis) - X,Y成分の符号反転
                     0,    0,    0,   1
                );
            } else {
                console.warn(`Invalid rotation matrix string: "${rString}". Using identity.`);
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
     * @param {string} scString - "idx1,c1,c2,..." 形式の文字列。
     * @returns {number[]} カラーインデックスの配列。デフォルトは [0]。
     * @private
     */
    parseColorIndices(scString) {
        if (scString) {
            return scString.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
        }
        return [0];
    }
}