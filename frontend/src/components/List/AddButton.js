//TODO
import React from 'react'

import { Button, ButtonIcon, ButtonText, AddIcon } from '@gluestack-ui/themed'

const AddButton = ({ onPress, ...props }) => {
  return (
    <Button
      sx={{ '@md': { display: list.length ? 'none' : 'flex' } }}
      action="primary"
      variant="solid"
      rounded="$none"
      onPress={onPress}
      {...props}
    >
      <ButtonText>Add Endpoint</ButtonText>
      <ButtonIcon as={AddIcon} />
    </Button>
  )
}
export default AddButton
