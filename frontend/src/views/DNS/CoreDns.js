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
  CheckIcon,
  Divider
} from '@gluestack-ui/themed'
import { Trash2Icon, PlusIcon } from 'lucide-react-native'
import { ListHeader } from 'components/List'

const CoreDns = (props) => {
  const [ip, setIp] = useState('')
  const [host, setHost] = useState('')
  const [ip_fam, setIpFam] = useState('')
  const [host_fam, setHostFam] = useState('')
  const [enableTls, setEnableTls] = useState(true)
  const [enableFamilyTls, setEnableFamilyTls] = useState(true)
  const [disableRebindingCheck, setDisableRebindingCheck] = useState(false)
  
  // New state for multiple providers
  const [upstreamProviders, setUpstreamProviders] = useState([])
  const [familyProviders, setFamilyProviders] = useState([])
  const [useMultipleProviders, setUseMultipleProviders] = useState(false)

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

  const addUpstreamProvider = () => {
    setUpstreamProviders([...upstreamProviders, { IPAddress: '', TLSHost: '', DisableTls: false }])
  }

  const removeUpstreamProvider = (index) => {
    setUpstreamProviders(upstreamProviders.filter((_, i) => i !== index))
  }

  const updateUpstreamProvider = (index, field, value) => {
    const updated = [...upstreamProviders]
    updated[index][field] = value
    setUpstreamProviders(updated)
  }

  const addFamilyProvider = () => {
    setFamilyProviders([...familyProviders, { IPAddress: '', TLSHost: '', DisableTls: false }])
  }

  const removeFamilyProvider = (index) => {
    setFamilyProviders(familyProviders.filter((_, i) => i !== index))
  }

  const updateFamilyProvider = (index, field, value) => {
    const updated = [...familyProviders]
    updated[index][field] = value
    setFamilyProviders(updated)
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
    
    // Add multiple providers if enabled
    if (useMultipleProviders) {
      config.UpstreamProviders = upstreamProviders.filter(p => p.IPAddress)
      config.FamilyProviders = familyProviders.filter(p => p.IPAddress)
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
      
      // Load multiple providers if available
      if (config.UpstreamProviders && config.UpstreamProviders.length > 0) {
        setUpstreamProviders(config.UpstreamProviders)
        setUseMultipleProviders(true)
      }
      if (config.FamilyProviders && config.FamilyProviders.length > 0) {
        setFamilyProviders(config.FamilyProviders)
      }
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
          
          <Text bold>
            Enable Multiple DNS Providers (Fallback Support)
          </Text>

          <Checkbox
            value={useMultipleProviders}
            defaultIsChecked={useMultipleProviders}
            onChange={setUseMultipleProviders}
          >
            <CheckboxIndicator mr="$2">
              <CheckboxIcon />
            </CheckboxIndicator>
            <CheckboxLabel>Use Multiple Providers</CheckboxLabel>
          </Checkbox>

          {!useMultipleProviders ? (
            <>
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
                Encrypt Outbound DNS Requests with DNS over TLS (DoT)
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
            </>
          ) : (
            <>
              <Text bold>Primary DNS Providers (Tried in Order)</Text>
              {upstreamProviders.map((provider, index) => (
                <Box key={index} borderWidth={1} borderColor="$borderColorLight" borderRadius="$md" p="$2">
                  <VStack space="sm">
                    <HStack space="md" alignItems="center">
                      <InputSelect
                        flex={1}
                        options={options}
                        value={provider.IPAddress}
                        onChange={(v) => {
                          updateUpstreamProvider(index, 'IPAddress', v)
                          if (presets[v]) {
                            updateUpstreamProvider(index, 'TLSHost', presets[v])
                          }
                        }}
                        onChangeText={(v) => {
                          updateUpstreamProvider(index, 'IPAddress', v)
                        }}
                        placeholder="DNS IP Address"
                      />
                      <Button
                        size="sm"
                        action="secondary"
                        variant="outline"
                        onPress={() => removeUpstreamProvider(index)}
                      >
                        <ButtonIcon as={Trash2Icon} />
                      </Button>
                    </HStack>
                    <Input variant="underlined">
                      <InputField
                        value={provider.TLSHost}
                        onChangeText={(v) => updateUpstreamProvider(index, 'TLSHost', v)}
                        placeholder="DNS Hostname (for DoT)"
                      />
                    </Input>
                    <Checkbox
                      value={!provider.DisableTls}
                      defaultIsChecked={!provider.DisableTls}
                      onChange={(v) => updateUpstreamProvider(index, 'DisableTls', !v)}
                    >
                      <CheckboxIndicator mr="$2">
                        <CheckboxIcon />
                      </CheckboxIndicator>
                      <CheckboxLabel>Enable TLS</CheckboxLabel>
                    </Checkbox>
                  </VStack>
                </Box>
              ))}
              <Button
                size="sm"
                action="secondary"
                variant="outline"
                onPress={addUpstreamProvider}
              >
                <ButtonIcon as={PlusIcon} mr="$1" />
                <ButtonText>Add Provider</ButtonText>
              </Button>
            </>
          )}

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
          {!useMultipleProviders ? (
            <>
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
                Encrypt Outbound DNS Requests with DNS over TLS (DoT)
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
            </>
          ) : (
            <>
              <Text bold>Family Filter DNS Providers (Tried in Order)</Text>
              {familyProviders.map((provider, index) => (
                <Box key={index} borderWidth={1} borderColor="$borderColorLight" borderRadius="$md" p="$2">
                  <VStack space="sm">
                    <HStack space="md" alignItems="center">
                      <InputSelect
                        flex={1}
                        options={options_family}
                        value={provider.IPAddress}
                        onChange={(v) => {
                          updateFamilyProvider(index, 'IPAddress', v)
                          if (presets[v]) {
                            updateFamilyProvider(index, 'TLSHost', presets[v])
                          }
                        }}
                        onChangeText={(v) => {
                          updateFamilyProvider(index, 'IPAddress', v)
                        }}
                        placeholder="Family DNS IP Address"
                      />
                      <Button
                        size="sm"
                        action="secondary"
                        variant="outline"
                        onPress={() => removeFamilyProvider(index)}
                      >
                        <ButtonIcon as={Trash2Icon} />
                      </Button>
                    </HStack>
                    <Input variant="underlined">
                      <InputField
                        value={provider.TLSHost}
                        onChangeText={(v) => updateFamilyProvider(index, 'TLSHost', v)}
                        placeholder="DNS Hostname (for DoT)"
                      />
                    </Input>
                    <Checkbox
                      value={!provider.DisableTls}
                      defaultIsChecked={!provider.DisableTls}
                      onChange={(v) => updateFamilyProvider(index, 'DisableTls', !v)}
                    >
                      <CheckboxIndicator mr="$2">
                        <CheckboxIcon />
                      </CheckboxIndicator>
                      <CheckboxLabel>Enable TLS</CheckboxLabel>
                    </Checkbox>
                  </VStack>
                </Box>
              ))}
              <Button
                size="sm"
                action="secondary"
                variant="outline"
                onPress={addFamilyProvider}
              >
                <ButtonIcon as={PlusIcon} mr="$1" />
                <ButtonText>Add Family Provider</ButtonText>
              </Button>
            </>
          )}

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
