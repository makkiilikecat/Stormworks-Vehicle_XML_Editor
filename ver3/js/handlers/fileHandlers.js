/**
 * @fileoverview ファイル読み込みおよび保存ボタンのクリックイベントハンドラ。
 */

import { loadFileAsText, parseVehicleXml, generateVehicleXml, downloadXmlFile } from '../io/fileHandler.js';
import { setupHistoryManager } from '../state/historyManager.js';
import { clearBlocks, renderBlocks } from '../rendering/blockRenderer.js';

/**
 * 読み込みボタンクリック時の処理。
 * @param {object} appState - アプリケーションの状態オブジェクト (scene, loadedBlocks などを含む)。
 */
export async function handleLoadButtonClick(appState) {
    const { selectedFile, scene } = appState;
    const fileStatus = document.getElementById('file-status');

    if (!selectedFile) {
        alert('先にXMLファイルを選択してください。');
        if(fileStatus) {
            fileStatus.textContent = 'ファイルが選択されていません';
            fileStatus.style.color = 'orange';
        }
        return;
    }

    if(fileStatus) {
        fileStatus.textContent = '読み込み中...';
        fileStatus.style.color = '#eee';
    }

    try {
        const xmlString = await loadFileAsText(selectedFile);
        const parsedBlocks = parseVehicleXml(xmlString);

        // 既存ブロッククリア & データリセット
        clearBlocks(scene); // シーンからメッシュを削除
        appState.loadedBlocks = parsedBlocks; // main.jsの配列を直接更新

        // 履歴マネージャーも新しいデータで初期化
        setupHistoryManager(scene, appState.loadedBlocks);

        // 新しいブロックを描画
        renderBlocks(scene, appState.loadedBlocks);

        if(fileStatus) {
            fileStatus.textContent = `読み込み完了: ${appState.loadedBlocks.length} ブロック`;
            fileStatus.style.color = 'lightgreen';
        }

    } catch (error) {
        console.error('ファイル読み込みまたは解析エラー:', error);
         if(fileStatus) {
            fileStatus.textContent = `エラー: ${error.message}`;
            fileStatus.style.color = 'tomato';
         }
        // エラー時はクリア
        clearBlocks(scene);
        appState.loadedBlocks = [];
        setupHistoryManager(scene, appState.loadedBlocks); // 空の履歴で初期化
    }
}

/**
 * 保存ボタンクリック時の処理。
 * @param {object} appState - アプリケーションの状態オブジェクト。
 */
export function handleSaveButtonClick(appState) {
    const { loadedBlocks, selectedFile } = appState;
    const fileStatus = document.getElementById('file-status');

    if (loadedBlocks.length === 0) {
        alert('保存するブロックがありません。');
         if(fileStatus) {
            fileStatus.textContent = '保存対象がありません';
            fileStatus.style.color = 'orange';
         }
        return;
    }

     if(fileStatus) {
        fileStatus.textContent = 'XML生成中...';
        fileStatus.style.color = '#eee';
     }

    try {
        const xmlString = generateVehicleXml(loadedBlocks);
        const filename = selectedFile ? selectedFile.name.replace('.xml', '_edited.xml') : 'vehicle_edited.xml';
        downloadXmlFile(xmlString, filename);
         if(fileStatus) {
            fileStatus.textContent = `ファイル保存完了: ${filename}`;
            fileStatus.style.color = 'lightblue';
         }
    } catch (error) {
        console.error('XML生成または保存エラー:', error);
         if(fileStatus) {
            fileStatus.textContent = `保存エラー: ${error.message}`;
            fileStatus.style.color = 'tomato';
         }
    }
}