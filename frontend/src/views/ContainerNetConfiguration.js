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

const ContainerNetInfo = (props) => {
  const context = useContext(AlertContext)

  let [dockerNetmap, setDockerNetmap] = useState({})

  const [linkIPs, setLinkIPs] = useState({})
  const [links, setLinks] = useState([])
  const [lanLinks, setLanLinks] = useState([])

  const [iface, setIface] = useState(null)

  {
    /*
  const [showModal, setShowModal] = useState(false)
  const [modal, setModal] = useState('')
  */
  }

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

    api
      .get('/info/docker')
      .then((docker) => {
        let networked = docker.filter(
          (c) => c.State == 'running' && c.NetworkSettings.Networks.host == null
        )

        let netMap = {}
        for (let c of Object.values(networked)) {
          for (let network of Object.values(c.NetworkSettings.Networks)) {
            if (network.IPAddress != '') {
              if (netMap[network.Gateway] === undefined) {
                netMap[network.Gateway] = [c]
              } else {
                netMap[network.Gateway].push(c)
              }
            }
          }
        }

        setDockerNetmap(netMap)
      })
      .catch((err) => context.error('fail ' + err))
  }

  useEffect(() => {
    calcLinks()
  }, [linkIPs, dockerNetmap])

  useEffect(() => {
    fetchInfo()
  }, [])

  function getNetworkName(container, gateway) {
    if (
      container &&
      container.NetworkSettings &&
      container.NetworkSettings.Networks
    ) {
      for (const device in container.NetworkSettings.Networks) {
        if (container.NetworkSettings.Networks[device].Gateway === gateway) {
          return device
        }
      }
    }
    return null
  }

  const calcLinks = () => {
    //calculate uplink ips
    let links = []
    let filtered = ['lo', 'sprloop', 'wg0']
    let k = Object.keys(linkIPs)
    k.sort()
    for (let link of k) {
      if (filtered.includes(link)) {
        continue
      }

      if (link == 'docker0') {
        let type = 'Docker Bridge'
        let entry = { Interface: link, IPs: linkIPs[link].sort(), Type: type }
        links.push(entry)
        continue
      }

      for (let container_gateway of Object.keys(dockerNetmap)) {
        for (let link_ip of linkIPs[link]) {
          if (container_gateway == link_ip) {
            //okay go through each container, and see if the ip address matches
            let containers = dockerNetmap[container_gateway]

            for (let container of containers) {
              let type = 'Docker Network'
              let networkName = getNetworkName(container, container_gateway)
              let c_ip =
                container.NetworkSettings.Networks[networkName].IPAddress
              let c_prefix =
                container.NetworkSettings.Networks[networkName].IPPrefixLen
              let entry = {
                Interface: link,
                IPs: linkIPs[link].sort(),
                Type: type,
                Container: container,
                ContainerIP: c_ip,
                Prefix: c_prefix,
                Gateway: container_gateway
              }
              links.push(entry)
            }
          }
        }
      }
    }
    setLinks(links)
  }

  const trigger = (triggerProps) => (
    <Button variant="link" ml="auto" {...triggerProps}>
      <ThreeDotsIcon />
    </Button>
  )

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
    <VStack space="md">
      <ListHeader title="Container Networks" />

      <FlatList
        data={links}
        keyExtractor={(item) => `${item.Container}_${item.Gateway}`}
        renderItem={({ item }) => (
          <ListItem>
            <VStack
              flex={1}
              space="sm"
              sx={{ '@md': { flexDirection: 'row' } }}
            >
              <Text minWidth="$1/4" size="sm" bold>
                {item.Interface}
              </Text>
              <Text size="sm">{item.Type}</Text>

              <Text size="sm">
                {getNetworkName(item.Container, item.Gateway)}
              </Text>

              <VStack space="sm">
                {item.IPs.map((ip) => (
                  <Text size="sm" key={ip}>
                    {ip}
                  </Text>
                ))}
              </VStack>
            </VStack>

            <VStack
              flex={1}
              space="sm"
              sx={{ '@md': { flexDirection: 'row' } }}
            >
              <Text size="sm">{item.Container?.Names[0].slice(1)}</Text>
              <Text size="sm">{item.ContainerIP}</Text>
              <Text size="sm">{item.Prefix ? '/' + item.Prefix : ''}</Text>
            </VStack>

            {/*<Box flex={1}>{moreMenu(item.Interface)}</Box>*/}
          </ListItem>
        )}
      />

      {/*
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
        */}
    </VStack>
  )
}

export default ContainerNetInfo
