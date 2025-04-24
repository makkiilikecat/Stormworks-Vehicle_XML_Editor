/**
 * @fileoverview Stormworks ビークル内の単一ブロックに関するデータと関連操作を定義するクラス。
 *
 * 【主な変更点 v4 (ペイントモード対応 Stage 1.1)】
 * - ペイント機能のために、色情報をより詳細に保持するように変更。
 * - `colorIndices` を `surfaceColors` (文字列配列) に変更し、面ごとの色コード ("FFFFFF", "C2C3C7", "x" など) を保持。
 * - `baseColor` (`bc`属性) と `additiveColor` (`ac`属性) プロパティを追加。
 * - コンストラクタで `scString`, `bcString`, `acString` を受け取り、新しいプロパティにパース・格納するように修正。
 * - 色情報を操作するための getter/setter メソッドを追加。
 * - XML生成用に `sc` 属性文字列を生成するメソッドを追加。
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
// t属性に基づく変換行列取得関数
import { getTAttributeMatrix } from '../utils/mathUtils.js';

// --- モジュール内変数 ---
/**
 * 新規ブロックに割り当てる一意なIDを生成するためのカウンター。
 * @type {number}
 */
let nextBlockId = 0;
/** デフォルトの表面色 (白) */
const DEFAULT_SURFACE_COLOR = "FFFFFF";
/** デフォルトの面数 */
const DEFAULT_FACE_COUNT = 6;

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
     * @param {string | null} scString - XML の 'sc' 属性文字列 (例: "6,FFFFFF,C2C3C7,x,...")。
     * @param {string | null} bcString - XML の 'bc' 属性文字列 (色コード)。
     * @param {string | null} acString - XML の 'ac' 属性文字列 (色コード)。
     * @param {string | number | null} tAttributeValue - XML の 't' 属性値。数値に変換され、無効な場合は 0 になります。
     * @param {Map<string, string>} [cAttributes=new Map()] - <c> 要素のその他の属性 ('d', 't' 以外) を格納する Map。
     * @param {Map<string, string>} [oAttributes=new Map()] - <o> 要素のその他の属性 ('r', 'sc', 'bc', 'ac' 以外) を格納する Map。
     * @param {Node[]} [oChildren=[]] - <o> 要素の子要素 ('vp' 以外) の Node オブジェクトの配列。クローンされたものが格納されます。
     * @param {THREE.Matrix4 | null} [initialMatrix=null] - (オプション) Three.js 座標系の初期向き行列。rotationString より優先されます。主に Undo/Redo での復元時に使用されます。
     * @param {number | null} [restoreId=null] - (オプション) 復元する場合の元のブロック ID。指定された場合、その ID が使用され、自動採番は行われません。
     */
    constructor(
        definitionId, positionXml, rotationString,
        scString, bcString, acString, // 色属性を追加
        tAttributeValue,
        cAttributes = new Map(), oAttributes = new Map(), oChildren = [],
        initialMatrix = null,
        restoreId = null
    ) {
        // --- ID の設定 ---
        this.id = (restoreId !== null && restoreId !== undefined) ? restoreId : nextBlockId++;

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

        // --- 色関連プロパティ (新規/変更) ---
        /** @type {string[]} 面ごとの色コード ("FFFFFF", "C2C3C7", "x" など) を保持する配列 */
        this.surfaceColors = this.parseSurfaceColors(scString);
        /** @type {string | null} ベースカラー ('bc' 属性) */
        this.baseColor = bcString || null;
        /** @type {string | null} 加算カラー ('ac' 属性) */
        this.additiveColor = acString || null;

        // --- 追加属性と子要素 ---
        /** @type {Map<string, string>} <c> 要素の追加属性 (d, t 以外) */
        this.cAttributes = cAttributes instanceof Map ? cAttributes : new Map();
        /** @type {Map<string, string>} <o> 要素の追加属性 (r, sc, bc, ac 以外) */
        this.oAttributes = oAttributes instanceof Map ? oAttributes : new Map();
        /** @type {Node[]} <o> 要素の子要素 (vp 以外) のクローン配列 */
        this.oChildren = Array.isArray(oChildren) ? [...oChildren] : [];

        // --- 関連する3Dメッシュへの参照 ---
        /** @type {THREE.Mesh | null} 通常表示用メッシュ (実サイズモデル) */
        this.mesh = null;
        /** @type {THREE.Mesh | null} XML編集モード用メッシュ (編集キューブ: 1x1x1) */
        this.foregroundMesh = null;
    }

    /**
     * sc属性文字列 (例: "6,FFFFFF,C2C3C7,x,...") を解析し、
     * 面ごとの色コード配列 ("x" は "FFFFFF" に置換) を生成します。
     * 文字列が無効または指定がない場合は、デフォルト (6面すべて "FFFFFF") を返します。
     * @param {string | null} scString - sc属性文字列。
     * @returns {string[]} 面ごとの色コード配列。
     * @private
     */
    parseSurfaceColors(scString) {
        if (!scString) {
            // sc属性がない場合はデフォルトを生成
            return Array(DEFAULT_FACE_COUNT).fill(DEFAULT_SURFACE_COLOR);
        }

        const parts = scString.split(',');
        const faceCountStr = parts.shift(); // 最初の要素 (面数) を取り出す
        const faceCount = parseInt(faceCountStr, 10);

        // 面数が無効、または色指定の数が面数と合わない場合はデフォルトを返す
        if (isNaN(faceCount) || faceCount <= 0 || parts.length !== faceCount) {
            console.warn(`[BlockData] 無効なsc属性値 "${scString}"。デフォルト色を使用します。`);
            return Array(DEFAULT_FACE_COUNT).fill(DEFAULT_SURFACE_COLOR);
        }

        // 各色コードを処理 ("x" は "FFFFFF" に置換)
        return parts.map(color => (color.toLowerCase() === 'x' ? DEFAULT_SURFACE_COLOR : color));
    }

    // --- 色情報 操作メソッド (新規) ---

    /**
     * 指定された面の表面色を取得します。
     * @param {number} faceIndex - 面のインデックス (0から始まる)。
     * @returns {string | undefined} 色コード文字列、インデックスが無効な場合は undefined。
     */
    getSurfaceColor(faceIndex) {
        return this.surfaceColors[faceIndex];
    }

    /**
     * 指定された面の表面色を設定します。
     * @param {number} faceIndex - 面のインデックス (0から始まる)。
     * @param {string} colorCode - 設定する色コード文字列 (例: "FF0000")。
     */
    setSurfaceColor(faceIndex, colorCode) {
        if (faceIndex >= 0 && faceIndex < this.surfaceColors.length) {
            // TODO: colorCode のバリデーションを追加する？ (例: 6桁の16進数か)
            this.surfaceColors[faceIndex] = colorCode;
        } else {
            console.warn(`[BlockData] 無効な faceIndex (${faceIndex}) が指定されました。`);
        }
    }

    /**
     * ベースカラー ('bc' 属性) を取得します。
     * @returns {string | null} ベースカラーの色コード、設定されていなければ null。
     */
    getBaseColor() {
        return this.baseColor;
    }

    /**
     * ベースカラー ('bc' 属性) を設定します。
     * @param {string | null} colorCode - 設定する色コード文字列、または null。
     */
    setBaseColor(colorCode) {
        this.baseColor = colorCode;
    }

    /**
     * 加算カラー ('ac' 属性) を取得します。
     * @returns {string | null} 加算カラーの色コード、設定されていなければ null。
     */
    getAdditiveColor() {
        return this.additiveColor;
    }

    /**
     * 加算カラー ('ac' 属性) を設定します。
     * @param {string | null} colorCode - 設定する色コード文字列、または null。
     */
    setAdditiveColor(colorCode) {
        this.additiveColor = colorCode;
    }

    /**
     * 現在の表面色配列から、XMLの 'sc' 属性用の文字列を生成します。
     * 面数と、"FFFFFF" を "x" に省略した形式で返します。
     * @returns {string} sc属性用の文字列 (例: "6,x,C2C3C7,x,x,FF0000")。
     */
    getSurfaceColorsString() {
        const faceCount = this.surfaceColors.length;
        if (faceCount === 0) return ""; // 色情報がない場合

        // "FFFFFF" を "x" に置換
        const colorParts = this.surfaceColors.map(color =>
            (color && color.toUpperCase() === DEFAULT_SURFACE_COLOR) ? 'x' : color
        );

        return `${faceCount},${colorParts.join(',')}`;
    }

    // --- 既存メソッド (位置・回転・t属性など) ---

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

    /**
     * XML座標系の位置 {x, y, z} を指定して、内部の `position` (Vector3) を更新します。
     * 完了後、関連メッシュの行列を更新します。
     * @param {number} x - X座標 (XML座標系)。
     * @param {number} y - Y座標 (XML座標系)。
     * @param {number} z - Z座標 (XML座標系)。
     */
    setPositionFromXml(x, y, z) {
        this.position = positionFromXml({x, y, z});
        this.updateMeshMatrix();
    }

    /**
     * XML 'r' 属性形式の9要素配列を指定して、内部の `rotationMatrix` (Matrix4) を更新します。
     * 完了後、関連メッシュの行列を更新します。
     * @param {number[]} elements - 9つの整数要素の配列 [r11, r21, r31, r12, ...]。
     */
    setRotationMatrixFromXmlElements(elements) {
        this.rotationMatrix = rotationMatrixFromXmlElements(elements);
        this.updateMeshMatrix();
    }

    /**
     * `t` 属性値を設定します。値が 0-7 の範囲外の場合は無視されます。
     * 値が変更された場合のみ、関連メッシュの行列を更新します。
     * @param {number} value - 設定する t 属性値 (0-7)。
     */
    setTAttribute(value) {
        const intValue = parseInt(value, 10);
        if (!isNaN(intValue) && intValue >= 0 && intValue <= 7) {
            if (this.tAttribute !== intValue) {
                this.tAttribute = intValue;
                this.updateMeshMatrix();
            }
        } else {
            console.warn(`[BlockData ID ${this.id}] 無効なt属性値 (${value}) は無視されました。`);
        }
    }

    /**
     * <c> 要素の追加属性 (d, t 以外) を設定または更新します。
     * @param {string} name - 属性名。
     * @param {string} value - 属性値。
     */
    setCAttribute(name, value) {
        if (typeof name === 'string' && typeof value === 'string') {
            this.cAttributes.set(name, value);
        }
    }

    /**
     * <o> 要素の追加属性 (r, sc, bc, ac 以外) を設定または更新します。
     * @param {string} name - 属性名。
     * @param {string} value - 属性値。
     */
    setOAttribute(name, value) {
         if (typeof name === 'string' && typeof value === 'string') {
            // bc, ac は専用プロパティで管理するため、ここでは設定しない
            if (name !== 'bc' && name !== 'ac') {
                 this.oAttributes.set(name, value);
            }
        }
    }

    // --- 関連3Dメッシュの更新 ---

    /**
     * この BlockData インスタンスに関連付けられている3Dメッシュ
     * (`this.mesh` と `this.foregroundMesh`) のワールド行列を、
     * 現在の `position`, `rotationMatrix`, `tAttribute`, および
     * ブロック定義の `offset` に基づいて計算し、適用します。
     */
    updateMeshMatrix() {
        // 1. t属性に基づく変換行列
        const tMatrix = getTAttributeMatrix(this.tAttribute);
        // 2. 位置に基づく平行移動行列
        const translatePosMatrix = new THREE.Matrix4().makeTranslation(this.position.x, this.position.y, this.position.z);

        // --- 通常メッシュ (背景ゴースト) の更新 ---
        if (this.mesh && this.mesh.parent) {
            const definition = getBlockDefinition(this.definitionId);
            const offset = definition.offset || [0, 0, 0];
            // 3. オフセットに基づく平行移動行列
            const translateOffsetMatrix = new THREE.Matrix4().makeTranslation(offset[0], offset[1], offset[2]);

            // ワールド行列 = T(位置) * R(回転) * T(t属性) * T(オフセット)
            this.mesh.matrix.copy(translatePosMatrix)
                 .multiply(this.rotationMatrix)
                 .multiply(tMatrix)
                 .multiply(translateOffsetMatrix);
            this.mesh.matrixAutoUpdate = false;
            this.mesh.matrixWorldNeedsUpdate = true;
        }

        // --- 前景メッシュ (編集キューブ) の更新 ---
        if (this.foregroundMesh) {
            // ワールド行列 = T(位置) * R(回転) * T(t属性)
            const finalMatrix = new THREE.Matrix4();
            finalMatrix.copy(translatePosMatrix)
                 .multiply(this.rotationMatrix)
                 .multiply(tMatrix);

            this.foregroundMesh.matrix.copy(finalMatrix);
            this.foregroundMesh.matrixAutoUpdate = false;
            this.foregroundMesh.matrixWorldNeedsUpdate = true;
        }
    }
} // End of BlockData class