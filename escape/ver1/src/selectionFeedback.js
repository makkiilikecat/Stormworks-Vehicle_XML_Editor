import * as THREE from 'three';

const originalEmissive = {}; // 元のemissive色を保存するオブジェクト
const selectedEmissiveColor = new THREE.Color(0xaaaa00); // 選択時の発光色 (黄色っぽく)

/**
 * ブロックの選択状態に応じて見た目を更新します。
 * @param {Array} placedBlocksData - 配置済みブロックのデータ配列
 * @param {string | null} selectedBlockId - 現在選択中のブロックID
 */
export function updateSelectionFeedback(placedBlocksData, selectedBlockId) {
    placedBlocksData.forEach(data => {
        if (!data.mesh || !data.mesh.material) return;

        const material = data.mesh.material;

        if (data.id === selectedBlockId) {
            // 選択されたブロック
            if (!originalEmissive[data.id]) {
                // 元の色を保存 (初回のみ)
                originalEmissive[data.id] = material.emissive.getHex();
            }
            // emissive色を設定
            material.emissive.copy(selectedEmissiveColor);
        } else {
            // 選択されていないブロック
            if (originalEmissive[data.id] !== undefined) {
                // 元の色に戻す
                material.emissive.setHex(originalEmissive[data.id]);
                // 保存した色情報を削除
                delete originalEmissive[data.id];
            } else {
                 // 元々emissiveが設定されていなければ0にする
                 if(material.emissive.getHex() !== 0x000000) {
                      material.emissive.setHex(0x000000);
                 }
            }
        }
        // マテリアルの更新をThree.jsに伝える (色変更の場合、通常は不要だが念のため)
        material.needsUpdate = true;
    });
}

/**
 * 全てのブロックの選択フィードバックを解除します。
 */
export function clearAllSelectionFeedback(placedBlocksData) {
     placedBlocksData.forEach(data => {
         if (!data.mesh || !data.mesh.material) return;
         const material = data.mesh.material;
         if (originalEmissive[data.id] !== undefined) {
             material.emissive.setHex(originalEmissive[data.id]);
             delete originalEmissive[data.id];
             material.needsUpdate = true;
         } else {
             if(material.emissive.getHex() !== 0x000000) {
                  material.emissive.setHex(0x000000);
                  material.needsUpdate = true;
             }
         }
     });
}