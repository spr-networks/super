/*
  TBD -
    configure a bonded interface
      set load balancing, failover
      test failover
*/
import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
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
  Input,
  InputField,
  Menu,
  MenuItem,
  MenuItemLabel,
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

import { TrashIcon } from 'lucide-react-native'

import { wifiAPI, api } from 'api'
import { AlertContext } from 'AppContext'
import { Address4 } from 'ip-address'

import { Select } from 'components/Select'
import { ListHeader, ListItem } from 'components/List'
import { InterfaceTypeItem } from 'components/TagItem'

const LANLinkSetIP = ({ curItem, iface, onSubmit, ...props }) => {
  const type = 'ip'
  const context = useContext(AlertContext)

  const [additionalIPs, setAdditionalIPs] = useState(
    curItem.AdditionalIPs || []
  )

  const [errors, setErrors] = useState({})

  const validate = () => {
    const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/
    const ipv6Regex = /([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}/

    for (let i = 0; i < additionalIPs.length; i++) {
      const addIP = additionalIPs[i]

      if (!addIP.IP || addIP.IP === '') {
        continue
      }

      let ip = addIP.IP
      let ip_invalid = true
      if (ip.includes('/')) {
        let pieces = ip.split('/')
        if (pieces.length == 2) {
          let netSplit = parseInt(pieces[1])
          if (netSplit >= 8 && netSplit <= 32) {
            if (ipv4Regex.test(pieces[0]) || ipv6Regex.test(pieces[0])) {
              ip_invalid = false
            }
          }
        }
      }

      if (ip_invalid) {
        context.error('Failed to validate additional IP #' + (i + 1))
        return false
      }

      if (addIP.Router && addIP.Router !== '') {
        if (!ipv4Regex.test(addIP.Router) && !ipv6Regex.test(addIP.Router)) {
          context.error('Failed to validate Router IP for additional IP #' + (i + 1))
          return false
        }
      }
    }

    return true
  }

  const doSubmit = () => {
    if (validate()) {
      const item = {
        Name: iface,
        AdditionalIPs: additionalIPs.filter(ip => ip.IP !== '')
      }
      onSubmit(item, type, true)
    }
  }

  const addAdditionalIP = () => {
    setAdditionalIPs([...additionalIPs, { IP: '', Router: '' }])
  }

  const removeAdditionalIP = (index) => {
    const newIPs = additionalIPs.filter((_, i) => i !== index)
    setAdditionalIPs(newIPs)
  }

  const updateAdditionalIP = (index, field, value) => {
    const newIPs = [...additionalIPs]
    newIPs[index][field] = value
    setAdditionalIPs(newIPs)
  }

  return (
    <VStack space="lg">
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Additional IP Addresses</FormControlLabelText>
        </FormControlLabel>
        <Text size="sm" color="$muted500" pb="$2">
          Add secondary IP addresses to this interface. These are in addition to
          any DHCP-assigned IP.
        </Text>
      </FormControl>

      {additionalIPs.map((addIP, index) => (
        <VStack key={index} space="md" p="$3" borderWidth="$1" borderColor="$borderLight200" borderRadius="$md">
          <HStack justifyContent="space-between" alignItems="center">
            <Text bold size="sm">
              Additional IP #{index + 1}
            </Text>
            <Button
              size="xs"
              variant="link"
              onPress={() => removeAdditionalIP(index)}
            >
              <ButtonIcon as={TrashIcon} color="$red700" mr="$1" />
              <ButtonText color="$red700">Delete</ButtonText>
            </Button>
          </HStack>

          <FormControl>
            <FormControlLabel>
              <FormControlLabelText>IP Address</FormControlLabelText>
            </FormControlLabel>
            <Input variant="underlined">
              <InputField
                placeholder="192.168.2.1/24"
                value={addIP.IP}
                onChangeText={(value) => updateAdditionalIP(index, 'IP', value)}
              />
            </Input>
          </FormControl>

          <FormControl>
            <FormControlLabel>
              <FormControlLabelText>Gateway (Optional)</FormControlLabelText>
            </FormControlLabel>
            <Input variant="underlined">
              <InputField
                placeholder="192.168.2.254"
                value={addIP.Router}
                onChangeText={(value) => updateAdditionalIP(index, 'Router', value)}
              />
            </Input>
          </FormControl>
        </VStack>
      ))}

      <Button action="secondary" variant="outline" onPress={addAdditionalIP}>
        <ButtonText>Add Additional IP</ButtonText>
      </Button>

      <Button action="primary" onPress={doSubmit}>
        <ButtonText>Save</ButtonText>
      </Button>
    </VStack>
  )
}

const LANLinkSetConfig = ({ curItem, iface, onSubmit, ...props }) => {
  const type = 'config'
  const context = useContext(AlertContext)
  const [item, setItem] = useState({
    ...curItem,
    Type: curItem.Type || 'Downlink',
    MACOverride: curItem.MACOverride || '',
    Enabled: curItem.Enabled !== undefined ? curItem.Enabled : true,
    MACRandomize: curItem.MACRandomize,
    MACCloak: curItem.MACCloak
  })

  const validate = () => {
    if (
      item.Type != 'Other' &&
      item.Type != 'Downlink' &&
      item.Type != 'AP' &&
      item.Type != 'VLAN'
    ) {
      context.error('Failed to validate Type')
      return false
    }
    const macAddressRegex = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/
    if (item.MACOverride != '') {
      if (!macAddressRegex.test(item.MACOverride)) {
        context.error('Invalid MAC address')
        return false
      }
    }
    return true
  }

  const doSubmit = (item) => {
    validate() ? onSubmit(item, type, item.Enabled) : null
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
        <Checkbox
          value={item.Enabled}
          isChecked={item.Enabled}
          onChange={(value) => {
            setItem({ ...item, Enabled: value })
          }}
        >
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
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Override MAC Address</FormControlLabelText>
        </FormControlLabel>
        <Input variant="underlined">
          <InputField
            placeholder="01:02:03:04:05:06"
            value={item.MACOverride}
            onChangeText={(MACOverride) => setItem({ ...item, MACOverride })}
            autoFocus
          />
        </Input>
      </FormControl>
      <HStack flex={1} space="md">
        <FormControl>
          <Checkbox
            value={item.MACRandomize}
            isChecked={item ? item.MACRandomize : false}
            onChange={(value) => {
              setItem({ ...item, MACRandomize: value })
            }}
          >
            <CheckboxIndicator mr="$2">
              <CheckboxIcon />
            </CheckboxIndicator>
            <CheckboxLabel>Randomize MAC</CheckboxLabel>
          </Checkbox>
        </FormControl>
        {item.MACRandomize && (
          <FormControl>
            <Checkbox
              value={item.MACCloak}
              isChecked={item ? item.MACCloak : false}
              onChange={(value) => {
                setItem({ ...item, MACCloak: value })
              }}
            >
              <CheckboxIndicator mr="$2">
                <CheckboxIcon />
              </CheckboxIndicator>
              <CheckboxLabel>Cloak Common AP Vendor</CheckboxLabel>
            </Checkbox>
          </FormControl>
        )}
      </HStack>
      <Button action="primary" onPress={() => doSubmit(item)}>
        <ButtonText>Save</ButtonText>
      </Button>
    </VStack>
  )
}

const LANLinkInfo = (props) => {
  const context = useContext(AlertContext)

  const [ifaces, setIfaces] = useState([])
  const [interfaces, setInterfaces] = useState({})
  const [linkIPs, setLinkIPs] = useState({})
  const [linkMACs, setLinkMACs] = useState({})
  const [links, setLinks] = useState([])
  const [lanLinks, setLanLinks] = useState([])

  const [iface, setIface] = useState(null)
  const [currentItem, setCurrentItem] = useState(null)

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
        setIfaces(ifaces)
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
    let x = {}
    let y = {}
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
      y[iface.ifname] = iface.address
    }
    setLinkIPs(x)
    setLinkMACs(y)
  }, [ifaces])

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
          ...interfaces[link],
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
        let entry = {
          ...interfaces[link],
          Interface: link,
          IPs: linkIPs[link].sort(),
          Type: type
        }
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
      if (ip.includes(":")) {
        continue
      }
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

  const moreMenu = (iface, item) => (
    <Menu
      trigger={trigger}
      selectionMode="single"
      onSelectionChange={(e) => {
        setIface(iface)
        setCurrentItem(item)
        setModal(e.currentKey)
        setShowModal(true)
      }}
    >
      <MenuItem key="config" textValue="config">
        <MenuItemLabel size="sm">Modify Interface</MenuItemLabel>
      </MenuItem>
      <MenuItem key="ip" textValue="ip">
        <MenuItemLabel size="sm">Modify IP Settings</MenuItemLabel>
      </MenuItem>
    </Menu>
  )

  const onSubmit = (item, type, enable) => {
    let new_entry

    if (type == 'config') {
      new_entry = { ...item, Name: iface, Enabled: enable }
    } else if (type == 'ip') {
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
        setShowModal(false)
      })
      .catch((err) => {
        context.error(err)
      })

    //update VLAN Subtype (only for config type)
    if (type == 'config') {
      api
        .put(`link/vlan/${iface}/${state}`)
        .then((res2) => {
          fetchInfo()
          setShowModal(false)
        })
        .catch((err) => {
          context.error(err)
        })
    }
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
              <Text flex={2} size="sm">
                {linkMACs[item.Interface]}
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
              {moreMenu(item.Interface, item)}
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
              <HStack flex={1} space="xs">
                <InterfaceTypeItem
                  item={item}
                  operstate={
                    ifaces.find((i) => i.ifname == item.Interface)?.operstate
                  }
                />
              </HStack>
              <Text flex={2} size="sm">
                {linkMACs[item.Interface]}
              </Text>
              <VStack flex={2} space="sm">
                {truncateSupernetIps(item.IPs)
                  ? supernets.map((net) => <Text size="sm">{net}</Text>)
                  : item.IPs.map((ip) => (
                      <Text size="sm" bold key={ip}>
                        {ip}
                      </Text>
                    ))}
              </VStack>
              {moreMenu(item.Interface, item)}
            </ListItem>
          )}
        />

        <Modal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false)
          }}
          useRNModal={Platform.OS == 'web'}
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
                <LANLinkSetConfig
                  curItem={currentItem}
                  iface={iface}
                  onSubmit={onSubmit}
                />
              ) : null}
              {iface && modal == 'ip' ? (
                <LANLinkSetIP
                  curItem={currentItem}
                  iface={iface}
                  onSubmit={onSubmit}
                />
              ) : null}
            </ModalBody>
          </ModalContent>
        </Modal>
      </VStack>
    </ScrollView>
  )
}

export default LANLinkInfo
