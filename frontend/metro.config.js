/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */

const path = require('path');
/*const extraNodeModules = {
  'src': path.resolve(__dirname + '/src'),
};*/
const watchFolders = [
  path.resolve(__dirname + '/src')
]

const projectRoot = __dirname + '/src'

module.exports = {
	//projectRoot,
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    //extraNodeModules
	 	nodeModulesPaths: [path.join(__dirname, 'src'), path.join(__dirname, '../node_modules')],
/*
  resolve: {
    modules: [path.join(__dirname, 'src'), 'node_modules'],
    alias: {
      react: path.join(__dirname, 'node_modules', 'react')
    }

*/
  },
	//watchFolders,
};
