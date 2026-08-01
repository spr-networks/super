// React Native side of the platform-split react-qr-code wrapper — see
// QRCode.js for why the package's native build must be imported by file path.
// This build renders react-native-svg <Svg>/<Path> and calls TextEncoder,
// polyfilled for Hermes in src/polyfills.js.
export { default } from 'react-qr-code/lib/index.native.js'
