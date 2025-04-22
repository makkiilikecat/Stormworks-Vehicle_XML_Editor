/**
 * @fileoverview Stormworksのビークル内の単一ブロックのデータを表現するクラス。
 * 内部状態はThree.js座標系で保持し、XML座標系との変換メソッドを提供。
 * また、関連する3Dメッシュの更新機能も持つ。
 */

import * as THREE from 'three';
// 座標系変換ユーティリティをインポート
import {
    positionFromXml,          // XML座標 -> Three.js Vector3
    rotationMatrixFromXmlString, // XML回転文字列 -> Three.js Matrix4
    positionToXml,            // Three.js Vector3 -> XML座標オブジェクト
    rotationMatrixToXmlElements, // Three.js Matrix4 -> XML回転要素配列
    rotationMatrixFromXmlElements // XML回転要素配列 -> Three.js Matrix4
} from '../utils/coordinateConverter.js';
// ★修正: ブロック定義情報取得関数をインポート (循環参照は現状発生しない)
import { getBlockDefinition } from '../data/blockDefinitions.js';

// --- モジュール内変数 ---
// ユニークなブロックIDを生成するためのカウンター
let nextBlockId = 0;

/**
 * Stormworksのビークル内の単一ブロックのデータを表現するクラス。
 * 位置と回転は内部的にThree.js座標系の Vector3 と Matrix4 で保持します。
 */
export class BlockData {
    /**
     * BlockDataインスタンスを作成します。
     * @param {string | null} definitionId - ブロック定義ID ('d'属性)。nullの場合は'01_block'。
     * @param {object | null} positionXml - XML座標系の位置 {x, y, z}。nullの場合は原点。
     * @param {string | null} rotationString - XML回転行列文字列 ('r'属性)。nullの場合は単位行列。
     * @param {string | null} colorString - XML色インデックス文字列 ('sc'属性)。nullの場合は"0"。
     * @param {THREE.Matrix4} [initialMatrix] - (オプション) Three.js座標系の初期向き行列。rotationStringより優先される。
     */
    constructor(definitionId, positionXml, rotationString, colorString, initialMatrix = null) {
        // ユニークIDを割り当て
        this.id = nextBlockId++;
        // ブロック定義ID (nullならデフォルト)
        this.definitionId = definitionId || '01_block';

        // 内部状態 (Three.js座標系)
        // 位置: XML座標からVector3に変換
        this.position = positionFromXml(positionXml || {x:0, y:0, z:0});
        // 回転: initialMatrixがあれば優先、なければXML文字列からMatrix4に変換
        this.rotationMatrix = initialMatrix instanceof THREE.Matrix4
                              ? initialMatrix.clone()
                              : rotationMatrixFromXmlString(rotationString); // rotationStringがnullでも単位行列が返る
        // 色情報: 文字列を数値配列にパース
        this.colorIndices = this.parseColorIndices(colorString || "0");

        // 関連する3Dメッシュへの参照 (初期値はnull)
        this.mesh = null;           // 通常表示用の実サイズモデル
        this.foregroundMesh = null; // XML編集モード用の前景キューブ (1x1x1)

        // console.log(`[BlockData] Block ID ${this.id} 作成: Def=${this.definitionId}, Pos=${this.position.x},${this.position.y},${this.position.z}`);
    }

    /**
     * カラーインデックスの文字列 ('sc'属性) を数値配列にパースします。
     * 不正な値はフィルタリングされます。
     * @param {string} scString - 'sc'属性の文字列。
     * @returns {number[]} パースされた数値の配列。最低1要素 (0) を保証。
     * @private
     */
    parseColorIndices(scString) {
        const indices = scString.split(',')             // カンマで分割
                               .map(s => parseInt(s, 10)) // 10進数に変換
                               .filter(n => !isNaN(n));   // NaNを除去
        // 配列が空になった場合はデフォルトの [0] を返す
        return indices.length > 0 ? indices : [0];
    }

    // --- XML座標系アクセス用メソッド ---

    /**
     * 現在の内部位置 (Three.js座標系) をXML座標系のオブジェクトとして取得します。
     * Z座標の反転と整数への丸めが行われます。
     * @returns {{x: number, y: number, z: number}} XML座標系の位置オブジェクト。
     */
    getPositionXml() {
        return positionToXml(this.position);
    }

    /**
     * 現在の内部回転行列 (Three.js座標系) をXMLの 'r' 属性に対応する
     * 9つの整数要素の配列 (列優先) として取得します。
     * 座標系の変換と整数への丸めが行われます。
     * @returns {number[]} 9つの整数要素の配列 [r11, r21, r31, r12, ...]。
     */
    getRotationMatrixXmlElements() {
        return rotationMatrixToXmlElements(this.rotationMatrix);
    }

    // --- 内部状態設定メソッド (主にXML編集UIや履歴から使用) ---

    /**
     * XML座標系の位置 (x, y, z) を指定して、内部の Three.js 位置を更新します。
     * 同時に、紐づくメッシュのワールド行列も更新します。
     * @param {number} x - X座標 (XML座標系)。
     * @param {number} y - Y座標 (XML座標系)。
     * @param {number} z - Z座標 (XML座標系)。
     */
    setPositionFromXml(x, y, z) {
        // coordinateConverter を使ってThree.js座標に変換して格納
        this.position = positionFromXml({x, y, z});
        // console.log(`[BlockData ID ${this.id}] 位置更新 (XMLから): ${x},${y},${z} -> Three.js:`, this.position);
        // 紐づくメッシュのワールド行列を更新
        this.updateMeshMatrix();
    }

    /**
     * XML座標系の回転行列要素 (9つの整数配列、列優先) を指定して、
     * 内部の Three.js 回転行列 (Matrix4) を更新します。
     * 同時に、紐づくメッシュのワールド行列も更新します。
     * @param {number[]} elements - 9つの整数要素の配列 [r11, r21, r31, r12, ...]。
     */
    setRotationMatrixFromXmlElements(elements) {
         // coordinateConverter を使ってThree.js Matrix4に変換して格納
        this.rotationMatrix = rotationMatrixFromXmlElements(elements);
        // console.log(`[BlockData ID ${this.id}] 回転更新 (XML要素から)`);
        // 紐づくメッシュのワールド行列を更新
        this.updateMeshMatrix();
    }

    // --- メッシュ更新 ---

    /**
     * このBlockDataに紐づく全てのメッシュ（通常モデルと前景キューブ）の
     * ワールド行列を現在の `position` と `rotationMatrix` に基づいて更新します。
     * 通常モデルはブロック定義の `offset` も考慮します。
     */
    updateMeshMatrix() {
        // 通常（実サイズ）モデルの更新
        if (this.mesh && this.mesh.parent) { // メッシュが存在し、シーンに追加されている場合のみ
            const definition = getBlockDefinition(this.definitionId); // ★修正: インポートした関数を使用
            const offset = definition.offset || [0, 0, 0]; // オフセット取得 (なければ [0,0,0])

            // ワールド行列 = T(pos) * R(rot) * T(offset)
            const _translatePos = new THREE.Matrix4().makeTranslation(this.position.x, this.position.y, this.position.z);
            const _translateOffset = new THREE.Matrix4().makeTranslation(offset[0], offset[1], offset[2]);
            this.mesh.matrix.copy(_translatePos)
                 .multiply(this.rotationMatrix)
                 .multiply(_translateOffset);
            this.mesh.matrixWorldNeedsUpdate = true; // ワールド行列の更新フラグ
        }

        // XML編集モードの前景キューブの更新
        if (this.foregroundMesh && this.foregroundMesh.parent) { // メッシュが存在し、シーンに追加されている場合
            // ワールド行列 = T(pos) * R(rot) (オフセットなし)
            const _translatePos = new THREE.Matrix4().makeTranslation(this.position.x, this.position.y, this.position.z);
            this.foregroundMesh.matrix
                .copy(_translatePos)
                .multiply(this.rotationMatrix);
            this.foregroundMesh.matrixWorldNeedsUpdate = true;
        }
    }
}

// ★削除: 仮の getBlockDefinition 関数定義は不要になったため削除
// const getBlockDefinition = (id) => ({ offset: [0, 0, 0] }); // 仮