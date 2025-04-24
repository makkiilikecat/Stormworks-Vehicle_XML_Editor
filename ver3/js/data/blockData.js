/**
 * @fileoverview Stormworks ビークル内の単一ブロックに関するデータと関連操作を定義するクラス。
 *
 * このクラスは、Stormworks の XML ファイルから読み込んだブロック情報を保持・管理します。
 * 内部では Three.js の座標系やデータ構造 (Vector3, Matrix4) を使用しつつ、
 * XML との相互変換や、ブロック固有の属性、3D メッシュとの関連付けなどを扱います。
 * Undo/Redo 機能のために、元の ID を維持してインスタンスを復元する機能も持ちます。
 */

import * as THREE from 'three';
// --- 依存モジュール ---
// 座標系変換ユーティリティ (XML <-> Three.js)
import {
    positionFromXml,          // XML {x,y,z} -> Three.js Vector3
    rotationMatrixFromXmlString, // XML 'r' 文字列 -> Three.js Matrix4
    positionToXml,            // Three.js Vector3 -> XML {x,y,z} (整数丸め, Z反転)
    rotationMatrixToXmlElements, // Three.js Matrix4 -> XML 'r' 配列 (整数丸め, 座標系変換)
    rotationMatrixFromXmlElements // XML 'r' 配列 -> Three.js Matrix4 (座標系変換)
} from '../utils/coordinateConverter.js';
// ブロック定義情報取得関数
import { getBlockDefinition } from '../data/blockDefinitions.js';
// t属性に基づく変換行列取得関数 (Stage 3 で追加)
import { getTAttributeMatrix } from '../utils/mathUtils.js';

// --- モジュール内変数 ---
/**
 * 新規ブロックに割り当てる一意なIDを生成するためのカウンター。
 * @type {number}
 */
let nextBlockId = 0;

/**
 * Stormworks の単一ブロックを表すクラス。
 */
export class BlockData {
    /**
     * BlockData インスタンスを生成します。
     * XML からの読み込み時、または新規ブロック作成時に使用されます。
     * Undo/Redo での復元のために、元の ID を指定することも可能です。
     *
     * @param {string | null} definitionId - ブロック定義ID (XML の 'd' 属性)。指定がない場合は '01_block' が使用されます。
     * @param {object | null} positionXml - XML 座標系の位置 {x, y, z}。指定がない場合は原点 {x:0, y:0, z:0} が使用されます。
     * @param {string | null} rotationString - XML の 'r' 属性文字列。指定がない場合、または initialMatrix が優先される場合は null。単位行列として扱われます。
     * @param {string | null} colorString - XML の 'sc' 属性文字列 (カンマ区切りの色インデックス)。指定がない場合は "0"。
     * @param {number | string | null} tAttributeValue - XML の 't' 属性値。数値に変換され、無効な場合は 0 になります。
     * @param {Map<string, string>} [cAttributes=new Map()] - <c> 要素のその他の属性 ('d', 't' 以外) を格納する Map。
     * @param {Map<string, string>} [oAttributes=new Map()] - <o> 要素のその他の属性 ('r', 'sc' 以外) を格納する Map。
     * @param {Node[]} [oChildren=[]] - <o> 要素の子要素 ('vp' 以外) の Node オブジェクトの配列。クローンされたものが格納されます。
     * @param {THREE.Matrix4 | null} [initialMatrix=null] - (オプション) Three.js 座標系の初期向き行列。rotationString より優先されます。主に Undo/Redo での復元時に使用されます。
     * @param {number | null} [restoreId=null] - (オプション) 復元する場合の元のブロック ID。指定された場合、その ID が使用され、自動採番は行われません。
     */
    constructor(
        definitionId, positionXml, rotationString, colorString, tAttributeValue,
        cAttributes = new Map(), oAttributes = new Map(), oChildren = [],
        initialMatrix = null,
        restoreId = null // Undo/Redo 用に追加
    ) {
        // --- ID の設定 ---
        // restoreId が指定されていればそれを使用、なければ自動採番
        this.id = (restoreId !== null && restoreId !== undefined) ? restoreId : nextBlockId++;
        // 注意: restoreId 使用時は nextBlockId を進めない（ID重複の可能性は残る）

        // --- 基本プロパティ ---
        /** @type {string} ブロック定義ID (例: '01_block', '02_wedge') */
        this.definitionId = definitionId || '01_block';
        /** @type {number} t属性値 (0-7) */
        const tValue = parseInt(tAttributeValue, 10);
        this.tAttribute = !isNaN(tValue) ? tValue : 0;
        /** @type {THREE.Vector3} Three.js 座標系の位置 */
        this.position = positionFromXml(positionXml || {x:0, y:0, z:0});
        /** @type {THREE.Matrix4} Three.js 座標系の回転・スケール・せん断を表す行列 */
        this.rotationMatrix = initialMatrix instanceof THREE.Matrix4 ? initialMatrix.clone() : rotationMatrixFromXmlString(rotationString);
        /** @type {number[]} パースされたカラーインデックスの配列 */
        this.colorIndices = this.parseColorIndices(colorString || "0");

        // --- 追加属性と子要素 (Stage 2 で追加) ---
        /** @type {Map<string, string>} <c> 要素の追加属性 (d, t 以外) */
        this.cAttributes = cAttributes instanceof Map ? cAttributes : new Map();
        /** @type {Map<string, string>} <o> 要素の追加属性 (r, sc 以外) */
        this.oAttributes = oAttributes instanceof Map ? oAttributes : new Map();
        /** @type {Node[]} <o> 要素の子要素 (vp 以外) のクローン配列 */
        this.oChildren = Array.isArray(oChildren) ? [...oChildren] : []; // シャローコピー

        // --- 関連する3Dメッシュへの参照 ---
        /** @type {THREE.Mesh | null} 通常表示用メッシュ (実サイズモデル) */
        this.mesh = null;
        /** @type {THREE.Mesh | null} XML編集モード用メッシュ (編集キューブ: 1x1x1) */
        this.foregroundMesh = null;

        // console.log(`[BlockData] Block ID ${this.id} 作成完了 (Def: ${this.definitionId}, t: ${this.tAttribute})`);
    }

    /**
     * カラーインデックス文字列 ('sc'属性) を数値配列にパースします。
     * カンマ区切りで、数値でない要素は無視されます。
     * 結果が空の場合は [0] を返します。
     * @param {string} scString - 'sc'属性の文字列。
     * @returns {number[]} パースされた数値の配列 (最低1要素を保証)。
     * @private
     */
    parseColorIndices(scString) {
        const indices = scString.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
        return indices.length > 0 ? indices : [0];
    }

    // --- XML座標系での値取得メソッド ---

    /**
     * 現在の内部位置 (Three.js Vector3) をXML座標系のオブジェクト {x, y, z} に変換して返します。
     * Z軸の反転と整数への丸めが行われます。
     * @returns {{x: number, y: number, z: number}} XML座標系の位置。
     */
    getPositionXml() {
        return positionToXml(this.position);
    }

    /**
     * 現在の内部回転行列 (Three.js Matrix4) をXMLの 'r' 属性用の9つの整数配列 (列優先) に変換して返します。
     * 座標系の変換と整数への丸めが行われます。
     * @returns {number[]} XML 'r' 属性用の9要素配列 [r11, r21, r31, r12, ...]。
     */
    getRotationMatrixXmlElements() {
        return rotationMatrixToXmlElements(this.rotationMatrix);
    }

    // --- 内部状態設定メソッド (主にUIやUndo/Redoから呼び出される) ---

    /**
     * XML座標系の位置 {x, y, z} を指定して、内部の `position` (Vector3) を更新します。
     * 完了後、関連メッシュの行列を更新します。
     * @param {number} x - X座標 (XML座標系)。
     * @param {number} y - Y座標 (XML座標系)。
     * @param {number} z - Z座標 (XML座標系)。
     */
    setPositionFromXml(x, y, z) {
        this.position = positionFromXml({x, y, z}); // 変換して格納
        this.updateMeshMatrix();                    // メッシュ更新
    }

    /**
     * XML 'r' 属性形式の9要素配列を指定して、内部の `rotationMatrix` (Matrix4) を更新します。
     * 完了後、関連メッシュの行列を更新します。
     * @param {number[]} elements - 9つの整数要素の配列 [r11, r21, r31, r12, ...]。
     */
    setRotationMatrixFromXmlElements(elements) {
        this.rotationMatrix = rotationMatrixFromXmlElements(elements); // 変換して格納
        this.updateMeshMatrix();                                     // メッシュ更新
    }

    /**
     * `t` 属性値を設定します。値が 0-7 の範囲外の場合は無視されます。
     * 値が変更された場合のみ、関連メッシュの行列を更新します。
     * @param {number} value - 設定する t 属性値 (0-7)。
     */
    setTAttribute(value) {
        const intValue = parseInt(value, 10);
        if (!isNaN(intValue) && intValue >= 0 && intValue <= 7) { // 値検証
            if (this.tAttribute !== intValue) { // 変更があった場合のみ
                // console.log(`[BlockData ID ${this.id}] t属性を ${this.tAttribute} -> ${intValue} に変更`);
                this.tAttribute = intValue;
                this.updateMeshMatrix(); // メッシュ更新
            }
        } else {
            console.warn(`[BlockData ID ${this.id}] 無効なt属性値 (${value}) は無視されました。`);
        }
    }

    /**
     * <c> 要素の追加属性 (d, t 以外) を設定または更新します。
     * このメソッドは BlockData の内部状態のみを変更し、直接的な視覚的更新は行いません。
     * (XML保存時に使用されます)
     * @param {string} name - 属性名。
     * @param {string} value - 属性値。
     */
    setCAttribute(name, value) {
        if (typeof name === 'string' && typeof value === 'string') {
            this.cAttributes.set(name, value);
            // console.log(`[BlockData ID ${this.id}] <c>属性 '${name}' = '${value}' を設定`);
        }
    }

    /**
     * <o> 要素の追加属性 (r, sc 以外) を設定または更新します。
     * このメソッドは BlockData の内部状態のみを変更し、直接的な視覚的更新は行いません。
     * (XML保存時に使用されます)
     * @param {string} name - 属性名。
     * @param {string} value - 属性値。
     */
    setOAttribute(name, value) {
         if (typeof name === 'string' && typeof value === 'string') {
            this.oAttributes.set(name, value);
            // console.log(`[BlockData ID ${this.id}] <o>属性 '${name}' = '${value}' を設定`);
        }
    }

    // --- 関連3Dメッシュの更新 ---

    /**
     * この BlockData インスタンスに関連付けられている3Dメッシュ
     * (`this.mesh` と `this.foregroundMesh`) のワールド行列を、
     * 現在の `position`, `rotationMatrix`, `tAttribute`, および
     * ブロック定義の `offset` に基づいて計算し、適用します。
     * このメソッドは、位置、回転、t属性などが変更された際に呼び出される必要があります。
     */
    updateMeshMatrix() {
        // --- 共通の変換行列を準備 ---
        // 1. t属性に基づく変換行列 (反転)
        const tMatrix = getTAttributeMatrix(this.tAttribute);
        // 2. 位置に基づく平行移動行列
        const translatePosMatrix = new THREE.Matrix4().makeTranslation(this.position.x, this.position.y, this.position.z);

        // --- 通常メッシュ (背景ゴースト) の更新 ---
        // mesh が存在し、かつシーンに追加されている (parent がある) 場合のみ更新
        if (this.mesh && this.mesh.parent) {
            const definition = getBlockDefinition(this.definitionId); // 定義取得
            const offset = definition.offset || [0, 0, 0];           // オフセット取得
            // 3. オフセットに基づく平行移動行列
            const translateOffsetMatrix = new THREE.Matrix4().makeTranslation(offset[0], offset[1], offset[2]);

            // ワールド行列 = T(位置) * R(回転/スケール/せん断) * T(t属性) * T(オフセット)
            this.mesh.matrix.copy(translatePosMatrix)
                 .multiply(this.rotationMatrix)
                 .multiply(tMatrix)
                 .multiply(translateOffsetMatrix);
            this.mesh.matrixAutoUpdate = false; // 手動更新を明示
            this.mesh.matrixWorldNeedsUpdate = true; // three.js にワールド行列の再計算を指示
        }

        // --- 前景メッシュ (編集キューブ) の更新 ---
        // foregroundMesh が存在する場合のみ更新 (parent チェックは不要 ※Bug Fix)
        if (this.foregroundMesh) {
            // ワールド行列 = T(位置) * R(回転/スケール/せん断) * T(t属性)
            // オフセットは適用しない (1x1x1 キューブ基準のため)
            const finalMatrix = new THREE.Matrix4(); // 計算結果用
            finalMatrix.copy(translatePosMatrix)
                 .multiply(this.rotationMatrix)
                 .multiply(tMatrix);

            // 計算結果をメッシュの行列にコピー
            this.foregroundMesh.matrix.copy(finalMatrix);
            this.foregroundMesh.matrixAutoUpdate = false; // 手動更新を明示
            this.foregroundMesh.matrixWorldNeedsUpdate = true; // 再計算を指示
        }
    }
} // End of BlockData class