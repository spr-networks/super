import React from 'react'

import { Menu, MenuItem, MenuItemLabel } from '@gluestack-ui/themed'

//TODO tags, actions etc.
const TestMenu = (props) => {
  return (
    <Box bg="$amber100" p="$32">
      <Menu
        placement="bottom center"
        selectionMode="single"
        trigger={({ ...triggerProps }) => {
          return (
            <Button {...triggerProps}>
              <ButtonText>Menu</ButtonText>
            </Button>
          )
        }}
      >
        <MenuItem key="Delete" textValue="Delete">
          <MenuItemLabel color="$red700">Delete</MenuItemLabel>
        </MenuItem>
      </Menu>
    </Box>
  )
}

export default TestMenu
