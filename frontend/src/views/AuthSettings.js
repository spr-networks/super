import React, { useContext, Component } from 'react'

import { Box, Button, Heading, HStack, Text, View, VStack } from 'native-base'

import WebAuthn from 'components/Auth/WebAuthn'
import AuthTokenList from 'components/Auth/AuthTokenList'

export default class AuthSettings extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <View>
        <WebAuthn />
        <AuthTokenList />
      </View>
    )
  }
}
