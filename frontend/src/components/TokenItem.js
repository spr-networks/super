import React from 'react'
import { Platform } from 'react-native'
import PropTypes from 'prop-types'

import {
  Button,
  ButtonIcon,
  ButtonText,
  Tooltip,
  TooltipContent,
  TooltipText,
  CopyIcon
} from '@gluestack-ui/themed'

import { copy } from 'utils'

const TokenItem = ({ token, ...props }) => {
  const showClipboard = true //Platform.OS !== 'web' || navigator.clipboard

  return (
    <Tooltip
      h={undefined}
      placement="bottom"
      trigger={(triggerProps) => {
        return (
          <Button
            size="xs"
            action="secondary"
            variant="outline"
            display={showClipboard ? 'flex' : 'none'}
            {...triggerProps}
            onPress={() => copy(token)}
          >
            <ButtonText>Copy Token</ButtonText>
            <ButtonIcon as={CopyIcon} ml="$1" />
          </Button>
        )
      }}
    >
      <TooltipContent>
        <TooltipText>{token}</TooltipText>
      </TooltipContent>
    </Tooltip>
  )
}
export default React.memo(TokenItem)

export { TokenItem }

TokenItem.propTypes = {
  token: PropTypes.string
}
