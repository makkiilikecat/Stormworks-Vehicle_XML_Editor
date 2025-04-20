// src/controllers/SelectionController.js
import * as THREE from 'three';
import { setSelectedBlockId, getSelectedBlockId, addStateChangeListener, isXmlEditModeActive } from '../app/AppState.js';
// faceHighlightMaterial, selectedMaterial をインポート
import { normalMaterial, selectedMaterial, faceHighlightMaterial, createGhostMaterials } from '../models/BlockUtils.js';
import { raycastFromMouse } from '../services/RaycastService.js';
import { getAllMeshes, getMeshById } from '../models/BlockDataManager.js'; // DataManagerから取得

let currentHighlightedMesh = null; // ブロック全体のハイライト用メッシュ参照
let originalMaterials = null;      // ブロック全体選択前のマテリアル配列(のクローン)

let currentHighlightFaceIndex = null; // ハイライト中の面のインデックス
let originalFaceMaterial = null;      // ハイライト前の面のマテリアル参照

let ghostMesh = null;

/**
 * SelectionControllerを初期化します。
 */
export function initSelectionController(scene) { // ★ Sceneを受け取る
    addStateChangeListener(handleStateChange);
    initGhostMesh(scene); // ★ ゴーストメッシュ初期化
    console.log("SelectionController initialized.");
}

/** ★ 新規: ゴースト表示用メッシュを初期化 */
function initGhostMesh(scene){
    if (!scene) return;
    // ジオメトリは共有
    ghostMesh = new THREE.Mesh(blockGeometry, createGhostMaterials(normalMaterial)); // 初期マテリアル設定
    ghostMesh.matrixAutoUpdate = false;
    ghostMesh.visible = false;
    ghostMesh.renderOrder = 0.5; // 選択メッシュとリアルタイムメッシュの間くらい
    scene.add(ghostMesh);
}

/** ★ 新規: ゴーストメッシュの行列を更新 */
export function updateGhostMesh(matrix) {
    if (ghostMesh && ghostMesh.visible) {
        ghostMesh.matrix.copy(matrix);
    }
}

/** ★ 新規: ゴーストメッシュの表示/非表示 */
export function setGhostVisible(visible) {
    if (ghostMesh) {
        if (visible && getSelectedBlockId()) { // 選択中のみ表示
            const selectedMesh = getMeshById(getSelectedBlockId());
            if (selectedMesh) {
                // ゴーストのマテリアルを選択中ブロックのマテリアルに合わせる
                ghostMesh.material = createGhostMaterials(selectedMesh.material);
                // ゴーストの位置/姿勢を選択中ブロックに初期化
                ghostMesh.matrix.copy(selectedMesh.matrix);
                ghostMesh.visible = true;
            } else {
                 ghostMesh.visible = false; // 選択メッシュが見つからない場合
            }
        } else {
             ghostMesh.visible = false;
        }
    }
}

/**
 * マウス座標からクリックされたブロックを選択/解除します。
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

/**
 * ブロック全体の選択状態に応じてハイライト（マテリアル差し替え）を行います。
 * @param {string | null} blockId - 選択されたブロックのID、または選択解除の場合はnull
 */
function highlightSelectedBlock(blockId) {
    // 以前のブロック全体のハイライトを解除 (面ハイライトも内部で解除される)
    clearBlockHighlight();
    setGhostVisible(false); // ゴーストも消す

    // 新しいブロックを選択状態の色にする
    if (blockId) {
        const selectedMesh = getMeshById(blockId);
        if (selectedMesh && Array.isArray(selectedMesh.material)) {
             // 元のマテリアル配列を記憶(ディープコピー推奨だが、今回はクローンで)
             originalMaterials = selectedMesh.material.map(m => m.clone());
             // 新しい選択色マテリアルの配列を作成
             const selectedMats = [];
             for(let i=0; i<6; ++i) {
                const mat = selectedMaterial.clone();
                // mat.side = THREE.DoubleSide; // createMaterial内で設定済み想定
                selectedMats.push(mat);
            }
             selectedMesh.material = selectedMats; // 全面を選択色に差し替え
             selectedMesh.material.needsUpdate = true; // 反映
             currentHighlightedMesh = selectedMesh;
        }
    }
}

/** ブロック全体のハイライトを解除し、元のマテリアルに戻します */
function clearBlockHighlight() {
    clearFaceHighlight(); // 面ハイライトも確実に消す
    if (currentHighlightedMesh) {
        if (Array.isArray(currentHighlightedMesh.material) && originalMaterials && Array.isArray(originalMaterials)) {
             // 前に保持しておいた元のマテリアル配列に戻す
             // 古いマテリアルを破棄
             currentHighlightedMesh.material.forEach(m => m.dispose());
             currentHighlightedMesh.material = originalMaterials;
             currentHighlightedMesh.material.needsUpdate = true;
        } else {
            // エラーケースやフォールバック (通常マテリアルに戻す)
            console.warn("Could not restore original materials for block highlight.");
            if(Array.isArray(currentHighlightedMesh.material)){
                currentHighlightedMesh.material.forEach(m => m.dispose());
                const mats = [];
                for(let i=0; i<6; ++i) mats.push(normalMaterial.clone());
                currentHighlightedMesh.material = mats;
                currentHighlightedMesh.material.needsUpdate = true;
            }
        }
        currentHighlightedMesh = null;
        originalMaterials = null;
    }
}


/**
 * マウス下の面をハイライト表示します (XML編集モード中のみ)。
 * @param {THREE.Vector2} mouseCoords - 正規化マウス座標
 * @returns {object | null} 交差情報 { faceNormal, object, point, faceIndex } または null
 */
export function highlightHoveredFace(mouseCoords) {
    const selectedId = getSelectedBlockId();
    // XML編集モード中 かつ ブロック選択中 でなければハイライトしない
    if (!isXmlEditModeActive() || !selectedId) {
        clearFaceHighlight();
        return null;
    }
    const selectedMesh = getMeshById(selectedId);
    if (!selectedMesh || !Array.isArray(selectedMesh.material)) { // マテリアル配列でない場合は処理不可
        clearFaceHighlight();
        return null;
    }

    const intersects = raycastFromMouse(mouseCoords, [selectedMesh]);

    if (intersects.length > 0 && intersects[0].face && typeof intersects[0].face.materialIndex === 'number') {
        const intersection = intersects[0];
        const faceIndex = intersection.face.materialIndex;

        // 同じ面が既にハイライトされていれば、情報を返しつつ何もしない
        if (currentHighlightFaceIndex === faceIndex) {
            const faceNormal = intersection.face.normal.clone().transformDirection(selectedMesh.matrixWorld).normalize();
            return { faceNormal: faceNormal, object: selectedMesh, point: intersection.point, faceIndex: faceIndex };
        }

        // 別の面なので、前のハイライトをクリア
        clearFaceHighlight();

        if (faceIndex < selectedMesh.material.length) {
            // 元のマテリアルを記憶 (選択中なら selectedMaterial のはず)
            originalFaceMaterial = selectedMesh.material[faceIndex];
            // ハイライト用マテリアルに差し替え
            selectedMesh.material[faceIndex] = faceHighlightMaterial.clone();
            selectedMesh.material.needsUpdate = true; // ★ マテリアル変更を反映
            currentHighlightFaceIndex = faceIndex; // ハイライト中の面インデックスを更新
            // currentHighlightedMesh はブロック全体の選択なので、ここでは変更しない

            // ドラッグ開始用に情報を返す
             const faceNormal = intersection.face.normal.clone().transformDirection(selectedMesh.matrixWorld).normalize();
            return { faceNormal: faceNormal, object: selectedMesh, point: intersection.point, faceIndex: faceIndex };
        }
    } else {
        // 何もヒットしなければクリア
        clearFaceHighlight();
    }
    return null;
}

/** 面のハイライトをクリアし、元のマテリアルに戻す */
export function clearFaceHighlight() {
    // ハイライト中の面があり、かつそのブロックがまだ選択中(全体ハイライト中)である場合
    if (currentHighlightFaceIndex !== null && currentHighlightedMesh && originalFaceMaterial) {
        if (Array.isArray(currentHighlightedMesh.material) && currentHighlightFaceIndex < currentHighlightedMesh.material.length) {
            // 前にハイライトした面のマテリアルを元に戻す
             currentHighlightedMesh.material[currentHighlightFaceIndex].dispose(); // ハイライト用を破棄
             currentHighlightedMesh.material[currentHighlightFaceIndex] = originalFaceMaterial; // 記憶していた元のマテリアル
             currentHighlightedMesh.material.needsUpdate = true;
        }
    }
    // 状態をリセット
    currentHighlightFaceIndex = null;
    originalFaceMaterial = null;
}


// AppState の変更をリッスンするハンドラ
function handleStateChange(changedState) {
    if (changedState.hasOwnProperty('selectedBlockId')) {
        highlightSelectedBlock(changedState.selectedBlockId);
        // 選択解除時にもゴーストを非表示にする
        if (!changedState.selectedBlockId) setGhostVisible(false);
    }
    if ((changedState.isDeleteMode && changedState.isDeleteMode === true) ||
        (changedState.isXmlEditMode && changedState.isXmlEditMode === false)) {
        clearFaceHighlight();
        setGhostVisible(false); // モード変更時もゴースト非表示
    }
}