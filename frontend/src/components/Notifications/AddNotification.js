import React, { useEffect, useState } from 'react'

import {
  Box,
  FormControl,
  Input,
  Select,
  Stack,
  Switch,
  Button,
  HStack
} from 'native-base'

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
    <Stack space={4}>
      <HStack space={4}>
        <FormControl flex={2}>
          <FormControl.Label>Prefix</FormControl.Label>
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
          <FormControl.HelperText>
            Log prefix in Netfilter
          </FormControl.HelperText>
        </FormControl>
        <FormControl flex={1}>
          <FormControl.Label>Protocol</FormControl.Label>
          <Select
            selectedValue={Protocol}
            onValueChange={setProtocol}
            accessibilityLabel={'Choose protocol'}
          >
            <Select.Item value={''} label={'None'} />
            <Select.Item value={'tcp'} label={'TCP'} />
            <Select.Item value={'udp'} label={'UDP'} />
          </Select>
          {/*<FormControl.HelperText>Protocol</FormControl.HelperText>*/}
        </FormControl>
      </HStack>
      <HStack space={4}>
        <FormControl flex={2}>
          <FormControl.Label>Destination IP address</FormControl.Label>
          <Input
            type="text"
            variant="underlined"
            name="DstIP"
            value={DstIP}
            placeholder="1.1.1.1"
            onChangeText={(value) => setDstIP(value)}
            autoFocus
          />
        </FormControl>
        <FormControl flex={1}>
          <FormControl.Label>Destination Port</FormControl.Label>
          <Input
            type="text"
            variant="underlined"
            name="DstPort"
            value={DstPort}
            onChangeText={(value) => setDstPort(value)}
            autoFocus
          />
        </FormControl>
      </HStack>
      <HStack space={4}>
        <FormControl flex={2}>
          <FormControl.Label>Source IP address</FormControl.Label>
          <Input
            type="text"
            variant="underlined"
            name="SrcIP"
            value={SrcIP}
            placeholder="192.168.2.X"
            onChangeText={(value) => setSrcIP(value)}
            autoFocus
          />
        </FormControl>
        <FormControl flex={1}>
          <FormControl.Label>Source Port</FormControl.Label>
          <Input
            type="text"
            variant="underlined"
            name="SrcPort"
            value={SrcPort}
            onChangeText={(value) => setSrcPort(value)}
            autoFocus
          />
        </FormControl>
      </HStack>
      <FormControl>
        <FormControl.Label>Enable Notification</FormControl.Label>
        <Switch
          defaultIsChecked={Notification}
          onValueChange={() => setNotification(!Notification)}
        />
      </FormControl>
      <Button color="primary" size="md" onPress={handleSubmit}>
        Save
      </Button>
    </Stack>
  )
}

export default AddNotifcation
