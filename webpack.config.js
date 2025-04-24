// Node.js の標準モジュール。ファイルパスの操作に使用します。
const path = require('path');

// --- Webpack プラグイン ---
// HTMLファイルを生成し、バンドルされたJS/CSSを自動的に挿入します。
const HtmlWebpackPlugin = require('html-webpack-plugin');
// CSSをJSバンドルから別ファイルとして抽出します (本番環境用)。
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
// CSSファイルを圧縮します。
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
// JavaScriptファイルを圧縮します。
const TerserPlugin = require('terser-webpack-plugin');
// バンドル内容を視覚的に分析するツール (オプション)。
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

/**
 * Webpack 設定をエクスポートします。
 * 関数形式でエクスポートすることで、実行時の引数 (env, argv) を受け取れます。
 * @param {object} env - 環境変数 (webpackコマンド実行時に --env オプションで渡される)。今回は未使用。
 * @param {object} argv - Webpack実行時の引数。argv.mode で実行モード ('production' or 'development') を取得できます。
 * @returns {object} Webpack 設定オブジェクト。
 */
module.exports = (env, argv) => {
  /**
   * 現在のビルドモードが 'production' かどうかを判定します。
   * コマンドライン引数 (--mode) から取得するため、NODE_ENV 環境変数への依存がなくなります。
   * @type {boolean}
   */
  const isProduction = argv.mode === 'production';

  // Webpack 設定オブジェクト本体
  return {
    /**
     * ビルドモードを設定します ('production' または 'development')。
     * これにより、Webpack の組み込み最適化がモードに応じて有効/無効になります。
     */
    mode: isProduction ? 'production' : 'development',

    /**
     * バンドルの起点となるファイル (エントリーポイント) を指定します。
     * Webpack はこのファイルから依存関係をたどってバンドルを作成します。
     */
    entry: './ver3/js/main.js', //

    /**
     * バンドルされたファイルの出力設定。
     */
    output: {
      // 出力先ディレクトリの絶対パスを指定します。
      path: path.resolve(__dirname, 'dist'),
      /**
       * 出力される JavaScript バンドルファイルの命名規則。
       * - 本番環境: `[name]` (チャンク名) と `[contenthash]` (内容ハッシュ) を含め、
       * キャッシュ効率とファイルの一意性を確保します。
       * - 開発環境: チャンク名を含むシンプルなファイル名にします。
       */
      filename: isProduction ? 'js/[name].[contenthash].bundle.js' : 'js/[name].bundle.js',
      /**
       * コード分割 (非同期インポートなど) によって生成されるチャンクファイルの命名規則。
       */
      chunkFilename: isProduction ? 'js/[name].[contenthash].chunk.js' : 'js/[name].chunk.js',
      /**
       * 画像やフォントなどのアセットファイルの出力先ディレクトリと命名規則。
       * `[hash]` を含めることでキャッシュバスティングに対応します。
       */
      assetModuleFilename: 'assets/[hash][ext][query]',
      /**
       * ビルド前に出力先ディレクトリ (`dist`) をクリーンアップ (削除) するかどうか。
       */
      clean: true,
    },

    /**
     * webpack-dev-server (開発用ローカルサーバー) の設定。
     */
    devServer: {
      // 静的ファイルを提供するディレクトリ (ビルド成果物がある場所)。
      static: './dist',
      // サーバー起動時にブラウザを自動的に開くか。
      open: true,
      // ホットモジュールリプレイスメント (HMR) を有効にするか。
      // (コード変更時にページ全体をリロードせず、変更部分のみを更新)
      hot: true,
      // 開発サーバーがリッスンするポート番号。
      port: 8080,
    },

    /**
     * モジュール (JS, CSS, 画像など) の処理方法を設定するルール (ローダー) の定義。
     */
    module: {
      rules: [
        // --- JavaScript ファイル (.js) の処理ルール ---
        {
          test: /\.js$/, // .js で終わるファイルにマッチ
          exclude: /node_modules/, // node_modules ディレクトリは処理対象外 (ビルド高速化)
          use: {
            // babel-loader を使って ES6+ のコードをトランスパイル (古いブラウザ対応)
            loader: 'babel-loader',
            options: {
              // @babel/preset-env を使用し、ターゲットブラウザに合わせて構文変換
              presets: ['@babel/preset-env']
            }
          }
        },
        // --- CSS ファイル (.css) の処理ルール ---
        {
          test: /\.css$/i, // .css で終わるファイルにマッチ (大文字小文字区別なし)
          // 使用するローダーの配列 (右から左へ適用される: postcss -> css -> style/MiniCssExtract)
          use: [
            // 本番環境では CSS を別ファイルに抽出し、開発環境では style タグで注入
            isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
            // CSS の @import や url() を解釈するローダー
            'css-loader',
            // PostCSS を使って、ベンダープレフィックス自動付与などを行うローダー
            'postcss-loader',
          ],
        },
        // --- 画像ファイルの処理ルール ---
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i, // 各種画像ファイル形式にマッチ
          type: 'asset/resource', // ファイルとして出力する (Webpack 5 の Asset Modules 機能)
          generator: {
            // 出力ファイル名を指定 (output.assetModuleFilename を上書き)
            filename: 'assets/images/[hash][ext][query]'
          }
        },
        // --- フォントファイルの処理ルール ---
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/i, // 各種フォントファイル形式にマッチ
          type: 'asset/resource', // ファイルとして出力する
          generator: {
            // 出力ファイル名を指定
            filename: 'assets/fonts/[hash][ext][query]'
          }
        },
      ],
    },

    /**
     * Webpack の機能を拡張するためのプラグイン設定。
     */
    plugins: [
      // HTML ファイルを自動生成するプラグイン
      new HtmlWebpackPlugin({
        template: './ver3/index.html', // 元となる HTML ファイルのパス
        filename: 'index.html',       // 出力される HTML ファイル名
        // inject: 'body' // バンドルされた JS を body タグの最後に挿入 (デフォルト)
      }),

      // 本番環境でのみ CSS 抽出プラグインを有効化
      isProduction && new MiniCssExtractPlugin({
        filename: 'css/style.[contenthash].css', // 出力される CSS ファイル名 (キャッシュ対策)
      }),

      // (オプション) 本番環境でのみバンドル分析ツールを有効化
      isProduction && new BundleAnalyzerPlugin({
        analyzerMode: 'static', // 'server' or 'static' or 'json' or 'disabled'
        openAnalyzer: false,    // 自動でブラウザを開かない
        // レポートファイルの出力先
        reportFilename: path.resolve(__dirname, 'dist/report/bundle-report.html'),
      })
    ].filter(Boolean), // 配列から false (isProduction が false の場合のプラグイン) を除去

    /**
     * バンドルファイルの最適化に関する設定。
     */
    optimization: {
      // 本番環境でのみ最小化 (minify) を有効にする
      minimize: isProduction,
      // 最小化に使用するプラグイン (minimizer) の設定
      minimizer: [
        // JavaScript 圧縮用プラグイン (Terser)
        new TerserPlugin({
          terserOptions: {
            compress: {
              // 本番環境では console.log 等の呼び出しを削除
              drop_console: isProduction,
            },
            format: {
              // 本番環境ではコメントを削除、開発環境では残す
              comments: !isProduction,
            },
          },
          // ライセンスコメントなどを別ファイルに抽出しない
          extractComments: false,
        }),
        // CSS 圧縮用プラグイン
        new CssMinimizerPlugin(),
      ],
      /**
       * コード分割 (Code Splitting) の設定。
       * 'all' を指定すると、初期ロードと非同期ロードの両方で
       * 共通モジュールや node_modules の分割を試みます。
       */
      splitChunks: {
        chunks: 'all',
        // キャッシュグループ: 特定の条件に合うモジュールをまとめるルール
        cacheGroups: {
          // node_modules 内のライブラリを 'vendors' という名前のチャンクにまとめる
          vendor: {
            test: /[\\/]node_modules[\\/]/, // node_modules ディレクトリ内のモジュールにマッチ
            name: 'vendors',                // 出力されるチャンク名 (例: vendors.bundle.js)
            chunks: 'all',                  // 対象とするチャンクの種類 ('initial', 'async', 'all')
            priority: -10,                  // チャンク生成の優先度 (数値が大きいほど優先)
            reuseExistingChunk: true,       // 既に分割されたチャンクを再利用するか
          },
        },
      },
      /**
       * モジュール連結 (Scope Hoisting) を有効にするか。
       * true にすると、複数のモジュールを一つのクロージャにまとめることで、
       * バンドルサイズを削減し、実行時パフォーマンスを向上させる可能性があります。
       */
      concatenateModules: true,
      /**
       * (オプション) ランタイムチャンクを分割するか。
       * 'single' を指定すると、全チャンク共通のランタイムコードが別ファイルになります。
       * キャッシュ効率が向上する場合があります。
       */
      // runtimeChunk: 'single',
    },

    /**
     * モジュール名の解決 (import/require 時の挙動) に関する設定。
     */
    resolve: {
      // import 文でファイル拡張子を省略できるようにする
      extensions: ['.js'], // 例: import utils from './utils' で './utils.js' を探す
    },

    /**
     * ビルドキャッシュの設定 (Webpack 5 の機能)。
     * ビルド速度を向上させるために、ファイルシステムにキャッシュを保存します。
     */
    cache: {
      type: 'filesystem', // キャッシュタイプ: 'memory' または 'filesystem'
      buildDependencies: {
        // キャッシュを無効化するトリガーとなるファイル依存関係
        // この設定ファイル自体が変更されたらキャッシュを無効化
        config: [__filename],
        // postcss.config.js や .babelrc など、ビルドに影響する他の設定ファイルも追加推奨
        // postcssConfig: [path.resolve(__dirname, 'postcss.config.js')],
      },
      // キャッシュファイルを保存するディレクトリ
      cacheDirectory: path.resolve(__dirname, '.temp_cache'),
    },

    /**
     * ソースマップの生成方法を設定します。
     * ソースマップは、ビルド後のコードを元のソースコードに対応付けるためのファイルで、デバッグに役立ちます。
     * - 本番環境: 'source-map' (別ファイルとして生成、品質は高いがビルド時間増)
     * (もし本番でソースマップが不要なら `false` に設定)
     * - 開発環境: 'eval-source-map' (高速な再ビルド、高品質なソースマップ)
     */
    devtool: isProduction ? 'source-map' : 'eval-source-map',

    /**
     * パフォーマンスに関する警告の設定。
     */
    performance: {
      // パフォーマンスに関するヒント (警告) を表示するかどうか。
      hints: isProduction ? 'warning' : false, // 本番ビルドでのみ警告を表示
      // 警告を出すエントリーポイント (最初に読み込まれるJS/CSS) の最大サイズ (バイト単位)
      maxEntrypointSize: 512000, // 500 KiB
      // 警告を出す個別のアセット (ファイル) の最大サイズ (バイト単位)
      maxAssetSize: 512000,      // 500 KiB
    },

    /**
     * (オプション) ビルド時の統計情報 (ログ) の出力レベルを設定。
     * 'errors-only', 'minimal', 'normal', 'verbose' など。
     */
    // stats: isProduction ? 'normal' : 'minimal',
  }; // 設定オブジェクトの終わり
}; // module.exports 関数の終わり