import React from 'react'

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
}

//Menu, Menu.Item
TestMenu.Item = MenuItem

let MenuExport = Menu

export default MenuExport

export { MenuExport as Menu, MenuItem, MenuItemLabel }
