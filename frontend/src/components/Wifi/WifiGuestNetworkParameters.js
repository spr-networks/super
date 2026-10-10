import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { AlertContext } from 'AppContext'
import { normalizeTextInput } from 'utils/normalizeTextInput'

import {
  Button,
  ButtonIcon,
  ButtonText,
  Checkbox,
  CheckboxGroup,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  FormControl,
  FormControlError,
  FormControlErrorText,
  FormControlErrorIcon,
  FormControlLabel,
  FormControlLabelText,
  Heading,
  Input,
  HStack,
  VStack,
  Text,
  InputField,
  CheckIcon
} from '@gluestack-ui/themed'

import { EyeIcon } from 'lucide-react-native'

import { Select } from 'components/Select'
import DeviceQRCode from 'components/Devices/DeviceQRCode'

let modes = [
  { label: '5 & 6 GHz', value: 'a' },
  { label: '2.4 GHz', value: 'g' }
]

let convertChannelToFrequency = (band, channel) => {
  let frequency;

  if (band === "2.4") {
    frequency = 2412 + (channel - 1) * 5;
    if (channel === 14) {
      frequency = 2484;
    }
  } else if (band === "5") {
    if (channel >= 1 && channel <= 144) {
      frequency = 5000 + channel * 5;
    } else if (channel >= 149 && channel <= 169) {
      frequency = 5000 + (channel - 1) * 5;
    } else if (channel >= 184 && channel <= 196) {
      frequency = 4000 + channel * 5;
    }
  } else if (band === "6") {
    if (channel >= 1 && channel <= 253) {
      frequency = 5940 + channel * 5;
    }
  }

  return frequency
}

const WifiChannelParameters = ({
  iface,
  setIface,
  config,
  iws,
  regs,
  curInterface,
  onSubmit,
  updateExtraBSS,
  deleteExtraBSS,
  ...props
}) => {
  const context = useContext(AlertContext)
  const [errors, setErrors] = useState({})

  //support for additional bssid
  const [disableExtraBSS, setDisableExtraBSS] = useState(true)
  const [extraSSID, setExtraSSID] = useState('-guest')

  const [guestPassword, setGuestPassword] = useState('')
  const [uipasswordType, setUIPasswordType] = useState('password')


  const [selectedMode, setSelectedMode] = useState(modes[0])
  const [groupValues, setGroupValues] = useState(['wpa2', 'wpa3', 'guestpass'])

  const handleGroupChange = (values) => {
    // Text input changes can also reach CheckboxGroup on iOS. Only checkbox
    // selections should replace the array used throughout this form.
    if (Array.isArray(values)) setGroupValues(values)
  }

  const extra = curInterface?.ExtraBSS?.length === 1
    ? curInterface.ExtraBSS[0]
    : null
  const hasSavedExtra = extra !== null
  const savedSSID = extra?.Ssid
  const savedPassword = extra?.GuestPassword || ''
  const savedWpa = extra?.Wpa
  const savedWpaKeyMgmt = extra?.WpaKeyMgmt

  useEffect(() => {
    // Incoming interface/radio data can arrive while the user is typing. Only
    // load the form when the saved guest configuration actually changes.
    if (hasSavedExtra) {
      setExtraSSID(savedSSID)
      setGuestPassword(savedPassword)

      let values = ['guest_enabled']
      if (savedWpa == '0') {
        values.push('wpa_open')
      } else if (savedWpa == '1') {
        values.push('wpa1')
      } else {
        values.push('wpa2')
        if (savedWpaKeyMgmt?.includes('SAE')) {
          values.push('wpa3')
        }
      }
      if (savedWpa != '0' && savedPassword) {
        values.push('guestpass')
      }
      setGroupValues(values)
    } else {
      setExtraSSID(config.ssid + '-guest')
      setGuestPassword('')
      setGroupValues(['wpa2', 'wpa3', 'guestpass'])
    }

  }, [iface, config.ssid, hasSavedExtra, savedSSID, savedPassword, savedWpa, savedWpaKeyMgmt])

  useEffect(() => {
    let canAddGuest = false
    for (let iw of iws) {
      if (iw.devices?.[iface]) {
        let cur_device = iw.devices[iface]
        if (!cur_device) continue

        //check if valid_interface_combinations supports multiple APs
        let combos = iw.valid_interface_combinations || []
        for (let combo of combos) {
          let ap_entry = combo.split('#').filter((e) => e.includes('AP'))
          if (ap_entry[0] && ap_entry[0].includes('<=')) {
            let num_supported = parseInt(ap_entry[0].split('<=')[1])
            if (num_supported > 0) {
              canAddGuest = true
            }
          }
        }

      }
    }
    setDisableExtraBSS(!canAddGuest)
  }, [iface, iws])


  const getLLAIfaceAddr = (iface) => {
    for (let iw of iws) {
      if (iw.devices?.[iface]) {
        let base = iw.devices[iface].addr

        /*
        let updatedByte = parseInt(base.substr(0, 2), 16) | 2
        const updatedByteHex = updatedByte
          .toString(16)
          .padStart(2, '0')
          .toUpperCase()
        return updatedByteHex + base.substr(2)
        */
        return base
      }
    }
    return null
  }

  const showPassword  = () => {
    setUIPasswordType((type) => type === "password" ? "text" : "password")
  }

  const isValid = () => {
    if (groupValues.includes("guest_enabled")) {
      if (groupValues.includes("guestpass")) {
        if (guestPassword.length < 8) {
          setErrors({"password": true})
          return false
        }
      }
    }
    setErrors({})
    return true
  }

  const handleSubmit = () => {
    if (!isValid()) {
      return
    }

    let WpaKeyMgmt = ''

    if (groupValues.includes('guest_enabled')) {

      let wpa_type = '2'
      if (groupValues.includes("wpa_open")) {
        wpa_type = '0'
      } else if (groupValues.includes("wpa2") || groupValues.includes("wpa3")) {
        wpa_type = '2'
        WpaKeyMgmt = "WPA-PSK WPA-PSK-SHA256"
        if (groupValues.includes("wpa3")) {
          WpaKeyMgmt = "WPA-PSK WPA-PSK-SHA256 SAE"
        }
      } else if (groupValues.includes("wpa1")) {
        wpa_type = '1'
        WpaKeyMgmt = "WPA-PSK WPA-PSK-SHA256"
      }

      let usePass = groupValues.includes("guestpass") && !groupValues.includes("wpa_open")

      let bssid = getLLAIfaceAddr(iface)
      updateExtraBSS(iface, {
        Ssid: extraSSID,
        Bssid: bssid,
        Wpa: wpa_type,
        WpaKeyMgmt: WpaKeyMgmt,
        guestPassword: usePass ? guestPassword : ""
      })
    } else {
      //if interfaces had an extra bss then clear it out
      if (curInterface?.ExtraBSS?.length > 0) {
        deleteExtraBSS(iface)
      }
    }

  }

  let guestCheckboxProps = disableExtraBSS ? { isDisabled: true } : {}
  let wpaOpenCheckboxProps = disableExtraBSS ? { isDisabled: true } : {isDisabled: groupValues.includes("wpa1") || groupValues.includes("wpa2") || groupValues.includes("wpa3")}
  let wpa1CheckboxProps = disableExtraBSS ? { isDisabled: true } : {isDisabled: groupValues.includes("wpa2") || groupValues.includes("wpa_open") || groupValues.includes("wpa3")}
  let wpa2CheckboxProps = disableExtraBSS ? { isDisabled: true } : {isDisabled: groupValues.includes("wpa1") || groupValues.includes("wpa_open")}
  let wpa3CheckboxProps = disableExtraBSS ? { isDisabled: true } : {isDisabled: groupValues.includes("wpa1") || groupValues.includes("wpa_open")}
  let staticGuestPasswordProps = disableExtraBSS ? { isDisabled: true } : {isDisabled: groupValues.includes("wpa_open")}

  return (
    <>
      <HStack justifyContent="space-between" p="$4">
        <Heading size="sm">{config.hw_mode == 'g' ? "2.4 GHz" : "5 GHz"} Configuration</Heading>
      </HStack>

      <VStack
        space="md"
        bg="$backgroundCardLight"
        sx={{ _dark: { bg: '$backgroundCardDark' } }}
        p="$4"
        pb="$8"
      >

        <VStack
          space="md"
        >

        <CheckboxGroup
          value={groupValues}
          accessibilityLabel="WiFi Settings"
          onChange={handleGroupChange}
        >
          <HStack pb="$4" space="md">
            <Checkbox {...guestCheckboxProps} value={'guest_enabled'}>
              <CheckboxIndicator mr="$2">
                <CheckboxIcon />
              </CheckboxIndicator>
              <CheckboxLabel>Enable Guest SSID</CheckboxLabel>
            </Checkbox>
          </HStack>

          <VStack space="md">
            {groupValues.includes('guest_enabled') && (
              <>

              <Text color="$muted500">
                Configure Authentication Settings
              </Text>

            <HStack space="md" flexWrap="wrap" rowGap="$2">

            <Checkbox {...wpaOpenCheckboxProps} value={'wpa_open'}>
              <CheckboxIndicator mr="$2">
                <CheckboxIcon />
              </CheckboxIndicator>
              <CheckboxLabel>Open SSID</CheckboxLabel>
            </Checkbox>

              <Checkbox {...wpa1CheckboxProps} value={'wpa1'}>
                <CheckboxIndicator mr="$2">
                  <CheckboxIcon />
                </CheckboxIndicator>
                <CheckboxLabel>Enable WPA1 (Legacy Devices)</CheckboxLabel>
              </Checkbox>

              <Checkbox {...wpa2CheckboxProps} value={'wpa2'}>
                <CheckboxIndicator mr="$2">
                  <CheckboxIcon />
                </CheckboxIndicator>
                <CheckboxLabel>Enable WPA2</CheckboxLabel>
              </Checkbox>

              <Checkbox {...wpa3CheckboxProps} value={'wpa3'}>
                <CheckboxIndicator mr="$2">
                  <CheckboxIcon />
                </CheckboxIndicator>
                <CheckboxLabel>Enable SAE (WPA3)</CheckboxLabel>
              </Checkbox>
            </HStack>

            <Text color="$muted500">
              Configure Static Guest Password. If it is not set, per-device passwords are used
            </Text>

            <Checkbox {...staticGuestPasswordProps} value={'guestpass'}>
              <CheckboxIndicator mr="$2">
                <CheckboxIcon />
              </CheckboxIndicator>
              <CheckboxLabel>Use Static Password</CheckboxLabel>
            </Checkbox>
            </>
          )}
          </VStack>
        </CheckboxGroup>

        {groupValues.includes('guest_enabled') && (
          <VStack space="md">
            <HStack>
              <Text flex={1}> Guest SSID Name</Text>
              <Input flex={2} size="md" variant="underlined">
                <InputField
                  type="text"
                  value={extraSSID}
                  onChangeText={(value) => setExtraSSID(normalizeTextInput(value))}
                  autoComplete="off"
                />
              </Input>

            </HStack>

            {groupValues.includes("guestpass") && (
              <HStack space="md">
                <Text flex={1}> Guest Password</Text>
                <Button size="xs" action="secondary" onPress={showPassword}>
                  <ButtonIcon as={EyeIcon} ml="$1" />
                </Button>

                <FormControl flex={2} isInvalid={'password' in errors}>

                  <Input {...staticGuestPasswordProps} flex={2} size="md" variant="underlined">
                    <InputField
                      aria-label="Guest Password"
                      type={uipasswordType}
                      value={guestPassword}
                      onChangeText={(value) => setGuestPassword(normalizeTextInput(value))}
                      autoComplete="off"
                      autoCorrect={false}
                    />
                  </Input>
                  <>
                    {(uipasswordType == 'text' && guestPassword.length >= 8 && guestPassword === savedPassword && extraSSID === savedSSID) && (
                      <DeviceQRCode ssid={extraSSID} psk={guestPassword} type="WPA" />
                    )}
                  </>
                  {'password' in errors ? (
                    <FormControlError>
                      <FormControlErrorText>
                        Password too short
                      </FormControlErrorText>
                    </FormControlError>
                  ) : null}
                </FormControl>
              </HStack>
            )}

          </VStack>
        )}


        <Button
          size="md"
          action="primary"
          sx={{
            '@base': { w: '$2/3', alignSelf: 'center' },
            '@md': { w: 120, alignSelf: 'flex-end' }
          }}
          onPress={handleSubmit}
        >
          <ButtonText>Save</ButtonText>
          <ButtonIcon as={CheckIcon} ml="$1" />
        </Button>

        </VStack>

      </VStack>
    </>
  )
}

WifiChannelParameters.propTypes = {
  notifyChange: PropTypes.func
}

export default WifiChannelParameters
