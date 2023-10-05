/*
  TBD -
    configure a bonded interface
      set load balancing, failover
      test failover
*/
import React, { useContext, useEffect, useRef, useState } from 'react'
import {
  Badge,
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
  Radio,
  Checkbox
} from 'native-base'

import Icon from 'FontAwesomeUtils'

import { faEllipsis, faTag } from '@fortawesome/free-solid-svg-icons'

import { wifiAPI, api } from 'api'
import { AlertContext } from 'AppContext'
import { ucFirst } from 'utils'
import { Address4 } from 'ip-address'

import { Select } from 'components/Select'
import InputSelect from 'components/InputSelect'

const LANLinkSetConfig = ({ iface, onSubmit, ...props }) => {
  const type = 'config'
  const context = useContext(AlertContext)

  const [item, setItem] = useState({
    Type: 'Downlink'
  })

  const [errors, setErrors] = useState({})

  const [enable, setEnable] = useState(true)

  const validate = () => {
    if (
      item.Type != 'Other' &&
      item.Type != 'Downlink' &&
      item.Type != 'VLAN'
    ) {
      context.error('Failed to validate Type')
      return false
    }

    return true
  }

  const doSubmit = (item) => {
    validate() ? onSubmit(item, type, enable) : null
  }

  let validTypes = [
    { label: 'Downlink', value: 'Downlink' },
    { label: 'VLAN Trunk Port', value: 'VLAN' },
    { label: 'Other', value: 'Other' }
  ]

  return (
    <VStack space={4}>
      <FormControl>
        <FormControl.Label>Update Interface</FormControl.Label>
        <FormControl>
          <Checkbox
            size="sm"
            colorScheme="primary"
            value={enable}
            onChange={(value) => {
              setEnable(value)
            }}
            defaultIsChecked
          >
            Enabled
          </Checkbox>
        </FormControl>
        <FormControl>
          <FormControl.Label>Set Interface Type</FormControl.Label>
          <Select
            selectedValue={item.Type}
            onValueChange={(Type) => setItem({ ...item, Type })}
          >
            {validTypes.map((opt) => (
              <Select.Item
                key={opt.value}
                label={opt.label}
                value={opt.value}
              />
            ))}
          </Select>
        </FormControl>
      </FormControl>
      <Button colorScheme="primary" onPress={() => doSubmit(item)}>
        Save
      </Button>
    </VStack>
  )
}

const LANLinkInfo = (props) => {
  const context = useContext(AlertContext)

  const [interfaces, setInterfaces] = useState({})
  const [linkIPs, setLinkIPs] = useState({})
  const [links, setLinks] = useState([])
  const [lanLinks, setLanLinks] = useState([])

  const [iface, setIface] = useState(null)

  const [modal, setModal] = useState('')
  const [supernets, setSupernets] = useState([])

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

      api.get('/subnetConfig').then((config) => {
        setSupernets(config.TinyNets)
      })

  }

  useEffect(() => {
    calcLinks()
  }, [interfaces, linkIPs])

  useEffect(() => {
    fetchInfo()
  }, [])

  const calcLinks = () => {
    //calculate uplink ips
    let lanlinks = []
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
        interfaces[link].Type != 'AP' &&
        interfaces[link].Type != 'Uplink'
      ) {
        let entry = {
          Interface: link,
          Enabled: interfaces[link].Enabled,
          IPs: linkIPs[link].sort(),
          Type: interfaces[link].Type,
          Subtype: interfaces[link].Subtype
        }
        lanlinks.push(entry)
      } else {
        let type = 'Other'
        if (interfaces[link] && interfaces[link].Type) {
          type = interfaces[link].Type
        }
        let entry = { Interface: link, IPs: linkIPs[link].sort(), Type: type }
        links.push(entry)
      }
    }
    setLanLinks(lanlinks)
    setLinks(links)
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

  const truncateSupernetIps = (ips) => {
    if (ips.length < 3) return false
    let count = 0
    //check if ips all belong in supernets
    for (let ip of ips) {
      let local_addr = new Address4(ip)
      for (let subnet of supernets) {
        let sub_addr = new Address4(subnet)
        if (local_addr.isInSubnet(sub_addr)) {
          count++;
        }
      }
    }
    if (count == ips.length)
      return true
    return false
  }

  const moreMenu = (iface) => (
    <IconButton
      variant="unstyled"
      ml="auto"
      onPress = {setModal('config')}
      icon={<Icon icon={faEllipsis} color="muted.600" />}
    ></IconButton>
  )

  const onSubmit = (item, type, enable) => {
    //

    let new_entry

    if (type == 'config') {
      new_entry = { ...item, Name: iface, Enabled: enable }
    } else {
      context.error('Unknown type ' + type)
      return
    }

    let state = 'disable'
    if (new_entry.Type == 'VLAN') {
      state = 'enable'
      new_entry.Type = 'Downlink'
    }

    //update link info
    api
      .put(`/link/${type}`, new_entry)
      .then((res2) => {
        fetchInfo()
        onClose()
      })
      .catch((err) => {
        context.error(err)
        onClose()
      })

    //update VLAN Subtype
    api
      .put(`link/vlan/${iface}/${state}`)
      .then((res2) => {
        fetchInfo()
        onClose()
      })
      .catch((err) => {
        context.error(err)
        onClose()
      })
  }

  const color_scheme = useColorModeValue('muted', 'blueGray')

  return (
    <ScrollView h={'100%'}>
      <VStack space={2}>
        <VStack p={4} space={1}>
          <Heading fontSize="md">LAN Link Configuration</Heading>
          <Text fontSize="sm" color="muted.400">
            Note: API support for multiple wired LAN interfaces is an upcoming
            feature.
          </Text>
          <Text fontSize="sm" color="muted.400">
            For now, ensure the wired LAN is synchronized with the
            config/base/config.sh LANIF entry.
          </Text>
        </VStack>

        <VStack
          mx={{ base: 0, md: 4 }}
          width={{ base: '100%', md: '75%' }}
          bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        >
          <FlatList
            data={lanLinks}
            keyExtractor={(item) => `${item.Interface}_${item.Type}`}
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
                <Text flex={1}>{item.Subtype}</Text>
                <VStack flex={2} space={1}>
                { (truncateSupernetIps(item.IPs)) ?
                  supernets.map((net) => (
                    <Text>{net}</Text>
                  ))

                   : item.IPs.map((ip) => (
                  <Text key={ip}>{ip}</Text>
                  ))
                }
                </VStack>
                {item.Enabled ? (
                  <Badge
                    key={item.Name}
                    variant="outline"
                    colorScheme={color_scheme}
                    rounded="sm"
                    size="sm"
                    py={1}
                    px={2}
                  >
                    Enabled
                  </Badge>
                ) : null}
                <Box flex={1}>{moreMenu(item.Interface)}</Box>
              </HStack>
            )}
          />
        </VStack>

        <VStack
          mx={{ base: 0, md: 4 }}
          width={{ base: '100%', md: '75%' }}
          bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
          _space={2}
        >
          <FlatList
            data={links}
            keyExtractor={(item) => `${item.Interface}_${item.Type}`}
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
                <Text flex={3} fontWeight="bold">
                  {item.Interface}
                </Text>
                <Text flex={1}>{item.Type}</Text>
                {/*<Text flex={1}>{item.Enabled}</Text>*/}
                <VStack flex={2} space={1}>
                  { (truncateSupernetIps(item.IPs)) ?
                    supernets.map((net) => (
                      <Text>{net}</Text>
                    ))

                     : item.IPs.map((ip) => (
                    <Text key={ip}>{ip}</Text>
                    ))
                  }
                </VStack>
                <Box flex={1}>{moreMenu(item.Interface)}</Box>
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
                {iface && modal == 'config' ? (
                  <LANLinkSetConfig iface={iface} onSubmit={onSubmit} />
                ) : null}
              </Modal.Body>
            </Modal.Content>
          </Modal>
        </VStack>
      </VStack>
    </ScrollView>
  )
}

export default LANLinkInfo
