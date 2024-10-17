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
  const [ip_fam, setIpFam] = useState('')
  const [host_fam, setHostFam] = useState('')
  const [enableTls, setEnableTls] = useState(true)
  const [enableFamilyTls, setEnableFamilyTls] = useState(true)
  const [disableRebindingCheck, setDisableRebindingCheck] = useState(false)

  const contextType = useContext(AppContext)

  let presets = {
    '1.1.1.1': 'cloudflare-dns.com',
    '1.1.1.3': 'cloudflare-dns.com',
    '9.9.9.9': 'dns.quad9.net',
    '8.8.8.8': 'dns.google',
    '208.67.222.123': 'doh.opendns.com'
  }

  const onChangeText = (what, value) => {
    if (what == 'ip') {
      setIp(value)
      if (presets[value]) {
        setHost(presets[value])
      }
    } else if (what == 'host') {
      setHost(value)
    } else if (what == 'ip_fam') {
      setIpFam(value)
      if (presets[value]) {
        setHostFam(presets[value])
      }
    } else if (what == 'host_fam') {
      setHostFam(value)
    }
  }

  const submitSettings = (value) => {
    let config = {
      UpstreamIPAddress: ip,
      UpstreamTLSHost: host,
      DisableTls: !enableTls,
      UpstreamFamilyIPAddress: ip_fam,
      UpstreamFamilyTLSHost: host_fam,
      DisableFamilyTls: !enableFamilyTls,
    }
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
        setIpFam('1.1.1.3')
        setHostFam(presets[defaultIp])
        return
      }

      setHost(config.UpstreamTLSHost)
      setHostFam(config.UpstreamFamilyTLSHost)
      setIp(config.UpstreamIPAddress)
      setIpFam(config.UpstreamFamilyIPAddress)
      setEnableTls(!config.DisableTls)
      setEnableFamilyTls(!config.DisableFamilyTls)
    })
  }, [])

  let options = [
    { label: 'Cloudflare (1.1.1.1)', value: '1.1.1.1' },
    { label: 'Cloudflare (1.1.1.3) Family Filter', value: '1.1.1.3' },
    { label: 'Quad9 (9.9.9.9)', value: '9.9.9.9' },
    { label: 'Google (8.8.8.8)', value: '8.8.8.8' }
  ] //[{ label: t, value: { Tag: t } }]

  let options_family = [
    { label: 'Cloudflare (1.1.1.3) Family Filter', value: '1.1.1.3' },
    { label: 'OpenDNS Family (208.67.222.123)', value: '208.67.222.123' }
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

          <Text bold>Primary: DNS IP</Text>
          <InputSelect
            options={options}
            value={ip}
            onChange={(v) => onChangeText('ip', v)}
            onChangeText={(v) => onChangeText('ip', v)}
          />
          <Text bold>DNS Hostname (for encrypted DNS)</Text>
          <Input variant="underlined">
            <InputField
              value={host}
              onChangeText={(v) => onChangeText('host', v)}
            />
          </Input>
          <Text bold>
            Encrypt Outbound DNS Requests with DNS over HTTPS (DoH)
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

        </VStack>
      </Box>
      <Box
        bg="$backgroundCardLight"
        sx={{
          _dark: { bg: '$backgroundCardDark' }
        }}
        p="$4"
      >
        <VStack space="lg">
          <Text bold>Family Filter: DNS IP</Text>
          <InputSelect
            options={options_family}
            value={ip_fam}
            onChange={(v) => onChangeText('ip_fam', v)}
            onChangeText={(v) => onChangeText('ip_fam', v)}
          />
          <Text bold>Family Filter: DNS Hostname (for encrypted DNS)</Text>
          <Input variant="underlined">
            <InputField
              value={host_fam}
              onChangeText={(v) => onChangeText('host_fam', v)}
            />
          </Input>
          <Text bold>
            Encrypt Outbound DNS Requests with DNS over HTTPS (DoH)
          </Text>

          <Checkbox
            value={enableFamilyTls}
            defaultIsChecked={enableFamilyTls}
            onChange={setEnableFamilyTls}
          >
            <CheckboxIndicator mr="$2">
              <CheckboxIcon />
            </CheckboxIndicator>
            <CheckboxLabel>Enabled</CheckboxLabel>
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
