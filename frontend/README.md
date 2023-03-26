# SPR UI

The UI is built with [React Native](https://reactnative.dev/) and [Native Base](https://docs.nativebase.io/). 

**Build status**

dev: ![action workflow](https://github.com/spr-networks/super/actions/workflows/test-ui.yml/badge.svg?branch=dev)

main: ![action workflow](https://github.com/spr-networks/super/actions/workflows/test-ui.yml/badge.svg?branch=dev)

## Running

To test locally:
```bash
yarn dev
```

You can point it to your SPR instance with the `REACT_APP_API` variable:
```bash
REACT_APP_API=http://192.168.2.1 yarn start
```

If you want to use the MockAPI (with only a frontend and no SPR system running):
```bash
REACT_APP_API=mock yarn start
```

iOS version:
```bash
yarn ios
# might have to specify iPhone version:
npx react-native run-ios --simulator="iPhone 14"
```

## iOS build

install deps:
```sh
yarn setup:ios
```

open ios/spr.xcworkspace in Xcode && build/run

for testflight we need:

+ production certificate
+ App Store distribution provisioning profile

= same as app store dist
