import React, { Component } from 'react'

import { View } from '@gluestack-ui/themed'

import WebAuthn from 'components/Auth/WebAuthn'
import AuthTokenList from 'components/Auth/AuthTokenList'

export default class AuthSettings extends Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <View>
        {/*<WebAuthn />*/}
        <AuthTokenList />
      </View>
    )
  }
}
