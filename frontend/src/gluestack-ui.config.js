import { config as defaultConfig } from '@gluestack-ui/config'

const colors = defaultConfig.tokens.colors

export const config = {
  ...defaultConfig,
  tokens: {
    ...defaultConfig.tokens,
    colors: {
      ...defaultConfig.tokens.colors,
      primary0: '#ffffff',
      primary50: '#FFF1F2',
      primary100: '#FFE4E6',
      primary200: '#FECDD3',
      primary300: '#FDA4AF',
      primary400: '#EE596F',
      primary500: '#F43F5E',
      primary600: '#E11d48',
      primary600_alpha60: '#5C93C8',
      primary700: '#BE123C',
      primary800: '#9F1239',
      primary900: '#881337',
      primary950: '#440A1C',

      muted50: '#fafafa',
      muted100: '#f5f5f5',
      muted200: '#e5e5e5',
      muted300: '#d4d4d4',
      muted400: '#a3a3a3',
      muted500: '#737373',
      muted600: '#525252',
      muted700: '#404040',
      muted800: '#262626',
      muted900: '#171717',

      backgroundCardLight: colors.warmGray50,
      backgroundCardDark: colors.coolGray900,
      borderColorCardLight: colors.warmGray100,
      borderColorCardDark: colors.blueGray800,

      backgroundContentLight: colors.coolGray100,
      backgroundContentDark: colors.black, //colors.blueGray900,

      sidebarBackgroundLight: colors.coolGray50,
      sidebarBackgroundDark: colors.black,

      navbarBackgroundLight: colors.white,
      navbarBackgroundDark: colors.black,
      navbarBorderColorLight: colors.coolGray100,
      navbarBorderColorDark: colors.coolGray800,
      navbarTextColorLight: colors.coolGray600,
      navbarTextColorDark: colors.coolGray300
    }
  }
}
