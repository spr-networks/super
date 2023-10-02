import React, { Component, useEffect, useState, useContext } from 'react'
import { useParams } from 'react-router-dom'
import InputSelect from 'components/InputSelect'
import { AppContext, alertState } from 'AppContext'

import { CoreDNS } from 'api/CoreDNS'

import {
  Box,
  Button,
  Checkbox,
  Heading,
  HStack,
  Input,
  Text,
  View,
  VStack,
  useColorModeValue
} from 'native-base'

const CoreDns = (props) => {
  const [ip, setIp] = useState('')
  const [host, setHost] = useState('')
  const [enableTls, setEnableTls] = useState(true)

  const contextType = useContext(AppContext)


  let presets = {
    '1.1.1.1': 'cloudflare-dns.com',
    '9.9.9.9': 'dns.quad9.net',
    '8.8.8.8': 'dns.google'
  }

  const onChangeText = (what, value) => {
    if (what == "ip") {
      setIp(value)
      if (presets[value]) {
        setHost(presets[value])
      }
    } else if (what == "host") {
      setHost(value)
    }
  }



  const submitSettings = (value) => {
    let config = {
      "UpstreamIPAddress" : ip,
      "UpstreamTLSHost": host,
      "DisableTls": !enableTls
    }
    CoreDNS.setConfig(config).then(() => {
      alertState.success("Updated DNS Settings")
    }, (e) => {
      alertState.error('API Failure: ' + e.message)
    })
  }

  useEffect(() => {
    CoreDNS
      .config()
      .then((config) => {
        setHost(config.UpstreamTLSHost)
        setIp(config.UpstreamIPAddress)
        //setEnableTls(config.DisableTls)
      })

  }, [])

  /*
      tbd

        set Upstream IP adddress, tls hostname,

        presets:
          google, enxtdns, cloudflare.
  */
  let options = [
    { label: 'Cloudflare (1.1.1.1)', value: '1.1.1.1' },
    { label: 'Quad9 (9.9.9.9)', value: '9.9.9.9' },
    { label: 'Google (8.8.8.8)', value: '8.8.8.8'}
  ] //[{ label: t, value: { Tag: t } }]

  return (
    <View>

    <Box
      bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
      width="50%"
      p={4}
      mb={4}
    >
    <VStack space={4}>
      <Heading fontSize="md">Dynamic DNS</Heading>
        <Text bold>DNS IP</Text>
        <InputSelect
          options={options}
          value={ip}
          onChange={(v) => onChangeText("ip", v)}
          onChangeText={(v) => onChangeText("ip", v)}
        />
        <Text bold>DNS Hostname</Text>
        <Input
          value={host}
          onChangeText={(v) => onChangeText("host", v)}
        />
        <Text bold>Encrypted Outbound DNS Requests with DoH (DNS over HTTPS) </Text>
        <Checkbox
          size="sm"
          colorScheme="primary"
          value={enableTls}
          onChange={(value) => {
            setEnableTls(value)
          }}
          defaultIsChecked={enableTls}
        >
          Enabled
        </Checkbox>
        <Button
          colorScheme="primary"
          onPress={submitSettings}
        >Save</Button>
    </VStack>
    </Box>
    </View>
  )
}

export default CoreDns
