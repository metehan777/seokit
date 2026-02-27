const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';
  const suffix = isProd ? '.min.js' : '.js';

  const terser = new TerserPlugin({
    terserOptions: {
      compress: { drop_console: isProd, passes: 2 },
      mangle: true,
      output: { comments: false },
    },
    extractComments: false,
  });

  const common = {
    mode: isProd ? 'production' : 'development',
    devtool: isProd ? false : 'source-map',
    resolve: { extensions: ['.js'] },
    optimization: {
      minimize: isProd,
      minimizer: [terser],
    },
  };

  // 1. Loader — the tiny <script> tag (~3KB minified)
  const loader = {
    ...common,
    name: 'loader',
    entry: './src/loader.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'seokit-loader' + suffix,
    },
    performance: {
      hints: isProd ? 'warning' : false,
      maxAssetSize: 30 * 1024,
      maxEntrypointSize: 30 * 1024,
    },
  };

  // 2. Worker — runs in Web Worker thread (contains wink-nlp + model + analyzer)
  const worker = {
    ...common,
    name: 'worker',
    entry: './src/worker.js',
    target: 'webworker',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'seokit-worker' + suffix,
    },
    performance: {
      hints: false,
    },
  };

  // 3. Engine — fallback for main-thread loading (no Worker support)
  const engine = {
    ...common,
    name: 'engine',
    entry: './src/engine.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'seokit-engine' + suffix,
      library: { name: '__SEOKitEngine', type: 'window' },
    },
    performance: {
      hints: false,
    },
  };

  // 4. All-in-one bundle (original monolith, kept for simple use cases)
  const monolith = {
    ...common,
    name: 'monolith',
    entry: './src/index.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'seokit' + suffix,
      library: { name: 'SEOKit', type: 'umd', export: 'default' },
      globalObject: 'typeof self !== "undefined" ? self : this',
    },
    performance: {
      hints: false,
    },
  };

  return [loader, worker, engine, monolith];
};
