// src/controllers/SelectionController.js
import * as THREE from 'three';
import { setSelectedBlockId, getSelectedBlockId, addStateChangeListener } from '../app/AppState.js';
import { normalMaterial, selectedMaterial, faceHighlightMaterial } from '../models/BlockUtils.js';
import { raycastFromMouse } from '../services/RaycastService.js';
import { getAllMeshes, getMeshById } from '../models/BlockDataManager.js'; // DataManagerから取得
import { isXmlEditModeActive, isDeleteModeActive } from '../app/AppState.js';

let camera; // RaycastService初期化後に設定される想定だったが、直接は不要に
let currentHighlightedMesh = null;
let originalMaterial = null; // ハイライト前のマテリアルを保持
let faceHighlightMesh = null;

/**
 * SelectionControllerを初期化します。
 */
export function initSelectionController() {
    // 状態変更を監視してハイライトを更新
    addStateChangeListener(handleStateChange);

     // BoxGeometryの面と同じサイズにする
     const faceGeo = new THREE.PlaneGeometry(THREE.BLOCK_SIZE_METERS, THREE.BLOCK_SIZE_METERS);
     faceHighlightMesh = new THREE.Mesh(faceGeo, faceHighlightMaterial.clone());
     faceHighlightMesh.visible = false;
     faceHighlightMesh.renderOrder = 1; // 他のメッシュより手前に描画

    console.log("SelectionController initialized.");
}

// ★追加: App.jsからScene参照を受け取りハイライトメッシュを追加する関数
export function addHighlightMeshToScene(scene) {
    if (scene && faceHighlightMesh) {
        scene.add(faceHighlightMesh);
    }
}

/**
 * マウス座標からクリックされたブロックを選択します。
 * @param {THREE.Vector2} mouseCoords - 正規化デバイス座標
 */
export function selectBlockByRaycast(mouseCoords) {
    const meshes = getAllMeshes(); // 現在の全メッシュを取得
    if (!meshes || meshes.length === 0) {
        setSelectedBlockId(null); // 対象がない場合は選択解除
        return;
    }

    const intersects = raycastFromMouse(mouseCoords, meshes); // Raycast実行

    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        if (clickedMesh.isMesh && clickedMesh.userData.blockId) {
            // 既に選択されているものをクリックしたら解除、そうでなければ選択
            if (getSelectedBlockId() === clickedMesh.userData.blockId) {
                 setSelectedBlockId(null);
            } else {
                setSelectedBlockId(clickedMesh.userData.blockId); // AppState更新
            }
        } else {
             setSelectedBlockId(null); // メッシュだがIDがない場合などは解除
        }
    } else {
        // 何もないところをクリックしたら選択解除
        setSelectedBlockId(null);
    }
}

// 選択状態に応じてメッシュのマテリアルを変更（ハイライト）
function highlightSelectedBlock(blockId) {
    // 前のハイライトを解除
    if (currentHighlightedMesh) {
        currentHighlightedMesh.material = originalMaterial || normalMaterial.clone(); // 元のマテリアルに戻す
        currentHighlightedMesh = null;
        originalMaterial = null;
    }
    // 新しいブロックをハイライト
    if (blockId) {
        const selectedMesh = getMeshById(blockId); // DataManagerからメッシュ取得
        if (selectedMesh) {
            originalMaterial = selectedMesh.material; // 元のマテリアルを記憶
            selectedMesh.material = selectedMaterial.clone(); // 選択用マテリアルに差し替え
            currentHighlightedMesh = selectedMesh;
        }
    }
}

/**
 * ★新規: マウス下の面をハイライト表示します (XML編集モード中のみ)
 * @param {THREE.Vector2} mouseCoords - 正規化マウス座標
 */
export function highlightHoveredFace(mouseCoords) {
    if (!isXmlEditModeActive() || !getSelectedBlockId()) {
        clearFaceHighlight(); // モード外または未選択ならハイライト解除
        return null; // ハイライトしなかった or 対象なし
    }
    const selectedMesh = getMeshById(getSelectedBlockId());
    if (!selectedMesh) { clearFaceHighlight(); return null; }

    const intersects = raycastFromMouse(mouseCoords, [selectedMesh]); // 選択中のメッシュのみ対象

    if (intersects.length > 0 && intersects[0].face) {
        const intersection = intersects[0];
        const face = intersection.face;
        const object = intersection.object; // selectedMeshと同じはず

        // 面の位置と向きにハイライトメッシュを合わせる
        const faceNormal = face.normal.clone().transformDirection(object.matrixWorld).normalize();
        // 面の中心 = 交点 + (面法線逆向き * わずかなオフセット)
        const faceCenter = intersection.point.clone().addScaledVector(faceNormal, 0.001); // 少し浮かせる

        faceHighlightMesh.position.copy(faceCenter);
        // 面の法線に合わせてPlaneを回転 (lookAtを使用)
        faceHighlightMesh.lookAt(faceCenter.clone().add(faceNormal));
        faceHighlightMesh.visible = true;
        return { faceNormal: faceNormal, object: object, point: intersection.point, face:face }; // ドラッグ開始用に情報を返す
    } else {
        clearFaceHighlight();
        return null;
    }
}

/** ★新規: 面のハイライトを消去 */
export function clearFaceHighlight() {
    if (faceHighlightMesh) {
        faceHighlightMesh.visible = false;
    }
}

// AppState の変更をリッスンしてハイライトを更新する
function handleStateChange(changedState) {
    if (changedState.hasOwnProperty('selectedBlockId')) {
        highlightSelectedBlock(changedState.selectedBlockId);
        if (!changedState.selectedBlockId) clearFaceHighlight(); // 選択解除で面ハイライトも消す
    }
    if (changedState.isDeleteMode === true || changedState.isXmlEditMode === false) {
        clearFaceHighlight(); // モード変更時も消す
    }
}