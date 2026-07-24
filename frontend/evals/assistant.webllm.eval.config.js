const os = require('os')
const path = require('path')
const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')

const frontendRoot = path.resolve(__dirname, '..')
const outputPath =
  process.env.SPR_ASSISTANT_EVAL_BUILD_DIR ||
  path.join(os.tmpdir(), 'spr-assistant-webllm-eval-build')

module.exports = {
  mode: 'production',
  devtool: false,
  entry: path.join(
    frontendRoot,
    'src/evals/assistantWebLLMEvaluationPage.js'
  ),
  output: {
    path: outputPath,
    filename: 'assistant-eval.js',
    clean: true
  },
  resolve: {
    modules: [path.join(frontendRoot, 'src'), 'node_modules'],
    extensions: ['.web.js', '.js', '.jsx', '.json'],
    alias: {
      react: path.join(frontendRoot, 'node_modules/react'),
      'react-native$': 'react-native-web'
    }
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader'
        }
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      templateContent: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Qwen SPR Assistant Evaluation</title>
    <style>
      body { font: 15px/1.45 system-ui, sans-serif; margin: 32px auto; max-width: 960px; padding: 0 20px; color: #172033; }
      pre { background: #f4f6f8; border-radius: 8px; overflow: auto; padding: 16px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border-bottom: 1px solid #d9dee7; padding: 8px; text-align: left; vertical-align: top; }
      .pass { color: #08783e; } .fail { color: #b42318; } .skip { color: #667085; }
    </style>
  </head>
  <body>
    <h1>Qwen SPR Assistant Evaluation</h1>
    <p id="status">Starting…</p>
    <div id="results"></div>
  </body>
</html>`
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env.REACT_APP_API': JSON.stringify('mock'),
      __DEV__: false
    })
  ]
}
