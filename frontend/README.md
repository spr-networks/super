## Intro

The UI is built with [Paper Dashboard Pro React](https://www.creative-tim.com/product/paper-dashboard-pro-react) from Creative Tim. It's a template that uses bootstrap 4 and react.

**Build status**

dev: ![action workflow](https://github.com/spr-networks/super/actions/workflows/test-ui.yml/badge.svg?branch=dev)

main: ![action workflow](https://github.com/spr-networks/super/actions/workflows/test-ui.yml/badge.svg?branch=dev)

## Documentation
The documentation for the Material Dashboard Pro is hosted at the Creative Tim Website [website](https://demos.creative-tim.com/paper-dashboard-pro-react/#/documentation/tutorial).

## Running

To test locally, you can point it to your SPR instance with the REACT_APP_API variable.

Example:
```bash
REACT_APP_API=http://192.168.2.1 yarn start
```

If you want to use the MockAPI (with only a frontend and no SPR system running):
```bash
REACT_APP_API=mock yarn start
```

## Licensing

- Copyright 2021 Creative Tim (https://www.creative-tim.com)
- Creative Tim [license](https://www.creative-tim.com/license)
