const webpack = require('webpack');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const StatsPlugin = require('stats-webpack-plugin');
const path = require("path");

module.exports = {
  devtool: 'source-map',
  entry: [
    './src/index.js'
  ],
  output: {
    path:     path.join(__dirname, '../static/dist'),
    filename: 'client.min.js',
    publicPath: '/'
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env':{
        'NODE_ENV': JSON.stringify('production')
      }
    }),
    new webpack.optimize.OccurenceOrderPlugin(),
    new ExtractTextPlugin('bundle.css'),
    new webpack.optimize.UglifyJsPlugin({
      compressor: {
        warnings: true,
        screw_ie8: true
      }
    }),
    new StatsPlugin('webpack.stats.json', {
      source: false,
      modules: false
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV)
    }),
    new webpack.optimize.DedupePlugin()
  ],
  module:  {
    loaders: [
      {
        test: /\.js[x]?$/,
        exclude: /node_modules/,
        loader: 'babel'
      },
      {
        test: /\.json?$/,
        loader: 'json-loader'
      }
    ]
  },
  resolve: {
    alias: {
      react: path.join(__dirname, "../node_modules/react")
    },
    modulesDirectories: [
      "src",
      "node_modules",
      "web_modules"
    ],
    extensions: ["", ".json", ".js"]
  },
  node:    {
    __dirname: true,
    fs:        'empty'
  }
};
