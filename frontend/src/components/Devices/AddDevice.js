import React, { useContext, useEffect, useState } from 'react'

import { deviceAPI } from 'api'
import { AlertContext, AppContext } from 'AppContext'
import { WifiConnect, WiredConnect } from 'views/Devices/ConnectDevice'
import { format as timeAgo } from 'timeago.js'

import {
  Box,
  Button,
  ButtonText,
  Checkbox,
  CheckboxGroup,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  FormControlHelper,
  FormControlHelperText,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
  HStack,
  Input,
  InputField,
  RadioGroup,
  Radio,
  RadioIndicator,
  RadioIcon,
  RadioLabel,
  VStack,
  Text,
  AlertCircleIcon,
  CircleIcon,
  Tooltip,
  TooltipContent,
  TooltipText
} from '@gluestack-ui/themed'
import { ListHeader } from 'components/List'
import DeviceExpiry from './DeviceExpiry'

const AddDevice = (props) => {
  const context = useContext(AlertContext)
  const appContext = useContext(AppContext)
  const isSimpleMode = appContext.isSimpleMode

  const [mac, setMac] = useState('')
  const [name, setName] = useState('')
  const [policies, setPolicies] = useState(['dns', 'wan'])
  const [groups, setGroups] = useState([''])
  const [tags, setTags] = useState([])
  const [wpa, setWpa] = useState('sae')
  const [psk, setPsk] = useState('')
  const [vlan, setVlan] = useState('')
  const [device, setDevice] = useState({})
  const [expiration, setExpiration] = useState(0)
  const [deleteExpiry, setDeleteExpiry] = useState(false)
  const [deviceDisabled, setDeviceDisabled] = useState(false)

  const [submitted, setSubmitted] = useState(false)

  const [errors, setErrors] = useState({})

  const tagTips = {
    guest: 'This is a guest device',
    lan_upstream:
      'lan_upstream allows devices to query LAN addresses upstream of the SPR Router'
  }

  useEffect(() => {
    deviceAPI
      .list()
      .then((devs) => {
        let pendingDevice = devs.pending !== undefined ? devs.pending : null

        if (pendingDevice) {
          context.info(
            'Have Pending Device',
            `Device "${pendingDevice.Name}" is added but not connected. Adding a new device will overwrite it`
          )
        }
      })
      .catch((e) => {})
  }, [])

  const filterMAC = (value) => {
    value = value.toLowerCase()
    //must be of the format 00:00:00:00:00:00
    const hexChars = '0123456789abcdef'
    let digits = ''
    for (let c of value) {
      if (hexChars.indexOf(c) != -1) {
        digits += c
      }
    }
    let mac = ''
    let i = 0
    for (i = 0; i < digits.length - 1 && i < 6 * 2; i += 2) {
      mac += digits[i]
      mac += digits[i + 1]
      mac += ':'
    }
    if (i < digits.length && i < 6 * 2) {
      mac += digits[i]
    }
    if (mac[mac.length - 1] == ':') {
      mac = mac.slice(0, mac.length - 1)
    }
    return mac
  }
  const validateMAC = (value) => {
    if (value == '' || value.length == 17) {
      return true
    }

    return false
  }

  const validatePassphrase = (value) => {
    if (value == '' || value.length >= 8) {
      return true
    }

    return false
  }

  const allPolicies = ['wan', 'dns', 'lan', 'lan_upstream']
  const policyTips = {
    wan: 'Allow Internet Access',
    dns: 'Allow DNS Queries',
    lan: 'Allow access to ALL other devices on the network',
    lan_upstream: 'Allow device to reach private LANs upstream'
  }
  const policyName = {
    wan: 'Internet Access',
    dns: 'DNS Resolution',
    lan: 'Local Network',
    lan_upstream: 'Upstream Private Networks',
    disabled: 'Disabled'
  }
  const allTags = ['guest']

  const isPositiveNumber = (str) => {
    let num = parseFloat(str)
    return !isNaN(num) && num > 0
  }

  const handleChange = (name, value) => {
    if (name == 'name') {
      setName(value)

      if (value.length < 1) {
        return setErrors({ ...errors, name: 'invalid name' })
      }
    }

    if (name == 'mac') {
      value = filterMAC(value)
      if (!validateMAC(value)) {
        return setErrors({ ...errors, mac: 'invalid MAC address' })
      }

      setMac(value)
    }

    if (name == 'psk') {
      if (!validatePassphrase(value)) {
        return setErrors({ ...errors, psk: 'invalid passphrase' })
      }

      setPsk(value)
    }

    if (name == 'wpa') {
      setWpa(value)
    }

    if (name == 'vlan') {
      if (!isPositiveNumber(value)) {
        return setErrors({ ...errors, VLAN: 'invalid vlan tag' })
      }
      setVlan(value)
      setWpa('none')
    }

    if (name == 'Expiration') {
      if (value == 0 && expiration != 0) {
        //gotcha in the API is to reset should set to -1
        //this is so that setting 0 does not update expiry
        value = -1
      } else {
        value = parseInt(Date.now() / 1e3) + value
      }

      setExpiration(value)
    }

    setErrors({})
  }

  const handleSubmit = () => {
    if (Object.keys(errors).length) {
      return context.error('Invalid fields: ' + Object.keys(errors).join(','))
    }

    if (wpa == 'none' || vlan != '') {
      if (mac == '') {
        return context.error(
          'A mac address assignment is needed when setting a wired vlan tag'
        )
      }
    }

    let DeviceExpiration =
      expiration <= 0 ? -1 : expiration - parseInt(Date.now() / 1e3)

    let data = {
      MAC: mac || 'pending',
      Name: name,
      Groups: groups,
      Policies: policies,
      DeviceTags: tags,
      PSKEntry: {
        Psk: psk,
        Type: wpa
      },
      Style: {
        Color: 'blueGray',
        Icon: 'Laptop'
      },
      DeviceExpiration,
      DeleteExpiration: deleteExpiry,
      DeviceDisabled: deviceDisabled
    }

    if (wpa == 'none') {
      delete data.PSKEntry
      data.VLANTag = vlan
    }

    //now submit to the API
    deviceAPI
      .update(data)
      .then((device) => {
        if (psk.length) {
          device.PSKEntry.Psk = psk
        } else {
          setPsk(device.PSKEntry.Psk)
        }

        setDevice(device)
        setSubmitted(true)
      })
      .catch((error) => {
        context.error('DEVICE API:', error)
      })
  }
  if (submitted) {
    if (wpa != 'none') {
      return (
        <WifiConnect
          device={device}
          goBackSuccess={props.deviceAddedCallback}
          goBack={() => setSubmitted(false)}
        />
      )
    } else {
      return (
        <WiredConnect
          device={device}
          goBackSuccess={props.deviceAddedCallback}
          goBack={() => setSubmitted(false)}
        />
      )
    }
  }

  return (
    <VStack
      sx={{
        '@lg': { width: '$5/6' }
      }}
    >
      {!props.slimView && (
        <>
          <ListHeader title="Add a new WiFi Device" />
          <VStack display={isSimpleMode ? 'none' : 'flex'} px="$4">
            <Text color="$muted500" size="xs">
              Wired devices are added automatically & need WAN/DNS policies
              assigned to them for internet access
            </Text>
            <Text color="$muted500" size="xs">
              If they need a VLAN Tag ID for a Managed Port do add the device
              here
            </Text>
          </VStack>
        </>
      )}
      <VStack space="3xl" p="$4">
        <VStack
          space="md"
          sx={{
            '@md': { flexDirection: 'row' }
          }}
        >
          <FormControl flex={1} isRequired isInvalid={'name' in errors}>
            <FormControlLabel>
              <FormControlLabelText>Device Name</FormControlLabelText>
            </FormControlLabel>
            <Input size="md">
              <InputField
                autoFocus
                value={name}
                onChangeText={(value) => handleChange('name', value)}
                onBlur={() => handleChange('name', name)}
                onSubmitEditing={handleSubmit}
              />
            </Input>
            {'name' in errors ? (
              <FormControlError>
                <FormControlErrorIcon as={AlertCircleIcon} />
                <FormControlErrorText>Cannot be empty</FormControlErrorText>
              </FormControlError>
            ) : (
              <FormControlHelper>
                <FormControlHelperText>
                  A unique name for the device
                </FormControlHelperText>
              </FormControlHelper>
            )}
          </FormControl>

          <FormControl flex={1} isInvalid={'psk' in errors}>
            <FormControlLabel>
              <FormControlLabelText>Passphrase</FormControlLabelText>
            </FormControlLabel>
            <Input size="md">
              <InputField
                type="password"
                autoComplete="new-password"
                autoCorrect={false}
                onChangeText={(value) => handleChange('psk', value)}
              />
            </Input>
            {'psk' in errors ? (
              <FormControlError>
                <FormControlErrorIcon as={AlertCircleIcon} />
                <FormControlErrorText>
                  must be at least 8 characters long
                </FormControlErrorText>
              </FormControlError>
            ) : (
              <FormControlHelper>
                <FormControlHelperText>
                  Optional. If empty a random password will be generated
                </FormControlHelperText>
              </FormControlHelper>
            )}
          </FormControl>
        </VStack>

        <VStack
          space="md"
          sx={{
            '@md': { flexDirection: 'row' }
          }}
        >
          <FormControl flex={3}>
            <FormControlLabel>
              <FormControlLabelText>Authentication</FormControlLabelText>
            </FormControlLabel>

            <RadioGroup
              defaultValue={'sae'}
              accessibilityLabel="Auth"
              onChange={(value) => handleChange('wpa', value)}
            >
              <HStack py="$1" space="md" w="$full" flexWrap="wrap">
                <Radio value="sae" size="md">
                  <RadioIndicator mr="$2">
                    <RadioIcon as={CircleIcon} strokeWidth={1} />
                  </RadioIndicator>
                  <RadioLabel>WPA3</RadioLabel>
                </Radio>
                <Radio value="wpa2" size="md">
                  <RadioIndicator mr="$2">
                    <RadioIcon as={CircleIcon} strokeWidth={1} />
                  </RadioIndicator>
                  <RadioLabel>WPA2</RadioLabel>
                </Radio>
                <Radio value="none" size="md">
                  <RadioIndicator mr="$2">
                    <RadioIcon as={CircleIcon} strokeWidth={1} />
                  </RadioIndicator>
                  <RadioLabel>Wired</RadioLabel>
                </Radio>
              </HStack>
            </RadioGroup>

            <FormControlHelper>
              <FormControlHelperText>WPA3 is recommended</FormControlHelperText>
            </FormControlHelper>
          </FormControl>

          <FormControl flex={4}>
            <FormControlLabel>
              <FormControlLabelText>Policies</FormControlLabelText>
            </FormControlLabel>

            <CheckboxGroup
              value={policies}
              accessibilityLabel="Set Device Policies"
              onChange={(values) => setPolicies(values)}
              py="$1"
            >
              <HStack space="xl" space="md" w="$full" flexWrap="wrap">
                {allPolicies.map((policy) =>
                  policyTips[policy] !== null ? (
                    <Tooltip
                      h={undefined}
                      placement="bottom"
                      trigger={(triggerProps) => {
                        return (
                          <Box {...triggerProps}>
                            <Checkbox value={policy} colorScheme="primary">
                              <CheckboxIndicator mr="$2">
                                <CheckboxIcon />
                              </CheckboxIndicator>
                              <CheckboxLabel>
                                {policyName[policy]}
                              </CheckboxLabel>
                            </Checkbox>
                          </Box>
                        )
                      }}
                    >
                      <TooltipContent>
                        <TooltipText>{policyTips[policy]}</TooltipText>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Checkbox value={policy} colorScheme="primary">
                      <CheckboxIndicator mr="$2">
                        <CheckboxIcon />
                      </CheckboxIndicator>
                      <CheckboxLabel>{policy}</CheckboxLabel>
                    </Checkbox>
                  )
                )}
              </HStack>
            </CheckboxGroup>

            <FormControlHelper>
              <FormControlHelperText>
                Assign device policies for network access
              </FormControlHelperText>
            </FormControlHelper>
          </FormControl>

          {!props.slimView && (
            <FormControl flex={2} display={isSimpleMode ? 'none' : 'flex'}>
              <FormControlLabel>
                <FormControlLabelText>Tags</FormControlLabelText>
              </FormControlLabel>
              <CheckboxGroup
                defaultValue={tags}
                accessibilityLabel="Set Device Tags"
                onChange={(values) => setTags(values)}
                py={1}
              >
                <HStack space="md">
                  {allTags.map((tag) => (
                    <Tooltip
                      h={undefined}
                      placement="bottom"
                      trigger={(triggerProps) => {
                        return (
                          <Box {...triggerProps}>
                            <Checkbox value={tag} colorScheme="primary">
                              <CheckboxIndicator mr="$2">
                                <CheckboxIcon />
                              </CheckboxIndicator>
                              <CheckboxLabel>{tag}</CheckboxLabel>
                            </Checkbox>
                          </Box>
                        )
                      }}
                    >
                      <TooltipContent>
                        <TooltipText>{tagTips[tag] || ''}</TooltipText>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </HStack>
              </CheckboxGroup>
              <FormControlHelper>
                <FormControlHelperText>
                  Assign device tags
                </FormControlHelperText>
              </FormControlHelper>
            </FormControl>
          )}
        </VStack>

        {!props.slimView && (
          <>
            <VStack
              space="md"
              display={isSimpleMode ? 'none' : 'flex'}
              sx={{
                '@md': { flexDirection: 'row' }
              }}
            >
              <FormControl flex={1} isInvalid={'mac' in errors}>
                <FormControlLabel>
                  <FormControlLabelText>MAC Address</FormControlLabelText>
                </FormControlLabel>
                <Input size="md">
                  <InputField
                    autoComplete="new-password"
                    onChangeText={(value) => handleChange('mac', value)}
                  />
                </Input>
                {'mac' in errors ? (
                  <FormControlError>
                    <FormControlErrorIcon as={AlertCircleIcon} />
                    <FormControlErrorText>
                      format: 00:00:00:00:00:00
                    </FormControlErrorText>
                  </FormControlError>
                ) : (
                  <FormControlHelper>
                    <FormControlHelperText>
                      Optional. Will be assigned on connect if empty
                    </FormControlHelperText>
                  </FormControlHelper>
                )}
              </FormControl>

              <FormControl flex={1} isInvalid={'VLAN' in errors}>
                <FormControlLabel>
                  <FormControlLabelText>VLAN Tag ID</FormControlLabelText>
                </FormControlLabel>
                <Input size="md">
                  <InputField
                    autoComplete="new-password"
                    onChangeText={(value) => handleChange('vlan', value)}
                  />
                </Input>

                {'VLAN' in errors ? (
                  <FormControlError>
                    <FormControlErrorIcon as={AlertCircleIcon} />
                    <FormControlErrorText>format: 1234</FormControlErrorText>
                  </FormControlError>
                ) : (
                  <FormControlHelper>
                    <FormControlHelperText>
                      Only needed for Wired devices on a managed port, set VLAN
                      Tag ID
                    </FormControlHelperText>
                  </FormControlHelper>
                )}
              </FormControl>
            </VStack>

            <VStack
              space="md"
              sx={{
                '@md': { flexDirection: 'row', width: '$1/2' }
              }}
            >
              <FormControl flex={1} display={isSimpleMode ? 'none' : 'flex'}>
                <FormControlLabel>
                  <FormControlLabelText>Expiration</FormControlLabelText>
                </FormControlLabel>

                <VStack space="md" sx={{ '@md': { flexDirection: 'row' } }}>
                  <DeviceExpiry
                    value={expiration}
                    onChange={(v) => handleChange('Expiration', v)}
                  />

                  <Checkbox
                    size="md"
                    value={deleteExpiry}
                    defaultIsChecked={deleteExpiry}
                    onChange={() => setDeleteExpiry(!deleteExpiry)}
                  >
                    <CheckboxIndicator mr="$2">
                      <CheckboxIcon />
                    </CheckboxIndicator>
                    <CheckboxLabel>Delete on expiry</CheckboxLabel>
                  </Checkbox>
                </VStack>

                <FormControlHelper>
                  <FormControlHelperText>
                    {/*If non zero has unix time for when the entry should disappear*/}
                    {expiration > 0
                      ? `Expire in ${timeAgo(
                          new Date(expiration * 1e3).toUTCString()
                        )}`
                      : null}
                  </FormControlHelperText>
                </FormControlHelper>
              </FormControl>
            </VStack>
          </>
        )}

        <Button action="primary" size="md" onPress={handleSubmit}>
          <ButtonText>Save</ButtonText>
        </Button>
      </VStack>
    </VStack>
  )
}

export default AddDevice
