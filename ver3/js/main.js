import * as THREE from 'three';
import { setupSceneEnvironment, handleWindowResize } from './setup/sceneSetup.js';
import { setupOrbitControls } from './setup/controlsSetup.js';
import { setupHelpers } from './setup/helpersSetup.js';
import { createOriginBlockData } from './objects/initialObjects.js';
import { loadFileAsText, parseVehicleXml, generateVehicleXml, downloadXmlFile } from './io/fileHandler.js';
import { BlockData } from './data/blockData.js';
import { clearBlocks, renderBlocks } from './rendering/blockRenderer.js';
import { showPreviewBlock, hidePreviewBlock, updatePreviewOrientation } from './rendering/previewBlock.js';
import { getCurrentMode, setEditMode, EditMode, allowsBlockPlacement } from './state/editMode.js';
import { getCurrentPlacementBlockId, getPreviewOrientation, resetPreviewOrientation } from './state/placementState.js';
import { setupHistoryManager, addAction, undo, redo } from './state/historyManager.js';
import { updateModeIndicator } from './ui/modeIndicator.js';
import { setupInventoryUI } from './ui/inventoryUI.js';
// setupKeyboardShortcuts は input/keyboardHandler.js に移動したが、処理自体は setupKeyboardInput で行う
import { applyRotation, applyFlip } from './interactions/rotationHandler.js'; // キー処理で直接使うためインポート
import { handleSelectionClick, getSelectedBlocks, clearSelection } from './interactions/selectionHandler.js';
import { deleteBlock, placeBlock } from './interactions/blockActions.js';
import { getPlacementInfo } from './interactions/placementHandler.js';

// --- グローバル変数 ---
let scene, camera, renderer, controls;
let loadedBlocks = []; // 読み込んだ/配置したブロックデータを格納 (原点ブロックも含む)
let selectedFile = null; // ユーザーが選択したファイルを保持

// --- UI要素への参照 ---
const fileInput = document.getElementById('fileInput');
const loadButton = document.getElementById('loadButton');
const saveButton = document.getElementById('saveButton');
const fileStatus = document.getElementById('file-status');
const canvas = document.getElementById('workbench-canvas'); // Canvas参照


/**
 * アプリケーションの初期化処理
 */
function init() {
    const sceneEnv = setupSceneEnvironment();
    scene = sceneEnv.scene;
    camera = sceneEnv.camera;
    renderer = sceneEnv.renderer;
    controls = setupOrbitControls(camera, renderer.domElement);
    setupHelpers(scene);

    // 原点ブロックをBlockDataとして生成し、loadedBlocksに追加
    const originBlockData = createOriginBlockData(scene);
    loadedBlocks.push(originBlockData);

    // HistoryManagerを初期化 (シーンとブロック配列への参照を渡す)
    setupHistoryManager(scene, loadedBlocks);

    setupEventListeners(); // UIなどのイベントリスナーを設定
    setupKeyboardInput(); // キーボード入力のイベントリスナーを設定
    setupInventoryUI(); // インベントリUIのイベントリスナーを設定
    updateModeIndicator(getCurrentMode()); // 初期モード表示

    window.addEventListener('resize', () => handleWindowResize(camera, renderer));
    animate(); // アニメーションループ開始
}

/**
 * UI要素やDOMにイベントリスナーを設定します。
 */
function setupEventListeners() {
    // --- ファイル選択 ---
    fileInput.addEventListener('change', (event) => {
        selectedFile = event.target.files[0];
        fileStatus.textContent = selectedFile ? `ファイル選択中: ${selectedFile.name}` : '';
        fileStatus.style.color = '#eee';
    });
    // --- ボタン ---
    loadButton.addEventListener('click', handleLoadButtonClick);
    saveButton.addEventListener('click', handleSaveButtonClick);
    // --- Canvas マウス操作 ---
    canvas.addEventListener('pointerdown', handleCanvasPointerDown);
    canvas.addEventListener('pointermove', handleCanvasPointerMove);
    canvas.addEventListener('pointerleave', hidePreviewBlock); // カーソルが離れたらプレビュー非表示
}

/**
 * 読み込みボタンクリック時の処理
 */
async function handleLoadButtonClick() {
    if (!selectedFile) {
        alert('先にXMLファイルを選択してください。');
        fileStatus.textContent = 'ファイルが選択されていません';
        fileStatus.style.color = 'orange';
        return;
    }
    fileStatus.textContent = '読み込み中...';
    fileStatus.style.color = '#eee';
    try {
        const xmlString = await loadFileAsText(selectedFile);
        const parsedBlocks = parseVehicleXml(xmlString);
        // 既存のブロックメッシュを全てクリア
        clearBlocks(scene);
        // 内部データを新しいものに置き換え
        loadedBlocks = parsedBlocks;
        // HistoryManagerも新しいデータで初期化 (履歴リセット)
        setupHistoryManager(scene, loadedBlocks);
        // 新しいブロックデータを描画
        renderBlocks(scene, loadedBlocks);
        fileStatus.textContent = `読み込み完了: ${loadedBlocks.length} ブロック`;
        fileStatus.style.color = 'lightgreen';
    } catch (error) {
        console.error('ファイル読み込みまたは解析エラー:', error);
        fileStatus.textContent = `エラー: ${error.message}`;
        fileStatus.style.color = 'tomato';
        // エラー時はクリア
        clearBlocks(scene);
        loadedBlocks = [];
        setupHistoryManager(scene, loadedBlocks); // 履歴もリセット
    }
}

/**
 * 保存ボタンクリック時の処理
 */
function handleSaveButtonClick() {
     const blocksToSave = loadedBlocks;
     // if (blocksToSave.length === 0) { // 原点のみでも保存可能とするか？現状はloadedBlocksが空だとエラーになる
     //     alert('保存するブロックがありません。');
     //      fileStatus.textContent = '保存対象がありません';
     //      fileStatus.style.color = 'orange';
     //     return;
     // }
     fileStatus.textContent = 'XML生成中...';
     fileStatus.style.color = '#eee';
     try {
         const xmlString = generateVehicleXml(blocksToSave);
         const filename = selectedFile ? selectedFile.name.replace('.xml', '_edited.xml') : 'vehicle_edited.xml';
         downloadXmlFile(xmlString, filename);
         fileStatus.textContent = `ファイル保存完了: ${filename}`;
         fileStatus.style.color = 'lightblue';
     } catch (error) {
         console.error('XML生成または保存エラー:', error);
         fileStatus.textContent = `保存エラー: ${error.message}`;
         fileStatus.style.color = 'tomato';
     }
}

/**
 * キーボード入力のイベントリスナーを設定します。
 * モード切り替え、アンドゥ/リドゥ、回転/反転などを処理します。
 */
function setupKeyboardInput() {
     document.addEventListener('keydown', (event) => {
        const shiftPressed = event.shiftKey;
        const ctrlPressed = event.ctrlKey || event.metaKey;
        const altPressed = event.altKey;
        const key = event.key.toUpperCase();
        const currentMode = getCurrentMode();

        // テキスト入力中などは無視
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

        // --- アンドゥ/リドゥ (最優先) ---
        if (ctrlPressed && !altPressed) {
            if (key === 'Z' && !shiftPressed) { event.preventDefault(); undo(); return; }
            if (key === 'Y' && !shiftPressed) { event.preventDefault(); redo(); return; }
            // if (key === 'Z' && shiftPressed) { event.preventDefault(); redo(); return; } // Optional Redo
        }

        // --- モード切り替え ---
        let targetMode = null;
        switch (key) {
            case 'X': if (!shiftPressed && !ctrlPressed && !altPressed) { targetMode = (currentMode === EditMode.DELETE) ? EditMode.NORMAL : EditMode.DELETE; } break;
            case 'E': if (shiftPressed && !ctrlPressed && !altPressed) { targetMode = (currentMode === EditMode.XML_EDIT) ? EditMode.NORMAL : EditMode.XML_EDIT; event.preventDefault(); } break;
            case 'S': if (shiftPressed && !ctrlPressed && !altPressed) { targetMode = (currentMode === EditMode.RANGE_SELECT) ? EditMode.NORMAL : EditMode.RANGE_SELECT; event.preventDefault(); } break;
            case 'C': if (shiftPressed && !ctrlPressed && !altPressed) { targetMode = (currentMode === EditMode.PAINT) ? EditMode.NORMAL : EditMode.PAINT; event.preventDefault(); } break;
            case 'ESCAPE': targetMode = EditMode.NORMAL; break;
        }
        if (targetMode !== null && targetMode !== currentMode) {
            setEditMode(targetMode); updateModeIndicator(getCurrentMode()); return;
        }

        // --- 回転/反転 ---
        if (['J', 'K', 'L', 'U', 'I', 'O'].includes(key)) {
            if (!ctrlPressed && !altPressed && !shiftPressed) { // 修飾キーなし
                if (currentMode === EditMode.NORMAL) {
                    // 通常モード: プレビューを操作
                    const opFunc = ['J', 'K', 'L'].includes(key) ? applyRotation : applyFlip;
                    const currentOrientation = getPreviewOrientation();
                    opFunc(currentOrientation, key);
                    setPreviewOrientation(currentOrientation);
                    updatePreviewOrientation(currentOrientation); // プレビューメッシュ更新
                    event.preventDefault();
                } else if (currentMode === EditMode.XML_EDIT) {
                    // XML編集モード: 選択ブロックを操作
                    const selected = getSelectedBlocks();
                    if (selected.length > 0) {
                        const opFunc = ['J', 'K', 'L'].includes(key) ? applyRotation : applyFlip;
                        const transformations = [];
                        selected.forEach(blockData => {
                            const oldMatrix = blockData.rotationMatrix.clone();
                            opFunc(blockData.rotationMatrix, key);
                            blockData.mesh.matrix.copy(blockData.rotationMatrix);
                            blockData.mesh.matrix.setPosition(blockData.position);
                            blockData.mesh.matrixWorldNeedsUpdate = true;
                            transformations.push({ blockId: blockData.id, oldMatrix: oldMatrix, newMatrix: blockData.rotationMatrix.clone() });
                        });
                        addAction({ type: 'TRANSFORM_BLOCKS', transformations: transformations });
                        event.preventDefault();
                    }
                }
                // TODO: 範囲選択モードでの処理
            }
        }
     });
}

/**
 * Canvas上でポインター（マウス左ボタン）が押されたときの処理
 * モードに応じてブロック選択、削除、または配置を実行します。
 * @param {PointerEvent} event
 */
function handleCanvasPointerDown(event) {
    if (event.button !== 0) return; // 左ボタンのみ
    // OrbitControlsがマウスを掴んでいる（カメラ操作中）なら何もしない
    // (OrbitControlsのイベント伝播停止に依存せず、ここでチェックする方が確実かもしれない)
    // if (!controls.enabled) return; // このチェック方法は不正確な場合がある

    // カメラ操作中かどうかのより確実な判定が必要な場合、
    // OrbitControlsの'start'/'end'イベントを使うなどの方法があるが、一旦保留

    const currentMode = getCurrentMode();

    if (currentMode === EditMode.DELETE) {
        // --- 削除モード ---
        // Raycastしてヒットしたブロックを取得
        const placementInfo = getPlacementInfo(event, camera, loadedBlocks, renderer.domElement);
        if (placementInfo?.targetBlock) { // targetBlock が null でないことを確認
            deleteBlock(placementInfo.targetBlock, loadedBlocks, scene); // isHistoryAction=false (デフォルト)
        }
    } else if (allowsBlockPlacement(currentMode)) {
         // --- 配置可能モード (通常モード) ---
        const placementInfo = getPlacementInfo(event, camera, loadedBlocks, renderer.domElement);
        if (placementInfo) { // 有効な配置場所が見つかった
            const blockIdToPlace = getCurrentPlacementBlockId();
            const orientationMatrix = getPreviewOrientation();
            const placedBlock = placeBlock(placementInfo.position, orientationMatrix, blockIdToPlace, loadedBlocks, scene); // isHistoryAction=false (デフォルト)
            if(placedBlock){
                 updatePreview(event); // 配置後もプレビュー更新
            }
        } else {
             // 配置できない場所をクリックした場合、選択を解除
             clearSelection();
        }
    } else {
        // --- その他のモード（選択処理） ---
        handleSelectionClick(
            event,
            event.ctrlKey || event.metaKey, // Ctrlキーの状態
            camera,
            scene,
            renderer.domElement,
            loadedBlocks
        );
    }
}

/**
 * Canvas上でポインター（マウス）が移動したときの処理
 * 通常モード時にプレビューブロックを更新します。
 * @param {PointerEvent} event
 */
function handleCanvasPointerMove(event) {
     // カメラ操作中は何もしない (特にドラッグ中)
     // if (!controls.enabled) return; // これだけだと不十分な場合あり

     if (getCurrentMode() === EditMode.NORMAL) {
         updatePreview(event);
     } else {
         // 他のモードではプレビューを非表示にする
         hidePreviewBlock();
     }
}

/**
 * 通常モード時にプレビューブロックの位置と向きを更新します。
 * @param {MouseEvent} event - マウスイベント。
 * @private
 */
function updatePreview(event){
    // Raycastして配置候補地を取得
    const placementInfo = getPlacementInfo(event, camera, loadedBlocks, renderer.domElement);
    if (placementInfo) {
        // プレビューの向きを取得
        const orientationMatrix = getPreviewOrientation();
        // プレビュー表示/更新
        showPreviewBlock(scene, placementInfo.position, orientationMatrix);
    } else {
        // 配置候補地が見つからなければ非表示
        hidePreviewBlock();
    }
}


/**
 * アニメーションループ (フレームごとに実行)
 */
function animate() {
    requestAnimationFrame(animate); // 次のフレームを要求

    // カメラコントロールを更新 (慣性などを適用)
    controls.update();

    // シーンを描画
    renderer.render(scene, camera);
}

// --- ヘルパー関数 ---
/**
 * マウスイベントからマウスの正規化デバイス座標を計算します。
 * @param {MouseEvent} event - マウスイベント。
 * @param {HTMLElement} domElement - レンダラーのDOM要素。
 * @returns {THREE.Vector2} 正規化デバイス座標。
 * @private
 */
function getMouseNDCFromEvent(event, domElement) {
    const rect = domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return mouse;
}

// --- アプリケーション開始 ---
init();