import React, { useContext, useState } from 'react'
import PropTypes from 'prop-types'

import {
  Button,
  ButtonText,
  FormControl,
  FormControlError,
  FormControlErrorText,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  VStack
} from '@gluestack-ui/themed'

import { AlertContext } from 'layouts/Admin'
import { CoreDNS } from 'api/CoreDNS'

const labelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const octet = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const ipv4Pattern = new RegExp(`^${octet}(\\.${octet}){3}$`)

export const normalizeHostname = (value) => {
  let hostname = value.trim().toLowerCase().replace(/\.$/, '')
  if (hostname && !hostname.includes('.')) {
    hostname += '.lan'
  }
  return hostname
}

export const isReservedHostname = (hostname) =>
  hostname == 'spr.lan' || hostname.endsWith('.spr.lan')

const hostnameError = (hostname) => {
  if (!hostname) {
    return 'Enter a name'
  }
  if (
    hostname.length > 253 ||
    !hostname.split('.').every((label) => labelPattern.test(label))
  ) {
    return 'Use letters, numbers and hyphens, like nas or nas.lan'
  }
  if (isReservedHostname(hostname)) {
    return 'This name is reserved for SPR'
  }
  return null
}

export const hostnameErrorMessage = async (error, editing) => {
  if (error?.status == 403) {
    return 'This name is reserved for SPR'
  }
  if (error?.status == 409) {
    return editing
      ? 'This record changed since the list loaded. Refresh and try again.'
      : 'A record with this name already exists'
  }
  let text = ''
  try {
    text = (await error?.response?.text()) || ''
  } catch (e) {}
  return text.trim() || `${error?.message || error}`
}

const DNSHostnameForm = ({ item, notifyChange }) => {
  const context = useContext(AlertContext)
  const [hostname, setHostname] = useState(item?.Hostname || '')
  const [ip, setIP] = useState(item?.IPAddress || '')
  const [submitted, setSubmitted] = useState(false)

  const name = normalizeHostname(hostname)
  const nameError = item ? null : hostnameError(name)
  const ipError = ipv4Pattern.test(ip.trim()) ? null : 'Enter an IPv4 address'

  const handleSubmit = () => {
    setSubmitted(true)
    if (nameError || ipError) {
      return
    }

    let request = item
      ? { IPAddress: ip.trim(), PreviousIPAddress: item.IPAddress }
      : { IPAddress: ip.trim(), CreateOnly: true }

    CoreDNS.putHostname(item ? item.Hostname : name, request)
      .then(() => notifyChange())
      .catch(async (error) => {
        context.error(
          'Could not save hostname',
          await hostnameErrorMessage(error, !!item)
        )
      })
  }

  return (
    <VStack space="md">
      <FormControl isInvalid={submitted && !!nameError} isDisabled={!!item}>
        <FormControlLabel>
          <FormControlLabelText>Name</FormControlLabelText>
        </FormControlLabel>
        <Input variant="underlined">
          <InputField
            value={hostname}
            placeholder="nas"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setHostname}
            onSubmitEditing={handleSubmit}
          />
        </Input>
        {submitted && nameError ? (
          <FormControlError>
            <FormControlErrorText>{nameError}</FormControlErrorText>
          </FormControlError>
        ) : item || name ? (
          <FormControlHelper>
            <FormControlHelperText>
              {item
                ? 'To use a different name, add a new record'
                : `Resolves as ${name}`}
            </FormControlHelperText>
          </FormControlHelper>
        ) : null}
      </FormControl>

      <FormControl isInvalid={submitted && !!ipError}>
        <FormControlLabel>
          <FormControlLabelText>IP Address</FormControlLabelText>
        </FormControlLabel>
        <Input variant="underlined">
          <InputField
            value={ip}
            placeholder="192.168.2.50"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            onChangeText={setIP}
            onSubmitEditing={handleSubmit}
          />
        </Input>
        {submitted && ipError ? (
          <FormControlError>
            <FormControlErrorText>{ipError}</FormControlErrorText>
          </FormControlError>
        ) : null}
      </FormControl>

      <Button action="primary" onPress={handleSubmit}>
        <ButtonText>Save</ButtonText>
      </Button>
    </VStack>
  )
}

DNSHostnameForm.propTypes = {
  item: PropTypes.object,
  notifyChange: PropTypes.func.isRequired
}

export default DNSHostnameForm
