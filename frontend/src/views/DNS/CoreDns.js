import React, { useEffect, useState, useContext } from 'react'
import InputSelect from 'components/InputSelect'
import { AppContext, alertState } from 'AppContext'

import { CoreDNS } from 'api/CoreDNS'
import { blockAPI } from 'api/DNS'

import {
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  Checkbox,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  Heading,
  Input,
  InputField,
  Text,
  View,
  VStack,
  HStack,
  CheckIcon
} from '@gluestack-ui/themed'
import { ListHeader } from 'components/List'

const CoreDns = (props) => {
  const [ip, setIp] = useState('')
  const [host, setHost] = useState('')
  const [enableTls, setEnableTls] = useState(true)
  const [disableRebindingCheck, setDisableRebindingCheck] = useState(false)

  const contextType = useContext(AppContext)

  let presets = {
    '1.1.1.1': 'cloudflare-dns.com',
    '9.9.9.9': 'dns.quad9.net',
    '8.8.8.8': 'dns.google'
  }

  const onChangeText = (what, value) => {
    if (what == 'ip') {
      setIp(value)
      if (presets[value]) {
        setHost(presets[value])
      }
    } else if (what == 'host') {
      setHost(value)
    }
  }

  const submitSettings = (value) => {
    let config = {
      UpstreamIPAddress: ip,
      UpstreamTLSHost: host,
      DisableTls: !enableTls,    }
    CoreDNS.setConfig(config).then(
      () => {
        alertState.success('Updated DNS Settings')
      },
      (e) => {
        alertState.error('API Failure: ' + e.message)
      }
    )

    blockAPI.disableRebinding(disableRebindingCheck).then(
      () => {
        alertState.success('Updated DNS Settings')
      },
      (e) => {
        alertState.error('API Failure: ' + e.message)
      }
    )
  }

  useEffect(() => {
    CoreDNS.config().then((config) => {
      // set defaults if empty
      if (
        !config.UpstreamTLSHost?.length &&
        !config.UpstreamIPAddress?.length
      ) {
        let defaultIp = '1.1.1.1'
        setHost(presets[defaultIp])
        setIp(defaultIp)

        return
      }

      setHost(config.UpstreamTLSHost)
      setIp(config.UpstreamIPAddress)
      setEnableTls(!config.DisableTls)
    })
  }, [])

  let options = [
    { label: 'Cloudflare (1.1.1.1)', value: '1.1.1.1' },
    { label: 'Quad9 (9.9.9.9)', value: '9.9.9.9' },
    { label: 'Google (8.8.8.8)', value: '8.8.8.8' }
  ] //[{ label: t, value: { Tag: t } }]

  return (
    <View sx={{ '@md': { w: '$3/5' } }}>
      <ListHeader title="Core DNS Settings" />

      <Box
        bg="$backgroundCardLight"
        sx={{
          _dark: { bg: '$backgroundCardDark' }
        }}
        p="$4"
      >
        <VStack space="lg">
          <Heading size="md"></Heading>
          <Text bold>DNS IP</Text>
          <InputSelect
            options={options}
            value={ip}
            onChange={(v) => onChangeText('ip', v)}
            onChangeText={(v) => onChangeText('ip', v)}
          />
          <Text bold>DNS Hostname</Text>
          <Input variant="underlined">
            <InputField
              value={host}
              onChangeText={(v) => onChangeText('host', v)}
            />
          </Input>
          <Text bold>
            Encrypt Outbound DNS Requests with DoH (DNS over HTTPS)
          </Text>

          <Checkbox
            value={enableTls}
            defaultIsChecked={enableTls}
            onChange={setEnableTls}
          >
            <CheckboxIndicator mr="$2">
              <CheckboxIcon />
            </CheckboxIndicator>
            <CheckboxLabel>Enabled</CheckboxLabel>
          </Checkbox>

          <Text bold>
            Disable DNS Rebinding Protection
          </Text>

          <Checkbox
            value={disableRebindingCheck}
            defaultIsChecked={disableRebindingCheck}
            onChange={setDisableRebindingCheck}
          >
            <CheckboxIndicator mr="$2">
              <CheckboxIcon />
            </CheckboxIndicator>
            <CheckboxLabel>Disabled</CheckboxLabel>
          </Checkbox>

          <HStack>
            <Button action="primary" onPress={submitSettings}>
              <ButtonText>Save</ButtonText>
              <ButtonIcon as={CheckIcon} ml="$1" />
            </Button>
          </HStack>
        </VStack>
      </Box>
    </View>
  )
}

export default CoreDns
