import { getCurrentMode, setEditMode, EditMode } from '../state/editMode.js';
import { updateModeIndicator } from '../ui/modeIndicator.js';
// --- Stage 2.4/3.1 関連インポート ---
import { getPreviewOrientation, setPreviewOrientation } from '../state/placementState.js';
import { applyRotation, applyFlip } from '../interactions/rotationHandler.js';
import { updatePreviewOrientation as updatePreviewMeshOrientation } from '../rendering/previewBlock.js';
import { getSelectedBlocks } from '../interactions/selectionHandler.js';
import { addAction, undo, redo } from '../state/historyManager.js';
// ---------------------------------

/**
 * キーボードショートカットのイベントリスナーを設定します。
 * モード切り替え、プレビュー/選択ブロックの回転・反転などを処理します。
 * アンドゥ/リドゥのトリガーは main.js に移動しました。
 */
export function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // テキスト入力中などはショートカットを基本的に無視
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            // ただし、Escapeキーによるモード解除は許可しても良いかもしれない
             if (event.key === 'Escape') {
                 setEditMode(EditMode.NORMAL);
                 updateModeIndicator(getCurrentMode());
             }
            return;
        }

        // --- 修飾キーの状態を取得 ---
        const shiftPressed = event.shiftKey;
        const ctrlPressed = event.ctrlKey || event.metaKey; // Ctrl または Command(Mac)
        const altPressed = event.altKey;

        // --- 処理対象のキーか判定 ---
        const key = event.key.toUpperCase();
        let targetMode = null;
        const currentMode = getCurrentMode(); // 現在のモードを取得

        // --- モード切り替え判定 ---
        switch (key) {
            case 'X':
                // Xキー単独の場合のみ
                if (!shiftPressed && !ctrlPressed && !altPressed) {
                    targetMode = (currentMode === EditMode.DELETE) ? EditMode.NORMAL : EditMode.DELETE;
                }
                break;
            case 'E':
                // Shift+E の場合のみ
                if (shiftPressed && !ctrlPressed && !altPressed) {
                    targetMode = (currentMode === EditMode.XML_EDIT) ? EditMode.NORMAL : EditMode.XML_EDIT;
                    event.preventDefault(); // ブラウザのデフォルト動作抑制
                }
                break;
            case 'S':
                 // Shift+S の場合のみ
                if (shiftPressed && !ctrlPressed && !altPressed) {
                    targetMode = (currentMode === EditMode.RANGE_SELECT) ? EditMode.NORMAL : EditMode.RANGE_SELECT;
                    event.preventDefault();
                }
                break;
            case 'C':
                 // Shift+C の場合のみ
                if (shiftPressed && !ctrlPressed && !altPressed) {
                    targetMode = (currentMode === EditMode.PAINT) ? EditMode.NORMAL : EditMode.PAINT;
                    event.preventDefault();
                }
                break;
            case 'ESCAPE':
                // Escapeキーは常に通常モードに戻る
                 targetMode = EditMode.NORMAL;
                 break;
             default:
                 // モード切り替え以外のキーはここでは何もしない
                 break;
        }

        // モード変更実行とUI更新
        if (targetMode !== null && targetMode !== currentMode) {
            setEditMode(targetMode);
            updateModeIndicator(getCurrentMode());
            return; // モードを切り替えたら、以降の処理（回転など）は行わない
        }

        // --- 回転/反転キー処理 (モードに応じて対象が変わる) ---
        if (['J', 'K', 'L', 'U', 'I', 'O'].includes(key)) {
            // 他の修飾キー(Ctrl, Alt, Shift)が押されていない場合のみ反応
            if (!ctrlPressed && !altPressed && !shiftPressed) {
                const opFunc = ['J', 'K', 'L'].includes(key) ? applyRotation : applyFlip;
                const opType = ['J', 'K', 'L'].includes(key) ? 'rotated' : 'flipped';

                if (currentMode === EditMode.NORMAL) {
                    // --- 通常モード: プレビューブロックの向きを変更 ---
                    const currentOrientation = getPreviewOrientation();
                    opFunc(currentOrientation, key); // ハンドラで状態を直接変更
                    setPreviewOrientation(currentOrientation); // 変更を状態に反映
                    updatePreviewMeshOrientation(currentOrientation); // プレビューメッシュ更新
                    console.log(`Preview ${opType}: ${key}`);
                    event.preventDefault();

                } else if (currentMode === EditMode.XML_EDIT) {
                    // --- XML編集モード: 選択ブロックを操作 ---
                    const selected = getSelectedBlocks();
                    if (selected.length > 0) {
                        const transformations = []; // 履歴用

                        selected.forEach(blockData => {
                            const oldMatrix = blockData.rotationMatrix.clone(); // 変更前の行列を保存
                            opFunc(blockData.rotationMatrix, key); // 行列を直接変更
                            // メッシュの行列も更新
                            if (blockData.mesh) {
                                blockData.mesh.matrix.copy(blockData.rotationMatrix);
                                blockData.mesh.matrix.setPosition(blockData.position);
                                blockData.mesh.matrixWorldNeedsUpdate = true; // ワールド行列更新フラグ
                            }
                            transformations.push({
                                blockId: blockData.id,
                                oldMatrix: oldMatrix,
                                newMatrix: blockData.rotationMatrix.clone() // 変更後の行列を保存
                            });
                        });

                        // アンドゥ履歴に登録
                        addAction({
                            type: 'TRANSFORM_BLOCKS',
                            transformations: transformations
                        });
                        console.log(`${selected.length} blocks ${opType}: ${key}`);
                        event.preventDefault();
                    }
                }
                 // TODO: 範囲選択モードでの処理
            }
        }

        // アンドゥ/リドゥ (Ctrl+Z, Ctrl+Y) の処理は main.js の setupKeyboardInput に移動
    });
}