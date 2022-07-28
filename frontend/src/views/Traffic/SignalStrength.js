import React, { useContext, Component } from 'react'
import { deviceAPI, wifiAPI } from 'api'
import { AlertContext } from 'layouts/Admin'

import { Box, Heading, Text, View } from 'native-base'

export default class SignalStrength extends Component {
	render() {
    return (
			<Text>TODO</Text>
    )
	}
}

SignalStrength.contextType = AlertContext
