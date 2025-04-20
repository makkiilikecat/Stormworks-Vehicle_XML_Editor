import * as THREE from 'three';

/**
 * Three.jsのVector3座標をXMLのvp属性オブジェクトに変換します (Z反転、整数化)。
 * @param {THREE.Vector3} positionThreeJs - Three.js座標。
 * @returns {{x: number, y: number, z: number}} XML座標。
 */
export function positionToXml(positionThreeJs) {
    return {
        x: Math.round(positionThreeJs.x),
        y: Math.round(positionThreeJs.y),
        z: Math.round(-positionThreeJs.z) // Zを反転
    };
}

/**
 * XMLのvp属性オブジェクトをThree.jsのVector3座標に変換します (Z反転)。
 * @param {{x: string|number, y: string|number, z: string|number}} positionXml - XML座標。
 * @returns {THREE.Vector3} Three.js座標。
 */
export function positionFromXml(positionXml) {
    return new THREE.Vector3(
        parseInt(positionXml?.x || '0', 10),
        parseInt(positionXml?.y || '0', 10),
        -parseInt(positionXml?.z || '0', 10) // Zを反転
    );
}

/**
 * Three.jsのMatrix4をXMLのr属性要素配列に変換します (座標系変換、整数化)。
 * @param {THREE.Matrix4} matrixThreeJs - Three.jsのMatrix4。
 * @returns {number[]} 9つの整数要素の配列 [r11, r21, r31, r12, ...]。
 */
export function rotationMatrixToXmlElements(matrixThreeJs) {
    const me = matrixThreeJs.elements;
    const r11 = Math.round(me[0]); const r21 = Math.round(me[1]); const r31 = Math.round(-me[2]);
    const r12 = Math.round(me[4]); const r22 = Math.round(me[5]); const r32 = Math.round(-me[6]);
    const r13 = Math.round(-me[8]); const r23 = Math.round(-me[9]); const r33 = Math.round(me[10]);
    return [r11, r21, r31, r12, r22, r32, r13, r23, r33];
}

/**
 * XMLのr属性要素配列をThree.jsのMatrix4に変換します (座標系変換)。
 * @param {number[]} elementsXml - 9つの整数要素の配列 [r11, r21, r31, r12, ...]。
 * @returns {THREE.Matrix4} Three.jsのMatrix4。
 */
export function rotationMatrixFromXmlElements(elementsXml) {
    const matrix = new THREE.Matrix4();
    if (!Array.isArray(elementsXml) || elementsXml.length !== 9 || !elementsXml.every(Number.isInteger)) {
        console.warn("Invalid XML rotation matrix elements, returning identity.");
        return matrix.identity(); // Return identity if invalid
    }
    const [r11, r21, r31, r12, r22, r32, r13, r23, r33] = elementsXml;
    matrix.set(
         r11,  r12, -r13, 0,
         r21,  r22, -r23, 0,
        -r31, -r32,  r33, 0,
         0,    0,    0,   1
    );
    return matrix;
}

/**
 * XMLのr属性文字列をThree.jsのMatrix4に変換します。
 * @param {string} rString - "r11,r21,r31,..." 形式の文字列。
 * @returns {THREE.Matrix4} Three.jsのMatrix4。
 */
export function rotationMatrixFromXmlString(rString) {
    if (!rString) return new THREE.Matrix4().identity();
    const values = rString.split(',').map(Number);
     if (values.length === 9 && values.every(v => !isNaN(v))) {
         // 文字列はXML要素と同じ並びだと仮定
         return rotationMatrixFromXmlElements(values.map(Math.round)); // 念のため整数化
     }
     console.warn(`Invalid rotation matrix string: "${rString}". Returning identity.`);
     return new THREE.Matrix4().identity();
}