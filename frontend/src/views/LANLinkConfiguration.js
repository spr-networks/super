/*
  TBD -
    configure a bonded interface
      set load balancing, failover
      test failover
*/
import React, { useContext, useEffect, useState } from 'react'
import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonText,
  Checkbox,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  FlatList,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Heading,
  HStack,
  Icon,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContent,
  ModalCloseButton,
  ModalHeader,
  Text,
  VStack,
  ScrollView,
  CloseIcon,
  ThreeDotsIcon
} from '@gluestack-ui/themed'

import { wifiAPI, api } from 'api'
import { AlertContext } from 'AppContext'
import { Address4 } from 'ip-address'

import { Select } from 'components/Select'
import { ListHeader, ListItem } from 'components/List'

const LANLinkSetConfig = ({ iface, onSubmit, ...props }) => {
  const type = 'config'
  const context = useContext(AlertContext)

  const [item, setItem] = useState({
    Type: 'Downlink'
  })

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
    <VStack space="lg">
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Update Interface</FormControlLabelText>
        </FormControlLabel>

        <Checkbox value={enable} onChange={setEnable} defaultIsChecked>
          <CheckboxIndicator mr="$2">
            <CheckboxIcon />
          </CheckboxIndicator>
          <CheckboxLabel>Enabled</CheckboxLabel>
        </Checkbox>
      </FormControl>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Set Interface Type</FormControlLabelText>
        </FormControlLabel>
        <Select
          selectedValue={item.Type}
          onValueChange={(Type) => setItem({ ...item, Type })}
        >
          {validTypes.map((opt) => (
            <Select.Item key={opt.value} label={opt.label} value={opt.value} />
          ))}
        </Select>
      </FormControl>

      <Button action="primary" onPress={() => doSubmit(item)}>
        <ButtonText>Save</ButtonText>
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

  const [showModal, setShowModal] = useState(false)
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

  const trigger = (triggerProps) => (
    <Button variant="link" ml="auto" {...triggerProps}>
      <ThreeDotsIcon />
    </Button>
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
          count++
        }
      }
    }
    if (count == ips.length) return true
    return false
  }

  const moreMenu = (iface) => (
    <Button
      variant="link"
      ml="auto"
      onPress={() => {
        setIface(iface)
        setModal('config')
        setShowModal(true)
      }}
    >
      <ThreeDotsIcon />
    </Button>
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

  return (
    <ScrollView h="$full">
      <VStack space="md" sx={{ '@md': { maxWidth: '$3/4' } }}>
        <ListHeader title="LAN Link Configuration" />

        <VStack space="sm" px="$4">
          <Text size="sm" color="$muted500">
            Note: API support for multiple wired LAN interfaces is an upcoming
            feature.
          </Text>
          <Text size="sm" color="$muted500">
            For now, ensure the wired LAN is synchronized with the
            config/base/config.sh LANIF entry.
          </Text>
        </VStack>

        <FlatList
          data={lanLinks}
          keyExtractor={(item) => `${item.Interface}_${item.Type}`}
          renderItem={({ item }) => (
            <ListItem>
              <Text flex={2} size="sm" bold>
                {item.Interface}
              </Text>
              <VStack flex={1} space="sm">
                <Text size="sm">{item.Type}</Text>
                <Text size="sm" color="$muted500">
                  {item.Subtype}
                </Text>
              </VStack>
              <VStack flex={1} space="sm">
                {truncateSupernetIps(item.IPs)
                  ? supernets.map((net) => <Text size="sm">{net}</Text>)
                  : item.IPs.map((ip) => (
                      <Text size="sm" key={ip}>
                        {ip}
                      </Text>
                    ))}
              </VStack>
              <HStack flex={1}>
                {item.Enabled ? (
                  <Badge action="success" variant="outline" size="sm">
                    <BadgeText>Enabled</BadgeText>
                  </Badge>
                ) : null}
              </HStack>
              {moreMenu(item.Interface)}
            </ListItem>
          )}
        />

        <FlatList
          data={links}
          keyExtractor={(item) => `${item.Interface}_${item.Type}`}
          renderItem={({ item }) => (
            <ListItem>
              <Text flex={2} size="sm" bold>
                {item.Interface}
              </Text>
              <VStack flex={1} space="sm">
                <Text size="sm">{item.Type}</Text>
              </VStack>
              <VStack flex={2} space="sm">
                {truncateSupernetIps(item.IPs)
                  ? supernets.map((net) => <Text size="sm">{net}</Text>)
                  : item.IPs.map((ip) => (
                      <Text size="sm" key={ip}>
                        {ip}
                      </Text>
                    ))}
              </VStack>
              {moreMenu(item.Interface)}
            </ListItem>
          )}
        />

        <Modal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false)
          }}
        >
          <ModalBackdrop />
          <ModalContent>
            <ModalHeader>
              <Heading size="sm">
                {iface ? `Configure ${iface}` : 'Configure interface'}
              </Heading>
              <ModalCloseButton>
                <Icon as={CloseIcon} />
              </ModalCloseButton>
            </ModalHeader>
            <ModalBody pb="$6">
              {iface && modal == 'config' ? (
                <LANLinkSetConfig iface={iface} onSubmit={onSubmit} />
              ) : null}
            </ModalBody>
          </ModalContent>
        </Modal>
      </VStack>
    </ScrollView>
  )
}

export default LANLinkInfo
