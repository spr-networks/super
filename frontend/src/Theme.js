import { extendTheme } from 'native-base'
import { theme as nbTheme } from 'native-base'
const { colors } = nbTheme

export const theme = extendTheme({
  colors: {
    primary: { ...colors.violet /*, 600: '#8578E6'*/ },
    secondary: colors.orange,
    backgroundLight: colors.coolGray[100],
    backgroundDark: colors.blueGray[900],

    backgroundContentLight: colors.coolGray[100], //'#f4f3ef', // warmGray.200
    backgroundContentDark: colors.gray[900], //colors.blueGray[900],

    backgroundCardLight: colors.warmGray[50],
    backgroundCardDark: colors.black, //colors.blueGray[800],
    borderColorCardLight: colors.warmGray[100],
    borderColorCardDark: colors.gray[900], //colors.blueGray[800],

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
    navbarBackgroundDark: colors.black, //colors.blueGray[900], //'#24292f',
    navbarBorderColorLight: colors.coolGray[100],
    navbarBorderColorDark: colors.coolGray[800],
    navbarTextColorLight: colors.coolGray[600],
    navbarTextColorDark: colors.coolGray[300],

    // sidebar

    sidebarBackgroundLight: colors.coolGray[50], // colors.white
    sidebarBackgroundDark: colors.black, //colors.blueGray[900], // + .alpha:50
    sidebarBorderColorLight: colors.coolGray[100],
    sidebarBorderColorDark: colors.coolGray[800],

    sidebarItemHeadingTextLight: colors.blueGray[900],
    sidebarItemHeadingTextDark: colors.coolGray[300], //coolGray.50
    sidebarItemTextDark: colors.coolGray[300],
    sidebarItemTextLight: '#11181c',
    sidebarItemIconLight: colors.coolGray[600], //colors.blueGray[800],
    sidebarItemIconDark: colors.coolGray[400], //coolGray.50

    activeSidebarItemBackgroundLight: colors.coolGray[200], //colors.cyan[200],
    activeSidebarItemBackgroundDark: colors.coolGray[800], //colors.cyan[700],
    activeSidebarItemHoverBackgroundLight: colors.blueGray[200], //.alpha[60],'//colors.cyan[200],
    activeSidebarItemHoverBackgroundDark: colors.coolGray[600],

    inactiveSidebarItemHoverBackgroundLight: colors.coolGray[100],
    inactiveSidebarItemHoverBackgroundDark: colors.coolGray[900],

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
