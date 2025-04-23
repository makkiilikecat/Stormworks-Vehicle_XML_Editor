/**
 * @fileoverview ファイル読み込みボタン (<input type="file"> の変更) および
 * 保存ボタンのクリックイベントに対応するハンドラ関数を提供します。
 * ファイルの読み込み、解析、ブロックデータの更新、XML生成、ダウンロードの
 * 実際の処理は io/fileHandler.js モジュールに依存します。
 * 処理結果のユーザーへの通知は ui/popupUtils.js を使用します。
 *
 * 依存関係:
 * - io/fileHandler.js: loadFileAsText, parseVehicleXml, generateVehicleXml, downloadXmlFile
 * - state/historyManager.js: setupHistoryManager (読み込み時に履歴リセット)
 * - rendering/blockRenderer.js: clearBlocks, renderBlocks (シーン更新)
 * - ui/popupUtils.js: showPopup (ユーザー通知)
 * - ui/infoDisplayHandler.js: updateInfoDisplay (情報表示更新)
 * - data/blockDefinitions.js: getAllBlockDefinitions (情報表示更新用)
 */

// --- 必要なモジュールをインポート ---
import { loadFileAsText } from '../io/fileLoader.js';
import { parseVehicleXml } from '../io/xmlParser.js';
import { generateVehicleXml } from '../io/xmlGenerator.js';
import { downloadXmlFile } from '../io/fileDownloader.js';
import { setupHistoryManager } from '../state/historyManager.js';
import { clearBlocks, renderBlocks } from '../rendering/blockRenderer.js';
import { showPopup } from '../ui/popupUtils.js';
import { updateInfoDisplay } from '../ui/infoDisplayHandler.js';
// import { getAllBlockDefinitions } from '../data/blockDefinitions.js'; // updateInfoDisplay が内部でインポートする想定

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
    // アプリケーション状態から必要な情報を取得
    const { selectedFile, scene, loadedBlocks } = appState;

    // ファイルが選択されているか確認
    if (!selectedFile) {
        const msg = '読み込みエラー: ファイルが選択されていません。';
        console.warn(`[FileHandler] ${msg}`);
        showPopup(msg, 'warning'); // 警告ポップアップを表示
        return; // 処理中断
    }

    // 処理開始をログに出力 (ポップアップは任意)
    console.log(`[FileHandler] ファイル読み込み処理開始: ${selectedFile.name}`);
    // showPopup(`読み込み中: ${selectedFile.name}`, 'info', 2000);

    try {
        // --- ファイル読み込みと解析 ---
        // io/fileHandler を使ってファイル内容をテキストとして読み込み
        const xmlString = await loadFileAsText(selectedFile);
        // io/fileHandler を使ってXML文字列を BlockData 配列に解析
        const parsedBlocks = parseVehicleXml(xmlString);

        // --- 成功時の処理 ---
        console.log("[FileHandler] XML解析成功。既存データをクリアして更新します。");

        // 1. 既存のブロックとメッシュをクリア
        clearBlocks(scene); // レンダラーにシーンからのメッシュ削除を依頼

        // 2. アプリケーション状態のブロックリストを更新
        //    元の配列の参照を維持したまま内容を入れ替える
        loadedBlocks.length = 0;
        loadedBlocks.push(...parsedBlocks);

        // 3. 履歴マネージャーをリセット
        setupHistoryManager(scene, loadedBlocks);

        // 4. 新しいブロックデータでシーンを再描画
        renderBlocks(scene, loadedBlocks);

        // 5. 情報表示エリアを更新 (ブロック数、質量、コスト、サイズなど)
        updateInfoDisplay(loadedBlocks); // infoDisplayHandler が定義を取得して計算

        // 6. ブロック構成が変更されたことを通知 (他のUI要素が反応できるように)
        document.dispatchEvent(new CustomEvent('blocksChanged'));

        // 7. 成功メッセージをポップアップで表示
        const msg = `読み込み完了: ${parsedBlocks.length} ブロック (${selectedFile.name})`;
        console.log(`[FileHandler] ${msg}`);
        showPopup(msg, 'success');

    } catch (error) {
        // --- 失敗時の処理 ---
        // 読み込みや解析中にエラーが発生した場合
        const errorMsg = `ファイル読み込み/解析エラー: ${error.message}`;
        console.error(`[FileHandler] ${errorMsg}`, error);
        // エラーメッセージをポップアップで表示 (少し長めに)
        showPopup(errorMsg, 'error', 5000);
        // 重要な点: 失敗時には既存の loadedBlocks やシーンは変更しない
    }
}

/**
 * 保存ボタンクリック時に呼び出され、現在のブロックデータからXMLファイルを生成し、
 * ダウンロードさせます。結果はポップアップで通知します。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 * { loadedBlocks: BlockData[], selectedFile?: File } を含む。
 */
export function handleSaveButtonClick(appState) {
    // アプリケーション状態から必要な情報を取得
    const { loadedBlocks, selectedFile } = appState;

    // 保存対象のブロックが存在するか確認
    if (!loadedBlocks || loadedBlocks.length === 0) {
        const msg = '保存するブロックがありません。';
        console.warn(`[FileHandler] ${msg}`);
        showPopup(msg, 'warning'); // 警告ポップアップ
        return; // 処理中断
    }

    // 処理開始をログに出力 (ポップアップは任意)
    console.log("[FileHandler] XML生成中...");
    // showPopup('XML生成中...', 'info', 1500);

    try {
        // --- XML生成とダウンロード ---
        // io/fileHandler を使って BlockData 配列からXML文字列を生成
        const xmlString = generateVehicleXml(loadedBlocks);
        // ファイル名を決定 (元のファイル名があればそれを加工、なければデフォルト名)
        const filename = selectedFile
                       ? selectedFile.name.replace(/\.xml$/i, '_edited.xml') // 拡張子を置換
                       : 'vehicle_edited.xml'; // デフォルトファイル名
        // io/fileHandler を使ってファイルをダウンロード
        downloadXmlFile(xmlString, filename);

        // --- 成功時の処理 ---
        const msg = `ファイル保存完了: ${filename}`;
        console.log(`[FileHandler] ${msg}`);
        showPopup(msg, 'success'); // 成功ポップアップ

    } catch (error) {
        // --- 失敗時の処理 ---
        const errorMsg = `XML生成または保存エラー: ${error.message}`;
        console.error(`[FileHandler] ${errorMsg}`, error);
        showPopup(errorMsg, 'error', 5000); // エラーポップアップ
    }
}