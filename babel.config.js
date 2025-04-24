// babel.config.js
module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        // 必要に応じて対象ブラウザなどを指定
        // targets: "> 0.25%, not dead"
      }
    ]
  ]
};