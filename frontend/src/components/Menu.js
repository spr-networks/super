import React from 'react'

//import { NativeBaseProvider, Menu as MenuNB } from nb
//import { theme } from 'Theme'

import { Menu, MenuItem, MenuItemLabel } from '@gluestack-ui/themed'

const TestMenu = (props) => {
  return (
    <Menu
      placement="bottom center"
      selectionMode="single"
      trigger={props.trigger}
      onSelectionChange={(e) => alert(`Testmenu: ${e.currentKey} selected`)}
    >
      <MenuItem key="Delete" textValue="Delete">
        <MenuItemLabel color="$red700">Delete</MenuItemLabel>
      </MenuItem>
    </Menu>
  )

  //<MenuNB {...props}>{props.children}</MenuNB>
  /*return (
    <NativeBaseProvider theme={theme}>
      <MenuNB trigger={props.trigger}>
        <MenuNB.Item>Hello</MenuNB.Item>
        <MenuNB.Item>Hello23</MenuNB.Item>
      </MenuNB>
    </NativeBaseProvider>
  )*/
}

//Menu, Menu.Item
TestMenu.Item = MenuItem

//let MenuExport = TestMenu
let MenuExport = Menu

export default MenuExport

export { MenuExport as Menu, MenuItem, MenuItemLabel }
