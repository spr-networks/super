// Platform-split wrapper for react-qr-code. Import this ('components/QRCode')
// instead of 'react-qr-code' directly: the package's React Native build is
// declared only in its package.json `exports` map, which this project's Metro
// (RN 0.72 / Metro 0.76) does not read — so a bare 'react-qr-code' import on
// iOS/Android bundles the web build, whose lowercase <svg>/<path> host
// components crash React Native ("View config getter callback for component
// `path` must be a function"). Web builds (webpack) resolve this file;
// native resolves QRCode.native.js.
export { default } from 'react-qr-code'
