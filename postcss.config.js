// postcss.config.js
module.exports = {
    plugins: [
      require('autoprefixer'),
      // 必要に応じて他の PostCSS プラグインを追加
      // 例: CSS圧縮 (CssMinimizerPluginを使う場合は不要なことが多い)
      // isProduction ? require('cssnano') : null,
    ].filter(Boolean),
  };