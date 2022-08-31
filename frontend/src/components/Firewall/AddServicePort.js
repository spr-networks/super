import React, { useContext, useState } from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'AppContext'

import { firewallAPI } from 'api'

import {
  Badge,
  Box,
  Button,
  Checkbox,
  FormControl,
  Heading,
  HStack,
  Input,
  Link,
  Radio,
  Stack,
  Spinner,
  Switch,
  Text
} from 'native-base'

const AddServicePort = ({ notifyChange, ...props }) => {
  const context = useContext(AlertContext)

  const [Protocol, setProtocol] = useState('tcp')
  const [Port, setPort] = useState('0')
  const [UpstreamEnabled, setUpstreamEnabled] = useState(false)

  const handleSubmit = () => {
    let rule = {
      Protocol,
      Port,
      UpstreamEnabled
    }

    firewallAPI
      .addServicePort(rule)
      .then((res) => {
        if (notifyChange) {
          notifyChange('service_port')
        }
      })
      .catch((err) => {
        context.error('Firewall API Failure: ' + err)
      })
  }

  let selOpt = (value) => {
    return { label: value, value }
  }

  let Protocols = ['tcp', 'udp'].map((p) => {
    return { label: p, value: p }
  })

  return (
    <Stack space={4}>
      <HStack space={4}>
        <FormControl flex={1}>
          <FormControl.Label for="Protocol">Protocol</FormControl.Label>
          <Badge variant="outline" alignSelf="flex-start">
            {Protocol}
          </Badge>
        </FormControl>

        <FormControl flex={1}>
          <FormControl.Label for="DstPort">Port</FormControl.Label>
          <Input
            w="100"
            size="md"
            variant="underlined"
            name="Port"
            value={Port}
            onChangeText={(value) => setPort(value)}
          />
        </FormControl>
        <Box flex={1} alignItems="center" alignSelf="center">
          <FormControl.Label for="DstPort">Upstream Enabled</FormControl.Label>
          <Switch
            defaultIsChecked={UpstreamEnabled}
            onValueChange={() => setUpstreamEnabled(!UpstreamEnabled)}
          />
        </Box>
      </HStack>

      <Button color="primary" size="md" onPress={handleSubmit}>
        Save
      </Button>
    </Stack>
  )
}

export default AddServicePort
