/**
 * @fileoverview Stormworksのビークル内の単一ブロックのデータを表現するクラス。
 * XMLの属性や子要素を含めて、元の情報を可能な限り保持するように拡張。
 * 【主な変更点】
 * - `cAttributes`, `oAttributes`, `oChildren` プロパティを追加。
 * - コンストラクタでこれらの追加情報を受け付けるように修正。
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
import { getBlockDefinition } from '../data/blockDefinitions.js'; // ★修正: ブロック定義情報取得関数

// --- モジュール内変数 ---
let nextBlockId = 0;

/**
 * Stormworksのビークル内の単一ブロックのデータを表現するクラス。
 * 位置と回転は内部的にThree.js座標系で保持しつつ、
 * XMLの他の属性や要素も保持します。
 */
export class BlockData {
    /**
     * BlockDataインスタンスを作成します。
     * @param {string | null} definitionId - ブロック定義ID ('d'属性)。nullの場合は'01_block'。
     * @param {object | null} positionXml - XML座標系の位置 {x, y, z}。nullの場合は原点。
     * @param {string | null} rotationString - XML回転行列文字列 ('r'属性)。nullの場合は単位行列。
     * @param {string | null} colorString - XML色インデックス文字列 ('sc'属性)。nullの場合は"0"。
     * @param {number | string | null} tAttributeValue - XMLの 't' 属性値 (数値)。nullまたは未指定の場合は0。
     * @param {Map<string, string>} [cAttributes] - <c>要素の他の属性 (d, t以外)。
     * @param {Map<string, string>} [oAttributes] - <o>要素の他の属性 (r, sc以外)。
     * @param {Node[]} [oChildren] - <o>要素の子要素 (vp以外) のNode配列。
     * @param {THREE.Matrix4} [initialMatrix] - (オプション) Three.js座標系の初期向き行列。rotationStringより優先される。
     */
    constructor(
        definitionId, positionXml, rotationString, colorString, tAttributeValue,
        cAttributes = new Map(), oAttributes = new Map(), oChildren = [],
        initialMatrix = null
    ) {
        this.id = nextBlockId++;
        this.definitionId = definitionId || '01_block';

        // --- 基本属性の処理 (Stage 1 と同様) ---
        const tValue = parseInt(tAttributeValue, 10);
        this.tAttribute = !isNaN(tValue) ? tValue : 0;
        this.position = positionFromXml(positionXml || {x:0, y:0, z:0});
        this.rotationMatrix = initialMatrix instanceof THREE.Matrix4
                              ? initialMatrix.clone()
                              : rotationMatrixFromXmlString(rotationString);
        this.colorIndices = this.parseColorIndices(colorString || "0");

        // --- ★追加: その他のXML情報の保持 ---
        this.cAttributes = cAttributes instanceof Map ? cAttributes : new Map();
        this.oAttributes = oAttributes instanceof Map ? oAttributes : new Map();
        // oChildren は Node の配列として受け取る想定 (XML生成時にシリアライズ)
        // ここではシャローコピーを行う (Node自体はクローンされたものが渡される前提)
        this.oChildren = Array.isArray(oChildren) ? [...oChildren] : [];
        // 【デバッグログ】追加情報の保持
        // console.log(`[BlockData ID:${this.id}] 追加情報: cAttrs=${this.cAttributes.size}, oAttrs=${this.oAttributes.size}, oChildren=${this.oChildren.length}`);


        // 関連する3Dメッシュへの参照 (初期値はnull)
        this.mesh = null;
        this.foregroundMesh = null;
    }

    /**
     * カラーインデックスの文字列 ('sc'属性) を数値配列にパースします。
     * @param {string} scString - 'sc'属性の文字列。
     * @returns {number[]} パースされた数値の配列。最低1要素 (0) を保証。
     * @private
     */
    parseColorIndices(scString) {
        const indices = scString.split(',')
                               .map(s => parseInt(s, 10))
                               .filter(n => !isNaN(n));
        return indices.length > 0 ? indices : [0];
    }

    // --- XML座標系アクセス用メソッド ---
    // (変更なし)
    getPositionXml() { return positionToXml(this.position); }
    getRotationMatrixXmlElements() { return rotationMatrixToXmlElements(this.rotationMatrix); }

    // --- 内部状態設定メソッド ---
    // (変更なし)
    setPositionFromXml(x, y, z) {
        this.position = positionFromXml({x, y, z});
        this.updateMeshMatrix();
    }
    setRotationMatrixFromXmlElements(elements) {
        this.rotationMatrix = rotationMatrixFromXmlElements(elements);
        this.updateMeshMatrix();
    }
    setTAttribute(value) {
        const intValue = parseInt(value, 10);
        if (!isNaN(intValue) && intValue >= 0 && intValue <= 7) {
            if (this.tAttribute !== intValue) {
                console.log(`[BlockData ID ${this.id}] t属性を ${this.tAttribute} から ${intValue} に変更`);
                this.tAttribute = intValue;
                // Step 3 で t 属性が視覚表現に影響するようになったらメッシュ更新が必要
            }
        } else { /* Warn */ }
    }

    /**
     * ★追加: その他の <c> 要素の属性を設定します。
     * @param {string} name - 属性名。
     * @param {string} value - 属性値。
     */
    setCAttribute(name, value) {
        if (typeof name === 'string' && typeof value === 'string') {
            this.cAttributes.set(name, value);
            console.log(`[BlockData ID ${this.id}] <c>属性 '${name}' を '${value}' に設定`);
        }
    }

    /**
     * ★追加: その他の <o> 要素の属性を設定します。
     * @param {string} name - 属性名。
     * @param {string} value - 属性値。
     */
    setOAttribute(name, value) {
         if (typeof name === 'string' && typeof value === 'string') {
            this.oAttributes.set(name, value);
            console.log(`[BlockData ID ${this.id}] <o>属性 '${name}' を '${value}' に設定`);
        }
    }

    // --- メッシュ更新 ---
    // (Stage 3 で tAttribute を考慮する必要があるため、TODOコメントを追加)
    updateMeshMatrix() {
        // TODO: Step 3 で t 属性による変換行列を追加する
        const tMatrix = new THREE.Matrix4(); // 現状は単位行列

        // 通常モデル
        if (this.mesh && this.mesh.parent) {
            const definition = getBlockDefinition(this.definitionId);
            const offset = definition.offset || [0, 0, 0];
            const _translatePos = new THREE.Matrix4().makeTranslation(this.position.x, this.position.y, this.position.z);
            const _translateOffset = new THREE.Matrix4().makeTranslation(offset[0], offset[1], offset[2]);
            this.mesh.matrix.copy(_translatePos)
                 .multiply(this.rotationMatrix)
                 .multiply(tMatrix) // t属性変換を適用 (Stage 3)
                 .multiply(_translateOffset);
            this.mesh.matrixWorldNeedsUpdate = true;
        }

        // 前景キューブ
        if (this.foregroundMesh && this.foregroundMesh.parent) {
            const _translatePos = new THREE.Matrix4().makeTranslation(this.position.x, this.position.y, this.position.z);
            this.foregroundMesh.matrix
                .copy(_translatePos)
                .multiply(this.rotationMatrix)
                .multiply(tMatrix); // t属性変換を適用 (Stage 3)
            this.foregroundMesh.matrixWorldNeedsUpdate = true;
        }
    }
}