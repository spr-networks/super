## Intro

The UI is built with [React Native](https://reactnative.dev/) and [Native Base](https://docs.nativebase.io/). 

**Build status**

dev: ![action workflow](https://github.com/spr-networks/super/actions/workflows/test-ui.yml/badge.svg?branch=dev)

main: ![action workflow](https://github.com/spr-networks/super/actions/workflows/test-ui.yml/badge.svg?branch=dev)

## Running

To test locally, you can point it to your SPR instance with the `REACT_APP_API` variable.

Example:
```bash
REACT_APP_API=http://192.168.2.1 yarn start
```

If you want to use the MockAPI (with only a frontend and no SPR system running):
```bash
REACT_APP_API=mock yarn start
```
