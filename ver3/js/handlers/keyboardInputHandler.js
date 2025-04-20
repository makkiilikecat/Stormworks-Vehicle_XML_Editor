/**
 * @fileoverview キーボード入力イベントを処理し、モード切り替えやアンドゥ/リドゥなどを実行。
 */

import { getCurrentMode, setEditMode, EditMode } from '../state/editMode.js';
import { updateModeIndicator } from '../ui/modeIndicator.js';
import { getPreviewOrientation, setPreviewOrientation } from '../state/placementState.js';
import { applyRotation, applyFlip } from '../interactions/rotationHandler.js';
import { updatePreviewOrientation as updatePreviewMeshOrientation } from '../rendering/previewBlock.js';
import { getSelectedBlocks } from '../interactions/selectionHandler.js';
import { addAction, undo, redo } from '../state/historyManager.js';
import { showXmlEditPanel, hideXmlEditPanel } from '../ui/xmlEditUI.js';

/**
 * キーボード入力イベントリスナーを初期化します。
 * @param {object} appState - アプリケーションの状態オブジェクト (参照渡しされる想定だが、現状未使用)。
 */
export function initializeKeyboardInput(appState) { // appState は将来使うかも
    console.log("Initializing keyboard input handler...");
    document.addEventListener('keydown', (event) => {
        // INPUT要素やTEXTAREA要素にフォーカスがある場合は、ショートカットキーを無効にする
        const targetElement = event.target;
        if (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA') {
            // ただし、Escapeキーだけは常に通常モードに戻すために許可する
            if (event.key.toUpperCase() !== 'ESCAPE') {
                 console.log("Input focus detected, skipping keyboard shortcut.");
                 return;
            }
        }

        const shiftPressed = event.shiftKey;
        const ctrlPressed = event.ctrlKey || event.metaKey;
        const altPressed = event.altKey;
        const key = event.key.toUpperCase();
        const currentMode = getCurrentMode();

        // --- アンドゥ/リドゥ (Ctrl+Z, Ctrl+Y) ---
        if (ctrlPressed && !altPressed) {
            if (key === 'Z' && !shiftPressed) {
                console.log("Undo triggered");
                undo();
                event.preventDefault();
                return;
            }
            if (key === 'Y' && !shiftPressed) {
                 console.log("Redo triggered");
                 redo();
                 event.preventDefault();
                 return;
            }
            // (Ctrl+Shift+Z のリドゥはオプション)
        }

        // --- モード切り替え ---
        let targetMode = null;
        if (!ctrlPressed && !altPressed) { // 修飾キーなしの場合のみ（Shiftは個別に見る）
            switch (key) {
                case 'X': if (!shiftPressed) { targetMode = (currentMode === EditMode.DELETE) ? EditMode.NORMAL : EditMode.DELETE; } break;
                case 'E': if (shiftPressed) { targetMode = (currentMode === EditMode.XML_EDIT) ? EditMode.NORMAL : EditMode.XML_EDIT; event.preventDefault(); } break;
                case 'S': if (shiftPressed) { targetMode = (currentMode === EditMode.RANGE_SELECT) ? EditMode.NORMAL : EditMode.RANGE_SELECT; event.preventDefault(); } break;
                case 'C': if (shiftPressed) { targetMode = (currentMode === EditMode.PAINT) ? EditMode.NORMAL : EditMode.PAINT; event.preventDefault(); } break;
                case 'ESCAPE': targetMode = EditMode.NORMAL; break; // Escapeは常に通常モードへ
            }
        }
        // モード変更実行とUI更新
        if (targetMode !== null && targetMode !== currentMode) {
            setEditMode(targetMode);
            updateModeIndicator(targetMode);
            if (targetMode === EditMode.XML_EDIT) {
                showXmlEditPanel(); // パネル表示
            } else {
                hideXmlEditPanel(); // パネル非表示
            }
            return; // モード切り替えたら他の処理はしない
        }

        // --- 回転/反転 (通常モード or XML編集モード) ---
        if (['J', 'K', 'L', 'U', 'I', 'O'].includes(key)) {
            if (!ctrlPressed && !altPressed && !shiftPressed) { // 修飾キーなし
                const opFunc = ['J', 'K', 'L'].includes(key) ? applyRotation : applyFlip;
                const opType = ['J', 'K', 'L'].includes(key) ? 'rotated' : 'flipped';

                if (currentMode === EditMode.NORMAL) {
                    // プレビューブロック操作
                    const currentOrientation = getPreviewOrientation();
                    opFunc(currentOrientation, key);
                    setPreviewOrientation(currentOrientation);
                    updatePreviewMeshOrientation(currentOrientation);
                    console.log(`Preview ${opType}: ${key}`);
                    event.preventDefault();
                } else if (currentMode === EditMode.XML_EDIT) {
                    // 選択ブロック操作
                    const selected = getSelectedBlocks();
                    if (selected.length > 0) {
                        const transformations = [];
                        selected.forEach(blockData => {
                            const oldMatrix = blockData.rotationMatrix.clone();
                            opFunc(blockData.rotationMatrix, key);
                            if(blockData.mesh) { // メッシュ更新
                                blockData.mesh.matrix.copy(blockData.rotationMatrix);
                                blockData.mesh.matrix.setPosition(blockData.position);
                                blockData.mesh.matrixWorldNeedsUpdate = true;
                            }
                            transformations.push({ blockId: blockData.id, oldMatrix: oldMatrix, newMatrix: blockData.rotationMatrix.clone() });
                        });
                        addAction({ type: 'TRANSFORM_BLOCKS', transformations: transformations });
                        console.log(`${selected.length} blocks ${opType}: ${key}`);
                        event.preventDefault();
                    }
                }
            }
        }
    });
     console.log("Keyboard input handler initialized.");
}