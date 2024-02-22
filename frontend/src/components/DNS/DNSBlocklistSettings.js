import React, { useContext, useEffect, useState } from 'react'

import {
  Button,
  Box,
  Text,
  VStack,
  ButtonText,
  ClockIcon
} from '@gluestack-ui/themed'

import { AlertContext } from 'AppContext'
import { Select } from 'components/Select'
import { blockAPI } from 'api/DNS'

const DNSBlocklistSettings = ({ notifyChange, ...props }) => {
  const context = useContext(AlertContext)

  const [seconds, setSeconds] = useState('Weekly')

  const optMap = {
    Weekly: 24 * 7 * 60 * 60,
    Daily: 24 * 60 * 60,
    'Four Hours': 24 * 60 * 60 * 4,
    Hourly: 60 * 60
  }

  useEffect(() => {
    blockAPI.config().then((config) => {
      if (config != null) {
        if (config.RefreshSeconds != 0) {
          for (let opt of Object.keys(optMap)) {
            if (optMap[opt] == config.RefreshSeconds) {
              setSeconds(opt)
            }
          }
        }
      }
    })
  }, [])

  const onChangeText = (what, value) => {
    if (what == 'seconds') {
      setSeconds(value)
    }
  }

  const submitRefresh = (value) => {
    blockAPI
      .setRefresh(optMap[value])
      .then(() => {
        notifyChange()
      })
      .catch((err) => {
        context.error('failed to update refresh frequency') //TODO in form
      })
  }

  const options = Object.keys(optMap).map((value) => ({
    label: value,
    value,
    icon: ClockIcon
  }))

  return (
    <VStack space="md">
      <Text bold>Refresh Frequency</Text>
      <Select
        selectedValue={seconds}
        onValueChange={(v) => onChangeText('seconds', v)}
        accessibilityLabel={`Choose Refresh Frequency`}
      >
        {options.map((o) => (
          <Select.Item key={o.value} label={o.label} value={o.value} />
        ))}
      </Select>
      <Button action="primary" onPress={() => submitRefresh(seconds)}>
        <ButtonText>Save</ButtonText>
      </Button>
    </VStack>
  )
}

export default DNSBlocklistSettings

export { DNSBlocklistSettings }
