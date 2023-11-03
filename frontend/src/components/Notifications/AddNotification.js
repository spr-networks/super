import React, { useEffect, useState } from 'react'

import {
  Button,
  ButtonText,
  FormControl,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  Switch,
  HStack,
  VStack
} from '@gluestack-ui/themed'

import { Select } from 'components/Select'

const AddNotifcation = ({ onSubmit, ...props }) => {
  const [Prefix, setPrefix] = useState('nft:wan:out')
  const [Protocol, setProtocol] = useState('tcp')

  const [DstIP, setDstIP] = useState('')
  const [DstPort, setDstPort] = useState('')

  const [SrcIP, setSrcIP] = useState('')
  const [SrcPort, setSrcPort] = useState('')

  const [Notification, setNotification] = useState(true)

  const handleSubmit = () => {
    let item = {
      Conditions: {
        Prefix,
        Protocol,
        DstIP,
        DstPort: Number(DstPort),
        SrcIP,
        SrcPort: Number(SrcPort)
      },
      Notification
    }

    onSubmit(item)
  }

  let prefixOptions = [
    { value: '', label: 'Everything' },
    { value: 'nft:wan:out', label: 'WAN out' },
    { value: 'nft:wan:in', label: 'WAN in' },

    { value: 'nft:lan:out', label: 'LAN out' },
    { value: 'nft:lan:in', label: 'LAN in' },

    { value: 'nft:drop:input', label: 'drop input' },
    { value: 'nft:drop:forward', label: 'drop forward' },
    { value: 'nft:drop:pfw', label: 'drop pfw' },

    { value: 'nft:bridge:in', label: 'bridge in' },
    { value: 'nft:drop:bridge', label: 'drop bridge' }
  ]

  useEffect(() => {
    if (Prefix == '') {
      setProtocol('')
    } else {
      setProtocol('tcp')
    }
  }, [Prefix])

  return (
    <VStack space="md">
      <HStack space="md">
        <FormControl flex={2}>
          <FormControlLabel>
            <FormControlLabelText>Prefix</FormControlLabelText>
          </FormControlLabel>
          <Select
            selectedValue={Prefix}
            onValueChange={setPrefix}
            accessibilityLabel={'Choose netfilter prefix'}
          >
            {prefixOptions.map((opt) => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                label={opt.label}
              />
            ))}
          </Select>
          <FormControlHelper>
            <FormControlHelperText>
              Log prefix in Netfilter
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Protocol</FormControlLabelText>
          </FormControlLabel>
          <Select
            selectedValue={Protocol}
            onValueChange={setProtocol}
            accessibilityLabel={'Choose protocol'}
          >
            <Select.Item value={''} label={'None'} />
            <Select.Item value={'tcp'} label={'TCP'} />
            <Select.Item value={'udp'} label={'UDP'} />
          </Select>
          {/*<FormControlHelperText>Protocol</FormControlHelperText>*/}
        </FormControl>
      </HStack>
      <HStack space="md">
        <FormControl flex={2}>
          <FormControlLabel>
            <FormControlLabelText>Destination IP address</FormControlLabelText>
          </FormControlLabel>
          <Input type="text" variant="underlined">
            <InputField
              name="DstIP"
              value={DstIP}
              placeholder="1.1.1.1"
              onChangeText={(value) => setDstIP(value)}
              autoFocus
            />
          </Input>
        </FormControl>
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Destination Port</FormControlLabelText>
          </FormControlLabel>
          <Input variant="underlined">
            <InputField
              type="text"
              name="DstPort"
              value={DstPort}
              onChangeText={(value) => setDstPort(value)}
              autoFocus
            />
          </Input>
        </FormControl>
      </HStack>
      <HStack space="md">
        <FormControl flex={2}>
          <FormControlLabel>
            <FormControlLabelText>Source IP address</FormControlLabelText>
          </FormControlLabel>
          <Input type="text" variant="underlined">
            <InputField
              name="SrcIP"
              value={SrcIP}
              placeholder="192.168.2.X"
              onChangeText={(value) => setSrcIP(value)}
              autoFocus
            />
          </Input>
        </FormControl>
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Source Port</FormControlLabelText>
          </FormControlLabel>
          <Input type="text" variant="underlined">
            <InputField
              name="SrcPort"
              value={SrcPort}
              onChangeText={(value) => setSrcPort(value)}
              autoFocus
            />
          </Input>
        </FormControl>
      </HStack>
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Enable Notification</FormControlLabelText>
        </FormControlLabel>
        <Switch
          defaultIsChecked={Notification}
          value={Notification}
          onValueChange={() => setNotification(!Notification)}
        />
      </FormControl>
      <Button action="primary" size="md" onPress={handleSubmit}>
        <ButtonText>Save</ButtonText>
      </Button>
    </VStack>
  )
}

export default AddNotifcation
