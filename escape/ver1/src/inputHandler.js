import * as THREE from 'three';
// ★ 修正: getPreviewOrientationMatrix をインポート
import { updateMousePosition, getPreviewPosition, setPreviewVisible, rotatePreview, flipPreview, getPreviewOrientationMatrix, updatePreviewBlock } from './previewController.js';
// ★ 修正: placeBlock の引数に合わせて変更
import { placeBlock } from './placementController.js';
import { setDeleteMode, isDeleteModeActive } from './appState.js';
import { deleteBlock } from './deletionController.js';

let camera, scene;
let placedBlocksData = [];
let isMouseOverCanvas = false;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const xAxis = new THREE.Vector3(1, 0, 0);
const yAxis = new THREE.Vector3(0, 1, 0);
const zAxis = new THREE.Vector3(0, 0, 1);
const rotationAngle = Math.PI / 2;

export function initInputHandler(domElement, cam, scn, blocksDataArray) {
    camera = cam;
    scene = scn;
    placedBlocksData = blocksDataArray;
    domElement.addEventListener('mousemove', onMouseMove);
    domElement.addEventListener('pointerdown', onPointerDown);
    domElement.addEventListener('mouseenter', () => { isMouseOverCanvas = true; });
    domElement.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('keydown', onKeyDown);
}

function onMouseMove(event) {
    const clientX = event.clientX;
    const clientY = event.clientY;
    updateMousePosition(clientX, clientY);
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
}

function onPointerDown(event) {
    if (event.button !== 0) return;
    if (isDeleteModeActive()) {
        handleDeleteClick();
    } else {
        handlePlaceClick();
    }
}

function handlePlaceClick() {
    const positionToPlace = getPreviewPosition();
    // ★ 修正: 姿勢行列を取得
    const orientationToPlace = getPreviewOrientationMatrix();

    // ★ 修正: position と orientation の両方が有効なら配置
    if (positionToPlace && orientationToPlace) {
        placeBlock(positionToPlace, orientationToPlace); // ★ 引数を変更
        updatePreviewBlock(placedBlocksData);
    }
}

function handleDeleteClick() {
    if (!camera || !placedBlocksData) return;
    raycaster.setFromCamera(mouse, camera);
    const targetMeshes = placedBlocksData.map(data => data.mesh).filter(mesh => !!mesh);
    if (targetMeshes.length === 0) return;
    const intersects = raycaster.intersectObjects(targetMeshes, false);
    if (intersects.length > 0) {
        const intersectedMesh = intersects[0].object;
        if (intersectedMesh && intersectedMesh.isMesh) {
            deleteBlock(intersectedMesh);
            updatePreviewBlock(placedBlocksData);
        }
    }
}

function onKeyDown(event) {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';
    if (isInputFocused) return;

    let previewNeedsUpdate = false;

    if (!isDeleteModeActive()) {
        previewNeedsUpdate = handleRotationKeyPress(event) || handleFlipKeyPress(event);
    }
    if (event.code === 'KeyX') {
        setDeleteMode(!isDeleteModeActive());
        previewNeedsUpdate = true;
        if (isDeleteModeActive()) {
            setPreviewVisible(false);
        }
    }

    if (previewNeedsUpdate) {
         updatePreviewBlock(placedBlocksData);
    }
}

function handleRotationKeyPress(event) {
    let rotated = false;
    switch (event.code) {
        case 'KeyJ': rotatePreview(xAxis, -rotationAngle); rotated = true; break;
        case 'KeyK': rotatePreview(yAxis, rotationAngle); rotated = true; break;
        case 'KeyL': rotatePreview(zAxis, rotationAngle); rotated = true; break;
    }
    return rotated;
}

function handleFlipKeyPress(event) {
     let flipped = false;
     switch (event.code) {
        case 'KeyU': flipPreview('x'); flipped = true; break;
        case 'KeyI': flipPreview('y'); flipped = true; break;
        case 'KeyO': flipPreview('z'); flipped = true; break;
    }
    return flipped;
}


function onMouseLeave() {
    isMouseOverCanvas = false;
    setPreviewVisible(false);
}

export function getIsMouseOverCanvas() {
    return isMouseOverCanvas;
}