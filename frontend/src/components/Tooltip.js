import React from 'react'
import PropTypes from 'prop-types'

import {
  Pressable,
  Tooltip,
  TooltipContent,
  TooltipText
} from '@gluestack-ui/themed'

const T = ({ label, children, ...props }) => {
  return (
    <Tooltip
      h={undefined}
      placement="bottom"
      trigger={(triggerProps) => {
        return (
          <Pressable {...triggerProps} {...props}>
            {children}
          </Pressable>
        )
      }}
    >
      <TooltipContent>
        <TooltipText>{label}</TooltipText>
      </TooltipContent>
    </Tooltip>
  )
}

export default T
export { T as Tooltip }

T.propTypes = {
  label: PropTypes.string
}
