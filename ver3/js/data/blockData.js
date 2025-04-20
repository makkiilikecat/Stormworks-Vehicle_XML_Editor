import * as THREE from 'three';
// --- 修正: coordinateConverter をインポート ---
import {
    positionFromXml,
    rotationMatrixFromXmlString,
    positionToXml,
    rotationMatrixToXmlElements,
    rotationMatrixFromXmlElements // setRotationMatrixFromXmlElements で使用
} from '../utils/coordinateConverter.js';
// -----------------------------------------

let nextBlockId = 0; // アプリケーション内でユニークIDを付与するためのカウンター

/**
 * Stormworksのビークル内の単一ブロックのデータを表現するクラス。
 * 位置と回転行列は内部的にThree.js座標系で保持します。
 * XML座標系との変換は coordinateConverter を介して行います。
 */
export class BlockData {
    /**
     * BlockDataインスタンスを作成します。
     * @param {string} definitionId - ブロック定義ID (XMLの'd'属性)。
     * @param {object} positionXml - ブロックの座標 {x, y, z} (XMLの値)。
     * @param {string} rotationString - 回転行列の文字列表現 "r11,r21,..." (XMLの値)。
     * @param {string} colorString - カラーインデックスの文字列表現 (XMLの値)。
     * @param {THREE.Matrix4} [initialMatrix] - (オプション) 配置時に指定される初期向き(Three.js座標系)。指定されない場合はrotationStringから生成。
     */
    constructor(definitionId, positionXml, rotationString, colorString, initialMatrix = null) {
        this.id = nextBlockId++;
        this.definitionId = definitionId || '01_block'; // d属性がない場合は通常ブロック

        // --- 位置 (XMLからThree.js座標系へ変換して保持) ---
        this.position = positionFromXml(positionXml);

        // --- 回転/スケール (XML文字列または初期MatrixからThree.js座標系へ変換して保持) ---
        this.rotationMatrix = initialMatrix instanceof THREE.Matrix4
                              ? initialMatrix.clone() // 配置時の向きを優先
                              : rotationMatrixFromXmlString(rotationString); // 読み込み時は文字列から

        // --- 色 ---
        this.colorIndices = this.parseColorIndices(colorString);

        // --- 3Dオブジェクトへの参照 ---
        this.mesh = null; // 対応するThree.jsのMeshオブジェクト
    }

    /**
     * カラーインデックスの文字列を解析し、数値の配列を返します。
     * @param {string} scString - "idx1,c1,c2,..." 形式の文字列。
     * @returns {number[]} カラーインデックスの配列。デフォルトは [0]。
     * @private
     */
    parseColorIndices(scString) {
        if (scString) {
            // カンマで分割し、各要素を数値に変換
            return scString.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
        }
        return [0]; // sc属性がない場合はデフォルト値
    }

    // --- XML座標系アクセス用メソッド (coordinateConverterを使用) ---

    /**
     * XML座標系での位置を取得します (z反転、整数)。
     * @returns {{x: number, y: number, z: number}} XML座標系の位置。
     */
    getPositionXml() {
        return positionToXml(this.position);
    }

    /**
     * XML座標系での回転行列要素 (r属性の9要素、列優先) を取得します (整数)。
     * @returns {number[]} 9つの整数要素の配列 [r11, r21, r31, r12, ...]。
     */
    getRotationMatrixXmlElements() {
        return rotationMatrixToXmlElements(this.rotationMatrix);
    }

    /**
     * XML座標系での位置を設定します。内部ではThree.js座標系に変換されます。
     * 関連付けられたメッシュの位置も更新します。
     * @param {number} x - X座標 (XML座標系)。
     * @param {number} y - Y座標 (XML座標系)。
     * @param {number} z - Z座標 (XML座標系)。
     */
    setPositionFromXml(x, y, z) {
        // coordinateConverterを使ってThree.js座標に変換して内部状態を更新
        this.position = positionFromXml({ x, y, z });

        // 関連付けられたメッシュも更新
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            // メッシュの行列の位置情報も更新 (matrixAutoUpdate = false のため)
            this.mesh.matrix.setPosition(this.position);
            this.mesh.matrixWorldNeedsUpdate = true; // ワールド行列の更新フラグ
        }
    }

    /**
     * XML座標系での回転行列要素 (r属性の9要素、列優先) を設定します。
     * 内部ではThree.js座標系のMatrix4に変換されます。
     * 関連付けられたメッシュの回転・スケールも更新します。
     * @param {number[]} elements - 9つの整数要素の配列 [r11, r21, r31, r12, ...]。
     */
    setRotationMatrixFromXmlElements(elements) {
        // coordinateConverterを使ってThree.jsのMatrix4に変換して内部状態を更新
        this.rotationMatrix = rotationMatrixFromXmlElements(elements);

         // 関連付けられたメッシュも更新
         if (this.mesh) {
             // メッシュの行列の回転・スケール部分をコピー
             // (setPositionは別途行われるか、ここで行う)
             this.mesh.matrix.copy(this.rotationMatrix);
             // 位置情報は現在のメッシュの位置を維持（またはBlockDataのpositionを再適用）
             this.mesh.matrix.setPosition(this.position);
             this.mesh.matrixWorldNeedsUpdate = true; // ワールド行列の更新フラグ
         }
    }
}