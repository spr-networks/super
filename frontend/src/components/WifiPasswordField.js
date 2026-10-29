import React from 'react'
import { Platform } from 'react-native'
import { InputField } from '@gluestack-ui/themed'

const webMask = { WebkitTextSecurity: 'disc' }

const WifiPasswordField = (props) =>
  Platform.OS == 'web' ? (
    <InputField
      type="text"
      autoComplete="off"
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      style={webMask}
      {...props}
    />
  ) : (
    <InputField
      type="password"
      autoComplete="new-password"
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
    />
  )

export default WifiPasswordField
