import { extendTheme } from 'native-base'
import { theme as nbTheme } from 'native-base'
const { colors } = nbTheme

export const theme = extendTheme({
  colors: {
    /*primary: {
      50: '#E3F2F9',
      100: '#C5E4F3',
      200: '#A2D4EC',
      300: '#7AC1E4',
      400: '#47A9DA',
      500: colors.violet[500], //'#0088CC',
      600: colors.violet[600], //'#007AB8',
      700: '#006BA1',
      800: '#005885',
      900: '#003F5E'
    },*/

    backgroundLight: colors.coolGray[100],
    backgroundDark: colors.blueGray[900],

    backgroundContentLight: '#f4f3ef', // warmGray.200
    backgroundContentDark: colors.blueGray[900],

    backgroundCardLight: colors.warmGray[50],
    backgroundCardDark: colors.blueGray[800],
    borderColorCardLight: colors.warmGray[100],
    borderColorCardDark: colors.blueGray[700],

    primaryTextDark: colors.cyan[200],
    primaryTextLight: colors.cyan[700],

    borderColorDark: colors.coolGray[800],
    borderColorLight: '#dfe3e6',
    borderColorLightTest: colors.red[500],

    // custom buttons

    buttonBackgroundLight: colors.cyan[600],
    buttonOutlineBackgroundLight: colors.cyan[50],
    buttonBorderColorLight: colors.cyan[600],

    // navbar

    navbarBackgroundLight: colors.white, // colors.coolGray[100],
    navbarBackgroundDark: colors.blueGray[900], //'#24292f',
    navbarBorderColorLight: colors.coolGray[100],
    navbarBorderColorDark: colors.coolGray[800],
    navbarTextColorLight: colors.coolGray[600],
    navbarTextColorDark: colors.coolGray[300],

    // sidebar

    sidebarBackgroundLight: colors.coolGray[50], // colors.white
    sidebarBackgroundDark: colors.blueGray[900], // + .alpha:50
    sidebarBorderColorLight: colors.coolGray[100],
    sidebarBorderColorDark: colors.coolGray[800],

    sidebarItemHeadingTextLight: colors.blueGray[900],
    sidebarItemHeadingTextDark: colors.coolGray[300], //coolGray.50
    sidebarItemTextDark: colors.coolGray[300],
    sidebarItemTextLight: '#11181c',
    sidebarItemIconLight: colors.coolGray[600], //colors.blueGray[800],
    sidebarItemIconDark: colors.coolGray[400], //coolGray.50

    activeSidebarItemBackgroundLight: colors.coolGray[200], //colors.cyan[200],
    activeSidebarItemBackgroundDark: colors.cyan[700],
    activeSidebarItemHoverBackgroundLight: colors.blueGray[200], //.alpha[60],'//colors.cyan[200],
    activeSidebarItemHoverBackgroundDark: colors.cyan[600],

    inactiveSidebarItemHoverBackgroundLight: colors.coolGray[100],
    inactiveSidebarItemHoverBackgroundDark: colors.blueGray[800],

    // other

    tipBackgroundColorDark: colors.coolGray[300],
    tipBackgroundColorLight: colors.coolGray[900]
  },
  config: {
    // Changing initialColorMode to 'dark'
    useSystemColorMode: true,
    initialColorMode: 'light'
  }
})
