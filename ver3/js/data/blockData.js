/**
 * @fileoverview Stormworksビークル内の単一ブロック（コンポーネント）に関する
 * データ（ID, 定義, 位置, 回転, 色, その他のXML属性）を保持し、
 * 関連する操作（座標変換、メッシュ更新など）を提供するクラス。
 *
 * @version 4.4
 */

import * as THREE from 'three'; // Vector3, Matrix4 を使用

// --- 依存モジュール ---
// 座標系変換ユーティリティ (XML座標 <-> Three.js座標)
import {
    positionFromXml,
    rotationMatrixFromXmlString,
    positionToXml,
    rotationMatrixToXmlElements,
    rotationMatrixFromXmlElements
} from '../utils/coordinateConverter.js';
// ブロック定義情報を取得する関数
import { getBlockDefinition } from '../data/blockDefinitions.js';
// t属性 (0-7) に対応する変換行列を取得する関数
import { getTAttributeMatrix } from '../utils/mathUtils.js';

// --- モジュール内変数 ---

/**
 * 新しく生成される BlockData インスタンスに一意なIDを割り振るためのカウンター。
 * @type {number}
 */
let nextBlockId = 0;

/**
 * surfaceColors におけるデフォルトの色 (主に "x" の代替やフォールバックとして使用)。
 * @const {string}
 */
const DEFAULT_SURFACE_COLOR = "FFFFFF"; // 白

/**
 * sc属性が無効な場合や、デフォルト色配列を生成する際のデフォルトの面数。
 * @const {number}
 */
const DEFAULT_FACE_COUNT = 6;

/**
 * Stormworks の単一ブロックを表すクラス。
 * XMLからの読み込み、新規作成、アンドゥ/リドゥによる復元などに対応します。
 */
export class BlockData {
    /**
     * BlockData インスタンスを生成します。
     * XML読み込み時または新規ブロック作成時に呼び出されます。
     *
     * @param {string | null} definitionId - ブロック定義ID (XML <c> タグの 'd' 属性)。nullの場合は '01_block' にフォールバック。
     * @param {object | null} positionXml - XML座標系の位置 {x, y, z}。nullの場合は原点 {x:0, y:0, z:0}。
     * @param {string | null} rotationString - XML <o> タグの 'r' 属性文字列 (例: "1,0,0,...")。nullで initialMatrix が指定されていればそちらを優先。両方なければ単位行列。
     * @param {string | null} scString - XML <o> タグの 'sc' 属性文字列 (例: "6,FFFFFF,C2C3C7,x,...")。表面色情報。
     * @param {string | null} bcString - XML <o> タグの 'bc' 属性文字列 (例: "C2C3C7")。ベースカラー。
     * @param {string | null} acString - XML <o> タグの 'ac' 属性文字列 (例: "FF0000")。加算カラー。
     * @param {string | number | null} tAttributeValue - XML <c> タグの 't' 属性値 (0-7)。ブロックの向き/反転情報。nullや無効値の場合は0。
     * @param {Map<string, string>} [cAttributes=new Map()] - <c> 要素のその他の属性 ('d', 't' 以外) を格納する Map。
     * @param {Map<string, string>} [oAttributes=new Map()] - <o> 要素のその他の属性 ('r', 'sc', 'bc', 'ac' 以外) を格納する Map。
     * @param {Node[]} [oChildren=[]] - <o> 要素の子要素 ('vp' 以外) の Node オブジェクトの配列。クローンされたものが格納されます。
     * @param {THREE.Matrix4 | null} [initialMatrix=null] - (オプション) Three.js 座標系の初期向き行列。rotationString より優先。主に Undo/Redo での復元時に使用。
     * @param {number | null} [restoreId=null] - (オプション) Undo/Redo で復元する場合の元のブロック ID。指定された場合、その ID が使用され、自動採番は行われません。
     */
    constructor(
        definitionId, positionXml, rotationString,
        scString, bcString, acString,
        tAttributeValue,
        cAttributes = new Map(), oAttributes = new Map(), oChildren = [],
        initialMatrix = null,
        restoreId = null
    ) {
        // --- ID の設定 ---
        // restoreId が指定されていればそれを使用、なければ自動採番
        this.id = (restoreId !== null && restoreId !== undefined) ? restoreId : nextBlockId++;

        // --- 基本プロパティ ---
        /** @type {string} ブロック定義ID (例: '01_block', '02_wedge') */
        this.definitionId = definitionId || '01_block'; // 未指定時は基本ブロックに
        /** @type {number} t属性値 (0-7)。無効な値は0になる。 */
        const tValue = parseInt(tAttributeValue, 10);
        this.tAttribute = !isNaN(tValue) ? tValue : 0;
        /** @type {THREE.Vector3} Three.js ワールド座標系の位置 */
        this.position = positionFromXml(positionXml || {x:0, y:0, z:0}); // XML座標から変換
        /** @type {THREE.Matrix4} Three.js ワールド座標系の回転・スケール・せん断を表す行列 */
        this.rotationMatrix = initialMatrix instanceof THREE.Matrix4
                              ? initialMatrix.clone() // initialMatrix があれば優先して使用 (クローン)
                              : rotationMatrixFromXmlString(rotationString); //なければXML文字列から変換

        // --- 色関連プロパティ ---
        // 色文字列は正規化 (大文字, #なし) して保持。nullの場合もある。
        /** @type {string | null} ベースカラー ('bc' 属性) */
        this.baseColor = bcString ? bcString.toUpperCase().replace('#','') : null;
        /** @type {string | null} 加算カラー ('ac' 属性) */
        this.additiveColor = acString ? acString.toUpperCase().replace('#','') : null;
        /**
         * @type {string[]} 面ごとの表面色コード配列。parseSurfaceColors で生成。
         * sc属性が無効な場合や、sc="6"、"x" 指定時は baseColor などで補完される。
         */
        this.surfaceColors = this.parseSurfaceColors(scString, this.baseColor);

        // --- その他のXML属性と子要素 ---
        /** @type {Map<string, string>} <c> 要素の追加属性 (d, t 以外) */
        this.cAttributes = cAttributes instanceof Map ? cAttributes : new Map();
        /** @type {Map<string, string>} <o> 要素の追加属性 (r, sc, bc, ac 以外) */
        this.oAttributes = oAttributes instanceof Map ? oAttributes : new Map();
        /** @type {Node[]} <o> 要素の子要素 (vp 以外) のクローン配列 */
        this.oChildren = Array.isArray(oChildren) ? oChildren.map(node => node.cloneNode(true)) : []; // Deep clone? No, just node clone.

        // --- 関連する3Dメッシュへの参照 (初期値は null) ---
        /** @type {THREE.Mesh | null} 通常表示用メッシュ (blockRenderer で設定される) */
        this.mesh = null;
        /** @type {THREE.Mesh | null} XML編集モード用前景メッシュ (編集キューブ, blockRenderer で設定される) */
        this.foregroundMesh = null;
    }

    /**
     * XMLの `sc` 属性文字列を解析し、面ごとの色コード文字列の配列を生成します。
     *
     * 処理ルール:
     * - sc属性がない場合: デフォルト面数(6)、全てデフォルト色(白)の配列を返す。
     * - sc="面数" の形式の場合: 指定された面数分、`bcColor` (ベースカラー) またはデフォルト色(白)で埋めた配列を返す。
     * - sc="面数,色1,色2,..." の形式で、色の数が面数と一致する場合: 配列を生成。"x" は `bcColor` (または白) に置換。
     * - 上記以外 (面数が不正、色数が合わないなど): デフォルト面数(6)、全てデフォルト色(白)の配列を返す。
     *
     * @param {string | null} scString - 解析対象の `sc` 属性文字列。
     * @param {string | null} bcColor - このブロックのベースカラー (`this.baseColor`)。 "x" や数値のみの場合のフォールバックに使用。
     * @returns {string[]} 面ごとの色コード文字列 (6桁16進数、大文字) の配列。
     * @private
     */
    parseSurfaceColors(scString, bcColor) {
        // 1. sc属性が指定されていない場合
        if (!scString) {
            return Array(DEFAULT_FACE_COUNT).fill(DEFAULT_SURFACE_COLOR);
        }

        // 2. 文字列をカンマで分割し、最初の要素を面数として解析
        const parts = scString.split(',');
        const faceCountStr = parts.shift(); // 面数部分を取り出す
        const faceCount = parseInt(faceCountStr, 10);

        // 3. 面数が不正 (数値でない or 0以下) の場合
        if (isNaN(faceCount) || faceCount <= 0) {
            // console.warn(`[BlockData] 無効なsc属性の面数値 "${faceCountStr}"。デフォルト色を使用します。`);
            return Array(DEFAULT_FACE_COUNT).fill(DEFAULT_SURFACE_COLOR);
        }

        // 4. フォールバック時に使用する色を決定 (bc優先、なければ白)
        const fallbackColor = bcColor || DEFAULT_SURFACE_COLOR;

        // 5. sc属性が数値のみ (例: "6") の場合
        if (parts.length === 0) {
            console.log(`[BlockData] sc属性値 "${scString}" は数値のみ。${faceCount}個のフォールバック色 ("${fallbackColor}") を補完します。`);
            return Array(faceCount).fill(fallbackColor); // 指定面数分、フォールバック色で埋める
        }

        // 6. 色の指定数が面数と一致しない場合
        if (parts.length !== faceCount) {
            console.warn(`[BlockData] sc属性の色の数(${parts.length})が面数(${faceCount})と一致しません。属性値: "${scString}"。デフォルト色を使用します。`);
            return Array(DEFAULT_FACE_COUNT).fill(DEFAULT_SURFACE_COLOR);
        }

        // 7. 面数と色数が一致する場合 (正常ケース)
        return parts.map(color => {
            // "x" (小文字) ならフォールバック色を使用
            if (color.toLowerCase() === 'x') {
                return fallbackColor;
            } else {
                // 通常の色コードは検証し、大文字に正規化
                const upperColor = color.toUpperCase();
                // 6桁の16進数形式でなければフォールバック色を使用 (安全策)
                return /^[0-9A-F]{6}$/.test(upperColor) ? upperColor : fallbackColor;
            }
        });
    }

    // --- 色情報 操作メソッド ---

    /**
     * 指定されたインデックスの表面色を取得します。
     * @param {number} faceIndex - 面のインデックス (0から始まる)。
     * @returns {string | undefined} 色コード文字列 (大文字、6桁16進数)。インデックスが無効な場合は undefined。
     */
    getSurfaceColor(faceIndex) {
        return this.surfaceColors[faceIndex];
    }

    /**
     * 指定されたインデックスの表面色を設定します。
     * 色コードは検証され、大文字の6桁16進数で保存されます。
     * @param {number} faceIndex - 面のインデックス (0から始まる)。
     * @param {string} colorCode - 設定する色コード文字列 (例: "FF0000", "#ff0000")。
     */
    setSurfaceColor(faceIndex, colorCode) {
        // インデックスの範囲チェック
        if (faceIndex >= 0 && faceIndex < this.surfaceColors.length) {
            // 色コードの検証と正規化
            const normalizedColor = colorCode ? colorCode.toUpperCase().replace('#', '') : null;
            if (normalizedColor && /^[0-9A-F]{6}$/.test(normalizedColor)) {
                this.surfaceColors[faceIndex] = normalizedColor;
            } else {
                console.warn(`[BlockData ID: ${this.id}] 無効な色コード形式 (${colorCode}) が setSurfaceColor に指定されました。無視します。`);
            }
        } else {
            console.warn(`[BlockData ID: ${this.id}] 無効な faceIndex (${faceIndex}) が setSurfaceColor に指定されました。`);
        }
    }

    /**
     * ベースカラー ('bc' 属性) を取得します。
     * @returns {string | null} ベースカラーの色コード (大文字、6桁16進数)、設定されていなければ null。
     */
    getBaseColor() {
        return this.baseColor;
    }

    /**
     * ベースカラー ('bc' 属性) を設定します。
     * 色コードは検証され、大文字の6桁16進数で保存されます。null を設定するとクリアされます。
     * @param {string | null} colorCode - 設定する色コード文字列、または null。
     */
    setBaseColor(colorCode) {
        if (colorCode === null) {
            this.baseColor = null;
        } else {
            const normalizedColor = colorCode.toUpperCase().replace('#', '');
            if (/^[0-9A-F]{6}$/.test(normalizedColor)) {
                this.baseColor = normalizedColor;
            } else {
                 console.warn(`[BlockData ID: ${this.id}] 無効な色コード形式 (${colorCode}) が setBaseColor に指定されました。無視します。`);
            }
        }
    }

    /**
     * 加算カラー ('ac' 属性) を取得します。
     * @returns {string | null} 加算カラーの色コード (大文字、6桁16進数)、設定されていなければ null。
     */
    getAdditiveColor() {
        return this.additiveColor;
    }

    /**
     * 加算カラー ('ac' 属性) を設定します。
     * 色コードは検証され、大文字の6桁16進数で保存されます。null を設定するとクリアされます。
     * @param {string | null} colorCode - 設定する色コード文字列、または null。
     */
    setAdditiveColor(colorCode) {
         if (colorCode === null) {
             this.additiveColor = null;
         } else {
             const normalizedColor = colorCode.toUpperCase().replace('#', '');
             if (/^[0-9A-F]{6}$/.test(normalizedColor)) {
                this.additiveColor = normalizedColor;
             } else {
                  console.warn(`[BlockData ID: ${this.id}] 無効な色コード形式 (${colorCode}) が setAdditiveColor に指定されました。無視します。`);
             }
         }
    }

    /**
     * 現在の表面色配列 (`this.surfaceColors`) から、XMLの 'sc' 属性用の文字列を生成します。
     * 形式: "面数,色1,色2,..."
     * DEFAULT_SURFACE_COLOR ("FFFFFF") は "x" に省略されます。
     * @returns {string} sc属性用の文字列。surfaceColorsが空の場合は空文字列。
     */
    getSurfaceColorsString() {
        const faceCount = this.surfaceColors.length;
        if (faceCount === 0) return ""; // 色情報がない場合は空文字

        // "FFFFFF" を "x" に、それ以外はそのまま（既に大文字のはず）
        const colorParts = this.surfaceColors.map(color =>
            (color === DEFAULT_SURFACE_COLOR) ? 'x' : color
        );

        // 面数を先頭につけてカンマ区切りで結合
        return `${faceCount},${colorParts.join(',')}`;
    }

    // --- 位置・回転・t属性 操作メソッド ---

    /**
     * 現在の内部位置 (`this.position`, Three.js Vector3) を
     * XML座標系のオブジェクト {x, y, z} (整数値、Z反転済み) に変換して返します。
     * @returns {{x: number, y: number, z: number}} XML座標系の位置。
     */
    getPositionXml() {
        return positionToXml(this.position);
    }

    /**
     * 現在の内部回転行列 (`this.rotationMatrix`, Three.js Matrix4) を
     * XMLの 'r' 属性用の9つの整数配列 (列優先) に変換して返します。
     * 座標系の変換と整数への丸めが行われます。
     * @returns {number[]} XML 'r' 属性用の9要素配列 [r11, r21, r31, r12, ...]。
     */
    getRotationMatrixXmlElements() {
        return rotationMatrixToXmlElements(this.rotationMatrix);
    }

    /**
     * XML座標系の位置 {x, y, z} を指定して、内部の `position` (Vector3) を更新します。
     * 完了後、関連メッシュ (`mesh`, `foregroundMesh`) の行列を更新します。
     * @param {number} x - X座標 (XML座標系)。
     * @param {number} y - Y座標 (XML座標系)。
     * @param {number} z - Z座標 (XML座標系)。
     */
    setPositionFromXml(x, y, z) {
        // positionFromXml で Three.js 座標に変換
        this.position = positionFromXml({x, y, z});
        // メッシュの表示を更新
        this.updateMeshMatrix();
    }

    /**
     * XML 'r' 属性形式の9要素配列を指定して、内部の `rotationMatrix` (Matrix4) を更新します。
     * 完了後、関連メッシュ (`mesh`, `foregroundMesh`) の行列を更新します。
     * @param {number[]} elements - 9つの整数要素の配列 [r11, r21, r31, r12, ...]。
     */
    setRotationMatrixFromXmlElements(elements) {
        // rotationMatrixFromXmlElements で Matrix4 に変換
        this.rotationMatrix = rotationMatrixFromXmlElements(elements);
        // メッシュの表示を更新
        this.updateMeshMatrix();
    }

    /**
     * `t` 属性値 (ブロックの向き/反転) を設定します。
     * 値は 0 から 7 の整数である必要があります。範囲外や無効な値は無視されます。
     * 値が実際に変更された場合のみ、関連メッシュの行列を更新します。
     * @param {number | string | null} value - 設定する t 属性値。
     */
    setTAttribute(value) {
        // 文字列の場合も考慮して整数にパース
        const intValue = parseInt(value, 10);
        // 値が 0-7 の範囲内かチェック
        if (!isNaN(intValue) && intValue >= 0 && intValue <= 7) {
            // 現在の値と異なる場合のみ更新
            if (this.tAttribute !== intValue) {
                this.tAttribute = intValue;
                this.updateMeshMatrix(); // 変更があればメッシュ更新
            }
        } else if (value !== null && value !== undefined && value !== '') {
            // null, undefined, 空文字 以外で無効な値が指定された場合に警告
            console.warn(`[BlockData ID ${this.id}] 無効なt属性値 (${value}) は無視されました。`);
        }
        // null, undefined, 空文字の場合は現在の値を維持
    }

    // --- その他のXML属性 操作メソッド ---

    /**
     * <c> 要素の追加属性 (d, t 以外の属性) を設定または更新します。
     * @param {string} name - 属性名。
     * @param {string} value - 属性値。
     */
    setCAttribute(name, value) {
        // name と value が文字列であることを確認
        if (typeof name === 'string' && typeof value === 'string') {
            this.cAttributes.set(name, value);
        }
    }

    /**
     * <o> 要素の追加属性 (r, sc, bc, ac 以外の属性) を設定または更新します。
     * @param {string} name - 属性名。
     * @param {string} value - 属性値。
     */
    setOAttribute(name, value) {
        // name と value が文字列であることを確認
         if (typeof name === 'string' && typeof value === 'string') {
            // 'bc', 'ac' は専用プロパティ (this.baseColor, this.additiveColor) で
            // 管理するため、ここでは設定しない
            if (name !== 'bc' && name !== 'ac') {
                 this.oAttributes.set(name, value);
            }
        }
    }

    // --- 関連3Dメッシュの更新 ---

    /**
     * この BlockData インスタンスに関連付けられている3Dメッシュ
     * (`this.mesh` と `this.foregroundMesh`) のワールド行列を、
     * 現在の `position`, `rotationMatrix`, `tAttribute`、および
     * ブロック定義に基づく `offset` から計算し、適用します。
     * BlockData の状態が変更された後、表示に反映させるために呼び出されます。
     */
    updateMeshMatrix() {
        // 1. t属性に基づく変換行列を取得
        const tMatrix = getTAttributeMatrix(this.tAttribute);
        // 2. 位置に基づく平行移動行列を作成
        const translatePosMatrix = new THREE.Matrix4().makeTranslation(this.position.x, this.position.y, this.position.z);

        // --- 通常メッシュ (this.mesh) の行列更新 ---
        // メッシュが存在し、かつシーンに実際に追加されている (parentを持つ) 場合のみ
        if (this.mesh && this.mesh.parent) {
            // ブロック定義からオフセットを取得
            const definition = getBlockDefinition(this.definitionId);
            const offset = definition.offset || [0, 0, 0]; // offsetが未定義なら[0,0,0]
            // 3. オフセットに基づく平行移動行列を作成
            const translateOffsetMatrix = new THREE.Matrix4().makeTranslation(offset[0], offset[1], offset[2]);

            // 最終的なワールド行列を計算して設定
            // WorldMatrix = Translate(Position) * Rotation * T(tAttribute) * Translate(Offset)
            this.mesh.matrix.copy(translatePosMatrix)        // 位置
                 .multiply(this.rotationMatrix)             // 回転・スケール・せん断
                 .multiply(tMatrix)                         // t属性による変換
                 .multiply(translateOffsetMatrix);          // オフセット
            this.mesh.matrixAutoUpdate = false;             // three.jsによる自動更新は無効化
            this.mesh.matrixWorldNeedsUpdate = true;        // ワールド行列の更新が必要であることを通知
        }

        // --- 前景メッシュ (this.foregroundMesh - 編集キューブ) の行列更新 ---
        // 前景メッシュが存在する場合のみ
        if (this.foregroundMesh) {
            // 編集キューブはオフセットを考慮しない (常にブロックの中心に表示)
            // WorldMatrix = Translate(Position) * Rotation * T(tAttribute)
            const finalMatrix = new THREE.Matrix4(); // 計算用の一時行列
            finalMatrix.copy(translatePosMatrix)        // 位置
                 .multiply(this.rotationMatrix)         // 回転・スケール・せん断
                 .multiply(tMatrix);                     // t属性による変換

            // 計算した行列を前景メッシュに適用
            this.foregroundMesh.matrix.copy(finalMatrix);
            this.foregroundMesh.matrixAutoUpdate = false; // 自動更新は無効化
            this.foregroundMesh.matrixWorldNeedsUpdate = true; // 更新通知
        }
    }
} // End of BlockData class