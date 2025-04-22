/**
 * @fileoverview ブロック選択時のハイライト表示・非表示を管理するヘルパーモジュール。
 * マテリアルの emissive プロパティを変更することでハイライトを実現します。
 * XML編集モードと通常モードでハイライト対象のメッシュが異なることを考慮します。
 */

import * as THREE from 'three';
import { EditMode } from '../state/editMode.js'; // EditMode をインポートしてモードを判定

// --- 状態変数 ---
// 元のマテリアル情報を保持するMap
// キー: ハイライト対象メッシュのUUID (mesh.uuid)
// 値: ハイライト前の emissive 色と強度 { color: THREE.Color, intensity: number }
const originalEmissiveState = new Map();

// --- 設定 ---
const highlightColor = new THREE.Color(0xffff00); // ハイライト色 (黄色)
const highlightEmissiveIntensity = 0.5; // ハイライト時の発光強度

/**
 * 指定されたメッシュをハイライト表示します。
 * すでにハイライトされている場合は何もしません。
 * 元のマテリアルの発光状態を Map に保存します。
 * @param {THREE.Mesh | null | undefined} mesh - ハイライトする対象のメッシュ。
 * null や undefined の場合は何もしません。
 */
export function highlightMesh(mesh) {
    // メッシュやマテリアルが無効、またはマテリアルが配列の場合は処理しない
    if (!mesh?.material || Array.isArray(mesh.material)) {
        console.warn("[HighlightHelper] ハイライト対象のメッシュまたはマテリアルが無効です。", mesh);
        return;
    }
    // 既にハイライトされている（元の状態がMapにある）場合は何もしない
    if (originalEmissiveState.has(mesh.uuid)) {
        // console.log(`[HighlightHelper] メッシュ ${mesh.uuid} は既にハイライトされています。`);
        return;
    }

    // 元の発光状態を保存 (emissive がなければデフォルト値を保存)
    const originalState = {
        color: mesh.material.emissive ? mesh.material.emissive.clone() : new THREE.Color(0x000000),
        intensity: mesh.material.emissiveIntensity || 0
    };
    originalEmissiveState.set(mesh.uuid, originalState);

    // メッシュのマテリアルの発光色を設定してハイライト
    // emissive プロパティがないマテリアル (例: MeshBasicMaterial) の場合は警告を出す
    if (mesh.material.emissive === undefined) {
         console.warn(`[HighlightHelper] ハイライト対象のマテリアルには emissive プロパティがありません。`, mesh.material);
    } else {
        mesh.material.emissive.set(highlightColor);
        mesh.material.emissiveIntensity = highlightEmissiveIntensity;
        // マテリアルの変更を反映させる（重要）
        mesh.material.needsUpdate = true;
        // console.log(`[HighlightHelper] メッシュ ${mesh.uuid} をハイライトしました。`);
    }
}

/**
 * 指定されたメッシュのハイライトを解除します。
 * Map に保存された元の発光状態を使って復元します。
 * @param {THREE.Mesh | null | undefined} mesh - ハイライトを解除する対象のメッシュ。
 * null や undefined の場合は何もしません。
 */
export function unhighlightMesh(mesh) {
    // メッシュやマテリアルが無効、またはマテリアルが配列の場合は処理しない
    if (!mesh?.material || Array.isArray(mesh.material)) {
        // console.warn("[HighlightHelper] ハイライト解除対象のメッシュまたはマテリアルが無効です。", mesh);
        return;
    }
    // 元の状態情報がMapになければ（ハイライトされていなければ）何もしない
    if (!originalEmissiveState.has(mesh.uuid)) {
        // console.log(`[HighlightHelper] メッシュ ${mesh.uuid} はハイライトされていません。`);
        return;
    }

    // 保存しておいた元の発光状態を取得
    const originalState = originalEmissiveState.get(mesh.uuid);

    // 元の発光情報をメッシュのマテリアルに復元
    if (mesh.material.emissive !== undefined) {
        mesh.material.emissive.copy(originalState.color);
        mesh.material.emissiveIntensity = originalState.intensity;
        // マテリアルの変更を反映させる
        mesh.material.needsUpdate = true;
        // console.log(`[HighlightHelper] メッシュ ${mesh.uuid} のハイライトを解除しました。`);
    } else {
         console.warn(`[HighlightHelper] ハイライト解除対象のマテリアルには emissive プロパティがありません。`, mesh.material);
    }


    // 保存情報をMapから削除
    originalEmissiveState.delete(mesh.uuid);
    // 保存していた Color オブジェクトは Map から消えればGC対象になる (dispose不要)
}

/**
 * 指定されたブロックデータ配列に対応する全てのメッシュのハイライトを解除します。
 * 現在の編集モードに応じて、ハイライト解除対象のメッシュ (通常 or 前景) を判断します。
 * @param {BlockData[]} blockDataArray - 対象のBlockData配列。
 * @param {EditMode} currentMode - 現在の編集モード。
 */
export function clearAllHighlights(blockDataArray, currentMode) {
    // console.log("[HighlightHelper] 全てのハイライトをクリアします...");
    if (!Array.isArray(blockDataArray)) return;

    blockDataArray.forEach(blockData => {
        // モードに応じてハイライト解除対象のメッシュを選択
        const meshToUnhighlight = (currentMode === EditMode.XML_EDIT)
            ? blockData.foregroundMesh // XML編集モードでは前景キューブ
            : blockData.mesh;         // それ以外は通常のメッシュ
        if (meshToUnhighlight) {
            unhighlightMesh(meshToUnhighlight);
        }
    });

    // Mapに残っているハイライト情報があれば、念のため全てクリア (エラーケース対応)
    // これは通常は起こらないはずだが、安全のため
    if (originalEmissiveState.size > 0) {
        console.warn(`[HighlightHelper] clearAllHighlights 後も ${originalEmissiveState.size} 個のハイライト情報が残っています。強制的にクリアします。`);
        // Mapに残っているUUIDに対応するメッシュがシーンに存在するかは不明なため、
        // ここでメッシュのマテリアルを操作するのは危険。Mapをクリアするだけにする。
        originalEmissiveState.clear();
    }
    // console.log("[HighlightHelper] 全ハイライトクリア完了。");
}

/**
 * 指定されたメッシュが現在ハイライトされているか確認します。
 * @param {THREE.Mesh | null | undefined} mesh - 確認対象のメッシュ。
 * @returns {boolean} ハイライトされていれば true。
 */
export function isHighlighted(mesh) {
    // mesh?.uuid が Map のキーに存在するかどうかで判定
    return originalEmissiveState.has(mesh?.uuid);
}