import React from 'react'
import PropTypes from 'prop-types'
import { FontAwesomeIcon as FontAwesomeIconNative } from '@fortawesome/react-native-fontawesome'
import { FontAwesomeIcon as FontAwesomeIconReact } from '@fortawesome/react-fontawesome'
import { Platform, StyleSheet } from 'react-native'
import { Icon as IconNb, useToken } from 'native-base'
export * from '@fortawesome/react-native-fontawesome'

const FontAwesomeIcon =
  Platform.OS === 'web' && false ? FontAwesomeIconReact : FontAwesomeIconNative

/*FaIcon.propTypes = {
  icon: PropTypes.object,
  color: PropTypes.string,
  size: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
}*/

export default function Icon({ color, icon, size, style, ...props }) {
  if (Platform.OS === 'web') {
    // behave like native-base
    size = size == 'xs' ? 3 : size
    size = size ? parseInt(size) * 4 : 16
    size = `${size}px`

    style = style || {}

    if (props.mr) {
      style.marginRight = props.mr * 4
    }

    if (props.ml) {
      style.marginLeft = props.ml * 4
    }

    const webStyles = StyleSheet.flatten([
      style,
      { color: useToken('colors', color), width: size, height: size }
    ])

    return <FontAwesomeIconReact icon={icon} style={webStyles} />
  }

  return <IconNb as={FontAwesomeIcon} icon={icon} color={color} {...props} />
}

export { Icon, FontAwesomeIcon }
