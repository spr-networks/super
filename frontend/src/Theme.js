import { extendTheme } from 'native-base'
import { theme as nbTheme } from 'native-base'
const { colors } = nbTheme

export const theme = extendTheme({
  colors: {
    backgroundLight: colors.coolGray[100],
    backgroundDark: colors.blueGray[900],

    backgroundContentLight: '#f4f3ef', // warmGray.200
    backgroundContentDark: colors.blueGray[900],

    primaryTextDark: colors.cyan[200],
    primaryTextLight: colors.cyan[700],

    borderColorDark: colors.coolGray[800],
    borderColorLight: '#dfe3e6',
    borderColorLightTest: colors.red[500],

    // navbar

    navbarBackgroundLight: colors.white, // colors.coolGray[100],
    navbarBackgroundDark: colors.blueGray[900], //'#24292f',
    navbarBorderColorLight: colors.coolGray[100],
    navbarBorderColorDark: colors.coolGray[800],
    navbarTextColorLight: colors.coolGray[600],
    navbarTextColorDark: colors.coolGray[300],

    // sidebar

    sidebarBackgroundLight: colors.white, //colors.coolGray[100],
    sidebarBackgroundDark: colors.blueGray[900], //'#24292f',
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

    inactiveSidebarItemHoverBackgroundLight: colors.blueGray[200],
    inactiveSidebarItemHoverBackgroundDark: colors.blueGray[800],

    // other

    tipBackgroundColorDark: colors.coolGray[300],
    tipBackgroundColorLight: colors.coolGray[900]
  },
  config: {
    // Changing initialColorMode to 'dark'
    initialColorMode: 'light'
  }
})

console.log('theme:', theme)
