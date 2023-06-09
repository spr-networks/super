/*
  TBD -
    configure wlan0 as uplink

    configure ppp

    configure a bonded interface
      set load balancing, failover
      test failover
*/
import React, { useContext, useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  Input,
  FlatList,
  FormControl,
  Modal,
  Menu,
  Stack,
  Text,
  View,
  VStack,
  ScrollView,
  useDisclose,
  useColorModeValue,
  Select,
  Radio,
  Checkbox
} from 'native-base'
import Icon from 'FontAwesomeUtils'

import { faEllipsis } from '@fortawesome/free-solid-svg-icons'

import { wifiAPI, api } from 'api'
import { AlertContext } from 'AppContext'
import { ucFirst } from 'utils'

import InputSelect from 'components/InputSelect'

let keymgmts = [
  { value: 'WPA-PSK WPA-PSK-SHA256', label: 'WPA2' },
  { value: 'WPA-PSK WPA-PSK-SHA256 SAE', label: 'WPA3' }
]

const UplinkAdd = ({ iface, onSubmit, ...props }) => {
  const [item, setItem] = useState({})
  const [ssids, setSSIDs] = useState([])
  const [optSSIDs, setOptsSSIDs] = useState([])

  const handleChangeSSID = (SSID) => {
    let ssidItem = ssids.find((item) => item.ssid == SSID)
    let BSSID = ssidItem ? ssidItem.bssid : ''
    let KeyMgmt = 'WPA-PSK WPA-PSK-SHA256'

    if (ssidItem.authentication_suites.includes('SAE')) {
      KeyMgmt = 'WPA-PSK WPA-PSK-SHA256 SAE'
    }

    setItem({ ...item, SSID, BSSID, KeyMgmt })
  }

  const scan = (iface) => {
    setOptsSSIDs([{ label: 'Scanning...', value: null }])

    //set interface up and scan
    wifiAPI.ipLinkState(iface, 'up').then(
      wifiAPI.iwScan(iface).then((scanList) => {
        setSSIDs(scanList)
      })
    )
  }

  useEffect(() => {
    if (ssids && ssids.length) {
      setOptsSSIDs(
        ssids.map((item) => {
          return { label: item.ssid, value: item.ssid }
        })
      )
    }
  }, [ssids])

  useEffect(() => {
    //defaults
    setItem({
      Disabled: true,
      Password: '',
      SSID: '',
      KeyMgmt: 'WPA-PSK WPA-PSK-SHA256 SAE',
      Priority: '1', // TODO ui component for this
      BSSID: '',
      Iface: iface
    })

    // scan on init
    if (iface != null) {
      scan(iface)
    }
  }, [])

  return (
    <VStack space={4}>
      <FormControl>
        <FormControl.Label>SSID</FormControl.Label>
        <InputSelect
          options={optSSIDs}
          value={item.SSID}
          onChange={handleChangeSSID}
        />
      </FormControl>
      <FormControl>
        <FormControl.Label>BSSID</FormControl.Label>
        <Input
          variant="underlined"
          placeholder="BSSID Optional"
          value={item.BSSID}
          onChangeText={(BSSID) => setItem({ ...item, BSSID })}
          autoFocus
        />
      </FormControl>
      <FormControl>
        <FormControl.Label>Auth</FormControl.Label>
        <Select
          selectedValue={item.KeyMgmt}
          onValueChange={(KeyMgmt) => setItem({ ...item, KeyMgmt })}
        >
          {keymgmts.map((opt) => (
            <Select.Item key={opt.value} label={opt.label} value={opt.value} />
          ))}
        </Select>
      </FormControl>
      <FormControl>
        <FormControl.Label>Password</FormControl.Label>
        <Input
          variant="underlined"
          type="password"
          autoComplete="off"
          autoCorrect="off"
          placeholder="Password..."
          value={item.Password}
          onChangeText={(Password) => setItem({ ...item, Password })}
          autoFocus
        />
      </FormControl>

      <FormControl>
        <FormControl.Label>Priority</FormControl.Label>
        <Input
          variant="underlined"
          keyboardType="numeric"
          autoComplete="off"
          autoCorrect="off"
          placeholder="Priority"
          value={item.Priority}
          onChangeText={(value) =>
            setItem({ ...item, Priority: value.replace(/[^\d+]+/, '') })
          }
          autoFocus
        />
      </FormControl>

      <FormControl>
        <FormControl.Label>Status</FormControl.Label>

        <Checkbox
          size="sm"
          colorScheme="primary"
          value={!item.Disabled}
          onChange={(Enabled) => setItem({ ...item, Disabled: !Enabled })}
        >
          Enabled
        </Checkbox>
      </FormControl>

      <Button colorScheme="primary" onPress={() => onSubmit(item)}>
        Save
      </Button>
    </VStack>
  )
}

const UplinkInfo = (props) => {
  const context = useContext(AlertContext)

  const [interfaces, setInterfaces] = useState({})
  const [linkIPs, setLinkIPs] = useState({})

  const [iface, setIface] = useState(null)

  function isLocalIpAddress(ipAddress) {
    const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/
    const ipv6Regex = /([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}/

    const ipv4LocalRanges = [/^127\./]

    const ipv6LocalRanges = [/^fc00:/, /^fd/, /^fe80:/, /^::1$/]

    if (ipv4Regex.test(ipAddress)) {
      return ipv4LocalRanges.some((range) => range.test(ipAddress))
    }

    if (ipv6Regex.test(ipAddress)) {
      return ipv6LocalRanges.some((range) => range.test(ipAddress))
    }

    throw new Error('The string is not a valid IP address.')
  }

  useEffect(() => {
    const fetchInfo = () => {
      wifiAPI
        .ipAddr()
        .then((ifaces) => {
          let x = {}
          for (let iface of ifaces) {
            let ips = []
            for (let addr_info of iface.addr_info) {
              if (addr_info.family == 'inet' || addr_info.family == 'inet6') {
                if (addr_info.scope == 'global') {
                  ips.push(addr_info.local)
                }
              }
            }
            x[iface.ifname] = ips
          }
          setLinkIPs(x)
        })
        .catch((err) => context.error('fail ' + err))

      wifiAPI
        .interfacesConfiguration()
        .then((ifaces) => {
          let x = {}
          for (let iface of ifaces) {
            x[iface.Name] = iface
          }
          setInterfaces(x)
        })
        .catch((err) => context.error(err))
    }

    fetchInfo()
  }, [])

  //calculate uplink ips
  let uplinks = []
  let links = []
  let filtered = ['lo', 'sprloop', 'wg0', 'docker0']
  let k = Object.keys(linkIPs)
  k.sort()
  for (let link of k) {
    if (filtered.includes(link)) {
      continue
    }
    //check if its in the interfaces configuration
    if (
      interfaces[link] &&
      (interfaces[link].Type == 'Uplink' || interfaces[link].Type == 'Bonded')
    ) {
      let entry = {
        Interface: link,
        IPs: linkIPs[link],
        Type: interfaces[link].Type
      }
      uplinks.push(entry)
    } else {
      let type = 'Other'
      if (interfaces[link] && interfaces[link].Type) {
        type = interfaces[link].Type
      }
      let entry = { Interface: link, IPs: linkIPs[link], Type: type }
      links.push(entry)
    }
  }

  const { isOpen, onOpen, onClose } = useDisclose()

  const trigger = (triggerProps) => (
    <IconButton
      variant="unstyled"
      ml="auto"
      icon={<Icon icon={faEllipsis} color="muted.600" />}
      {...triggerProps}
    ></IconButton>
  )

  const moreMenu = (iface) => (
    <Menu w={190} closeOnSelect={true} trigger={trigger}>
      <Menu.Item
        onPress={() => {
          setIface(iface)
          onOpen()
        }}
      >
        Modify Interface
      </Menu.Item>
    </Menu>
  )

  const onSubmit = (item) => {
    console.log('save:', item)
    //TODO verify endpoint is available
    api
      .put('/uplink/wifi', { WPAs: [item] })
      .then((res) => onClose())
      .catch((err) => {
        context.error(err)
        onClose()
      })
  }

  return (
    <ScrollView h={'100%'}>
      <VStack space={2}>
        <HStack p={4}>
          <Heading fontSize="md">Uplink Configuration</Heading>
        </HStack>

        {/* for each uplink, display a pleasant table with the interface name and the ip address*/}

        <VStack
          mx={{ base: 0, md: 4 }}
          width={{ base: '100%', md: '50%' }}
          bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
          _space={2}
        >
          <FlatList
            data={uplinks}
            renderItem={({ item }) => (
              <HStack
                p={4}
                rounded="md"
                alignItems="center"
                justifyContent={'space-between'}
                borderBottomWidth={1}
                _dark={{
                  bg: 'backgroundCardDark',
                  borderColor: 'borderColorCardDark'
                }}
                borderColor="borderColorCardLight"
              >
                <Text flex={1} fontWeight="bold">
                  {item.Interface}
                </Text>
                <Text flex={1}>{item.Type}</Text>
                <Text flex={1}>{item.IPs}</Text>
                <Box flex={1}>
                  {item.Interface.match(/^wlan/)
                    ? moreMenu(item.Interface)
                    : null}
                </Box>
              </HStack>
            )}
          />
        </VStack>

        <HStack p={4}>
          <Heading fontSize="md">Interfaces</Heading>
        </HStack>
        <VStack
          mx={{ base: 0, md: 4 }}
          width={{ base: '100%', md: '50%' }}
          bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
          _space={2}
        >
          <FlatList
            data={links}
            renderItem={({ item }) => (
              <HStack
                p={4}
                rounded="md"
                alignItems="center"
                borderBottomWidth={1}
                _dark={{
                  borderColor: 'borderColorCardDark'
                }}
                borderColor="borderColorCardLight"
              >
                <Text flex={1} fontWeight="bold">
                  {item.Interface}
                </Text>
                <Text flex={1}>{item.Type}</Text>
                <Text flex={1}>{item.IPs}</Text>
                <Box flex={1}></Box>
              </HStack>
            )}
          />

          <Modal isOpen={isOpen} onClose={onClose}>
            <Modal.Content>
              <Modal.CloseButton />
              <Modal.Header fontSize="4xl" fontWeight="bold">
                {iface ? `Configure ${iface}` : 'Configure interface'}
              </Modal.Header>
              <Modal.Body>
                {iface ? <UplinkAdd iface={iface} onSubmit={onSubmit} /> : null}
              </Modal.Body>
            </Modal.Content>
          </Modal>
        </VStack>
      </VStack>
    </ScrollView>
  )
}

export default UplinkInfo
