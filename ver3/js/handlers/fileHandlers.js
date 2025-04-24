/**
 * @fileoverview ファイル読み込みボタン (<input type="file"> の変更) および
 * 保存ボタンのクリックイベントに対応するハンドラ関数を提供します。
 * ファイルの読み込み、解析、XML生成、ダウンロードの実際の処理は
 * io/ ディレクトリ内の分割されたモジュールに依存します。
 * 処理結果のユーザーへの通知は ui/popupUtils.js を使用します。
 * 【主な変更点】
 * - インポート元を分割後のファイルに変更 (fileLoader, xmlParser, xmlGenerator, fileDownloader)
 *
 * 依存関係:
 * - io/fileLoader.js: loadFileAsText
 * - io/xmlParser.js: parseVehicleXml
 * - io/xmlGenerator.js: generateVehicleXml
 * - io/fileDownloader.js: downloadXmlFile
 * - state/historyManager.js: setupHistoryManager (読み込み時に履歴リセット)
 * - rendering/blockRenderer.js: clearBlocks, renderBlocks (シーン更新)
 * - ui/popupUtils.js: showPopup (ユーザー通知)
 * - ui/infoDisplayHandler.js: updateInfoDisplay (情報表示更新)
 * - data/blockDefinitions.js: (直接は使用せず、infoDisplayHandler経由)
 */

// --- ★修正: 必要なモジュールを分割後のファイルからインポート ---
import { loadFileAsText } from '../io/fileLoader.js';
import { parseVehicleXml } from '../io/xmlParser.js';
import { generateVehicleXml } from '../io/xmlGenerator.js';
import { downloadXmlFile } from '../io/fileDownloader.js';
import { setupHistoryManager } from '../state/historyManager.js';
import { clearBlocks, renderBlocks } from '../rendering/blockRenderer.js';
import { showPopup } from '../ui/popupUtils.js';
import { updateInfoDisplay } from '../ui/infoDisplayHandler.js';

/**
 * ファイル選択後に呼び出され、XMLファイルの読み込みと解析、
 * アプリケーション状態の更新を行います。
 * 読み込みに成功した場合のみ、既存のブロックデータと履歴がクリアされ、
 * 新しいデータでシーンが再描画されます。失敗した場合はエラーをポップアップで表示します。
 *
 * @param {object} appState - アプリケーションの状態オブジェクト。
 * { selectedFile: File, scene: THREE.Scene, loadedBlocks: BlockData[] } を含む。
 */
export async function handleLoadButtonClick(appState) {
    const { selectedFile, scene, loadedBlocks } = appState;

    if (!selectedFile) {
        const msg = '読み込みエラー: ファイルが選択されていません。';
        console.warn(`[FileHandler] ${msg}`);
        showPopup(msg, 'warning');
        return;
    }

    console.log(`[FileHandler] ファイル読み込み処理開始: ${selectedFile.name}`);

    try {
        // --- ファイル読み込みと解析 ---
        const xmlString = await loadFileAsText(selectedFile); // from fileLoader.js
        const parsedBlocks = parseVehicleXml(xmlString);      // from xmlParser.js

        // --- 成功時の処理 ---
        console.log("[FileHandler] XML解析成功。既存データをクリアして更新します。");

        // 1. 既存のブロックとメッシュをクリア
        clearBlocks(scene);

        // 2. アプリケーション状態のブロックリストを更新
        loadedBlocks.length = 0;
        loadedBlocks.push(...parsedBlocks);

        // 3. 履歴マネージャーをリセット
        setupHistoryManager(scene, loadedBlocks);

        // 4. 新しいブロックデータでシーンを再描画
        renderBlocks(scene, loadedBlocks);

        // 5. 情報表示エリアを更新
        updateInfoDisplay(loadedBlocks);

        // 6. ブロック構成が変更されたことを通知
        document.dispatchEvent(new CustomEvent('blocksChanged'));

        // 7. 成功メッセージをポップアップで表示
        const msg = `読み込み完了: ${parsedBlocks.length} ブロック (${selectedFile.name})`;
        console.log(`[FileHandler] ${msg}`);
        showPopup(msg, 'success');

    } catch (error) {
        // --- 失敗時の処理 ---
        const errorMsg = `ファイル読み込み/解析エラー: ${error.message}`;
        console.error(`[FileHandler] ${errorMsg}`, error);
        showPopup(errorMsg, 'error', 5000);
    }
}

/**
 * 保存ボタンクリック時に呼び出され、現在のブロックデータからXMLファイルを生成し、
 * ダウンロードさせます。結果はポップアップで通知します。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 * { loadedBlocks: BlockData[], selectedFile?: File } を含む。
 */
export function handleSaveButtonClick(appState) {
    const { loadedBlocks, selectedFile } = appState;

    if (!loadedBlocks || loadedBlocks.length === 0) {
        const msg = '保存するブロックがありません。';
        console.warn(`[FileHandler] ${msg}`);
        showPopup(msg, 'warning');
        return;
    }

    console.log("[FileHandler] XML生成中...");

    try {
        // --- XML生成とダウンロード ---
        const xmlString = generateVehicleXml(loadedBlocks); // from xmlGenerator.js
        const filename = selectedFile
                       ? selectedFile.name.replace(/\.xml$/i, '_edited.xml')
                       : 'vehicle_edited.xml';
        downloadXmlFile(xmlString, filename);               // from fileDownloader.js

        // --- 成功時の処理 ---
        const msg = `ファイル保存完了: ${filename}`;
        console.log(`[FileHandler] ${msg}`);
        showPopup(msg, 'success');

    } catch (error) {
        // --- 失敗時の処理 ---
        const errorMsg = `XML生成または保存エラー: ${error.message}`;
        console.error(`[FileHandler] ${errorMsg}`, error);
        showPopup(errorMsg, 'error', 5000);
    }
}