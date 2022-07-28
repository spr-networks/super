import React, { useContext, Component } from 'react'
import { deviceAPI, trafficAPI, wifiAPI } from 'api'
import DateRange from 'components/DateRange'
import { AlertContext } from 'layouts/Admin'
import { prettySize } from 'utils'

import {
  Box,
  Button,
  Heading,
  HStack,
  VStack,
  Text,
  useColorModeValue,
  View
} from 'native-base'

export default class Traffic extends Component {
	render() {
		return <Text>TODO</Text>
	}
}

Traffic.contextType = AlertContext
