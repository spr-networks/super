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
  ButtonText,
  Input,
  InputField,
  FlatList,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Heading,
  Icon,
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
  Checkbox,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  CloseIcon,
  ButtonIcon,
  ThreeDotsIcon,
  HStack,
  BadgeIcon,
  CheckCircleIcon
} from '@gluestack-ui/themed'

import { wifiAPI, api } from 'api'
import { AlertContext } from 'AppContext'

import { Select } from 'components/Select'
import InputSelect from 'components/InputSelect'
import { Address4 } from 'ip-address'
import { ListHeader, ListItem } from 'components/List'
import {
  ArrowDownUpIcon,
  CableIcon,
  CheckIcon,
  NetworkIcon,
  WifiIcon
} from 'lucide-react-native'
import { InterfaceTypeItem } from 'components/TagItem'

let keymgmts = [
  { value: 'WPA-PSK WPA-PSK-SHA256 SAE', label: 'WPA2/WPA3' },
  { value: 'WPA-PSK WPA-PSK-SHA256', label: 'WPA2' },
  { value: 'SAE', label: 'WPA3' }
]

const UplinkAddWifi = ({ iface, onSubmit, ...props }) => {
  const type = 'wifi'
  const [item, setItem] = useState({
    Disabled: false,
    Password: '',
    SSID: '',
    KeyMgmt: 'WPA-PSK WPA-PSK-SHA256 SAE',
    Priority: '1',
    BSSID: ''
  })

  const [ssids, setSSIDs] = useState([])
  const [optSSIDs, setOptsSSIDs] = useState([])
  const [assignBSSID, setAssignBSSID] = useState(false)
  const [disableWPA3, setDisableWPA3] = useState(false)
  const [enable, setEnable] = useState(true)
  const context = useContext(AlertContext)

  const handleChangeSSID = (SSID) => {
    let ssidItem = ssids.find((item) => item.ssid == SSID)
    let newBSSID = ''

    if (ssidItem) {
      //ssid was in the scan. grabs the first one.

      /*
      //disable wpa3 if ssid did not offer it
      if (ssidItem.authentication_suites && !ssidItem.authentication_suites.includes('SAE')) {
        setDisableWPA3(true)
      }
      */

      //provide bssid from scan
      newBSSID = ssidItem.bssid
    }

    if (newBSSID != '') {
      setItem({ ...item, SSID, BSSID: newBSSID })
    } else {
      setItem({ ...item, SSID })
    }
  }

  const doSubmit = (item) => {
    //strip out BSSID if assignBSSID is not set
    if (assignBSSID == false) {
      item.BSSID = ''
    }
    onSubmit(item, type, enable)
  }

  const scan = (iface) => {
    setOptsSSIDs([{ label: 'Scanning...', value: {} }])

    //set interface up and scan
    wifiAPI.ipLinkState(iface, 'up').then(
      wifiAPI
        .iwScan(iface)
        .then((scanList) => {
          setSSIDs(scanList)
        })
        .catch((e) => {
          context.error(e)
        })
    )
  }

  const getWifiClients = () => {
    api
      .get('/uplink/wifi')
      .then((res) => {
        //fill out the defaults for the matching iface
        for (let entry of res.WPAs) {
          if (entry.Iface == iface) {
            if (entry.Networks && entry.Networks.length > 0) {
              setItem(entry.Networks[0])
            }
            break
          }
        }
      })
      .catch((err) => {
        context.error(err)
      })
  }

  useEffect(() => {
    if (ssids && ssids.length) {
      setOptsSSIDs(
        ssids.map((item) => {
          return { label: item.ssid, value: item.ssid }
        })
      )
    }
  }, [ssids, item])

  useEffect(() => {
    // scan on init
    if (iface != null) {
      scan(iface)
    }

    getWifiClients()
  }, [iface])

  return (
    <VStack space="lg">
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>SSID</FormControlLabelText>
        </FormControlLabel>
        <InputSelect
          options={optSSIDs}
          value={item.SSID}
          onChange={handleChangeSSID}
          onChangeText={handleChangeSSID}
        />
      </FormControl>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>BSSID</FormControlLabelText>
        </FormControlLabel>
        <Input variant="underlined">
          <InputField
            placeholder="BSSID Optional"
            value={item.BSSID}
            onChangeText={(BSSID) => setItem({ ...item, BSSID })}
            autoFocus
          />
        </Input>

        <Checkbox value={!assignBSSID} onChange={setAssignBSSID}>
          <CheckboxIndicator mr="$2">
            <CheckboxIcon />
          </CheckboxIndicator>
          <CheckboxLabel>Assign</CheckboxLabel>
        </Checkbox>
      </FormControl>
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Auth</FormControlLabelText>
        </FormControlLabel>
        <Select
          selectedValue={item.KeyMgmt}
          onValueChange={(KeyMgmt) => setItem({ ...item, KeyMgmt })}
        >
          {keymgmts.map((opt) => (
            <Select.Item
              key={opt.value}
              label={opt.label}
              value={opt.value}
              isDisabled={opt.label.includes('WPA3') && disableWPA3}
            />
          ))}
        </Select>
      </FormControl>
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Password</FormControlLabelText>
        </FormControlLabel>
        <Input variant="underlined">
          <InputField
            type="password"
            autoComplete="off"
            autoCorrect="off"
            placeholder="Password..."
            value={item.Password}
            onChangeText={(Password) => setItem({ ...item, Password })}
            autoFocus
          />
        </Input>
      </FormControl>

      {/*
        //priority will only matter once UI supports multiple ssids.
      <FormControl>
        <FormControlLabel>Priority</FormControlLabel>
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
      */}

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Status</FormControlLabelText>
        </FormControlLabel>
        <Checkbox
          isChecked={item ? !item.Disabled : false}
          value={!item.Disabled}
          onChange={(val) => setItem({ ...item, Disabled: !val })}
        >
          <CheckboxIndicator mr="$2">
            <CheckboxIcon />
          </CheckboxIndicator>
          <CheckboxLabel>Enabled</CheckboxLabel>
        </Checkbox>
      </FormControl>
      <Button action="primary" onPress={() => doSubmit(item)}>
        <ButtonText>Save</ButtonText>
      </Button>
    </VStack>
  )
}

const UplinkSetConfig = ({ curItem, iface, onSubmit, ...props }) => {
  const type = 'config'
  const context = useContext(AlertContext)

  const [item, setItem] = useState({
    Type: curItem.Type || 'Uplink',
    MACOverride: curItem.MACOverride || '',
    Enabled: curItem.Enabled,
    MACRandomize: curItem.MACRandomize,
    MACCloak: curItem.MACCloak
  })

  const [errors, setErrors] = useState({})

  const [enable, setEnable] = useState(true)

  const validate = () => {
    if (item.Type != 'Other' && item.Type != 'Uplink' && item.Type != 'AP') {
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
    validate() ? onSubmit(item, type, enable) : null
  }

  let validTypes = [
    { label: 'AP', value: 'AP' },
    { label: 'Uplink', value: 'Uplink' },
    { label: 'Other', value: 'Other' }
  ]

  return (
    <VStack space="lg">
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Update Interface</FormControlLabelText>
        </FormControlLabel>

        <Checkbox
          value={enable}
          defaultIsChecked={item.Enabled}
          isChecked={enable}
          onChange={(value) => {
            setEnable(value)
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
              <CheckboxLabel>Cloak Common OUI</CheckboxLabel>
            </Checkbox>
          </FormControl>
        )}
      </HStack>

      <Button colorScheme="primary" onPress={() => doSubmit(item)}>
        <ButtonText>Save</ButtonText>
      </Button>
    </VStack>
  )
}

const UplinkSetIP = ({ curItem, iface, onSubmit, ...props }) => {
  const type = 'ip'
  const context = useContext(AlertContext)

  const [item, setItem] = useState({
    DisableDHCP: curItem.DisableDHCP || false,
    IP: curItem.IP || '',
    Router: curItem.Router || '',
    VLAN: curItem.VLAN || ''
  })

  const [errors, setErrors] = useState({})

  const [enable, setEnable] = useState(true)

  const validate = () => {
    if (item.DisableDHCP == false) {
      return true
    }

    const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/
    const ipv6Regex = /([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}/

    let ip = item.IP
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
      context.error('Failed to validate IP')
      return false
    }

    if (!ipv4Regex.test(item.Router) && !ipv6Regex.test(item.Router)) {
      context.error('Failed to validate Router IP')
      return false
    }

    return true
  }

  const doSubmit = (item) => {
    validate() ? onSubmit(item, type, enable) : null
  }

  useEffect(() => {}, [])

  return (
    <VStack space="lg">
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>DHCP Settings</FormControlLabelText>
        </FormControlLabel>
        <Checkbox
          value={item.DisableDHCP}
          defaultIsChecked={item.DisableDHCP}
          isChecked={item ? item.DisableDHCP : false}
          onChange={(value) => {
            setItem({ ...item, DisableDHCP: value })
          }}
        >
          <CheckboxIndicator mr="$2">
            <CheckboxIcon />
          </CheckboxIndicator>
          <CheckboxLabel>Manually Set IP</CheckboxLabel>
        </Checkbox>
      </FormControl>

      {item.DisableDHCP ? (
        <>
          <FormControl>
            <FormControlLabel>
              <FormControlLabelText>Assign IP</FormControlLabelText>
            </FormControlLabel>
            <Input variant="underlined">
              <InputField
                placeholder="192.168.1.1/24"
                value={item.IP}
                onChangeText={(IP) => setItem({ ...item, IP })}
                autoFocus
              />
            </Input>
          </FormControl>
          <FormControl>
            <FormControlLabel>
              <FormControlLabelText>Assign Router</FormControlLabelText>
            </FormControlLabel>
            <Input variant="underlined">
              <InputField
                placeholder="192.168.1.1"
                value={item.Router}
                onChangeText={(Router) => setItem({ ...item, Router })}
                autoFocus
              />
            </Input>
          </FormControl>
        </>
      ) : null}

      <Button action="primary" onPress={() => doSubmit(item)}>
        <ButtonText>Save</ButtonText>
      </Button>
    </VStack>
  )
}

const UplinkAddPPP = ({ curItem, iface, onSubmit, ...props }) => {
  const context = useContext(AlertContext)

  const type = 'ppp'
  const [item, setItem] = useState({
    Username: curItem.Username || '',
    Secret: curItem.Secret || '',
    VLAN: curItem.VLAN || '',
    MTU: curItem.MTU || ''
  })

  const [enable, setEnable] = useState(true)

  const doSubmit = (item) => {
    onSubmit(item, type, enable)
  }

  const getPPPClients = () => {
    api
      .get('/uplink/ppp')
      .then((res) => {
        //fill out the defaults for the matching iface
        for (let entry of res.PPPs) {
          if (entry.Iface == iface) {
            setItem(entry)
            break
          }
        }
      })
      .catch((err) => {
        context.error(err)
      })
  }

  useEffect(() => {
    getPPPClients()
  }, [])

  return (
    <VStack space="lg">
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Assign Client</FormControlLabelText>
        </FormControlLabel>
        <Input variant="underlined">
          <InputField
            placeholder="user@provider.com"
            value={item.Username}
            onChangeText={(Username) => setItem({ ...item, Username })}
            autoFocus
          />
        </Input>
      </FormControl>
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Secret</FormControlLabelText>
        </FormControlLabel>
        <Input variant="underlined">
          <InputField
            type="password"
            autoComplete="off"
            autoCorrect="off"
            placeholder="Password..."
            value={item.Secret}
            onChangeText={(Secret) => setItem({ ...item, Secret })}
            autoFocus
          />
        </Input>
      </FormControl>
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>VLAN ID</FormControlLabelText>
        </FormControlLabel>
        <Input variant="underlined">
          <InputField
            placeholder="201 (Optional)"
            value={item.VLAN}
            onChangeText={(VLAN) => setItem({ ...item, VLAN })}
            autoFocus
          />
        </Input>
      </FormControl>
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Set MTU</FormControlLabelText>
        </FormControlLabel>
        <Input variant="underlined">
          <InputField
            placeholder="1492 (Optional)"
            value={item.MTU}
            onChangeText={(MTU) => setItem({ ...item, MTU })}
            autoFocus
          />
        </Input>
      </FormControl>
      <Button action="primary" onPress={() => doSubmit(item)}>
        <ButtonText>Save</ButtonText>
      </Button>
    </VStack>
  )
}

const UplinkInfo = (props) => {
  const context = useContext(AlertContext)

  const [ifaces, setIfaces] = useState([])
  const [interfaces, setInterfaces] = useState({})
  const [linkIPs, setLinkIPs] = useState({})
  const [linkMACs, setLinkMACs] = useState({})
  const [links, setLinks] = useState([])
  const [uplinks, setUplinks] = useState([])

  const [iface, setIface] = useState(null)
  const [currentItem, setCurrentItem] = useState(null)

  const [showModal, setShowModal] = useState(false)
  const [modal, setModal] = useState('')

  const [supernets, setSupernets] = useState([])

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
    fetchInfo()
  }, [])

  useEffect(() => {
    calcLinks()
  }, [interfaces, linkIPs])

  const calcLinks = () => {
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
      if (interfaces[link]?.Type == 'Uplink') {
        let entry = {
          ...interfaces[link],
          Interface: link,
          IPs: linkIPs[link].sort(),
          Type: interfaces[link].Type,
          Subtype: interfaces[link].Subtype,
          Enabled: interfaces[link].Enabled
        }
        uplinks.push(entry)
      } else {
        let Type = interfaces[link]?.Type || 'Other'
        let entry = {
          ...interfaces[link],
          Interface: link,
          IPs: linkIPs[link].sort(),
          Type
        }
        links.push(entry)
      }
    }

    setUplinks(uplinks)
    setLinks(
      links.sort((a, b) => {
        return a.Interface.length - b.Interface.length
      })
    )
  }

  const trigger = ({ ...triggerProps }) => (
    <Button action="secondary" variant="link" ml="auto" {...triggerProps}>
      <ButtonIcon as={ThreeDotsIcon} />
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
        <Icon as={ArrowDownUpIcon} mr="$2" />
        <MenuItemLabel size="sm">Modify Interface</MenuItemLabel>
      </MenuItem>
      <MenuItem key="ip" textValue="ip">
        <Icon as={ArrowDownUpIcon} mr="$2" />
        <MenuItemLabel size="sm">Modify IP Settings</MenuItemLabel>
      </MenuItem>
      <MenuItem key="wifi" textValue="wifi">
        <Icon as={WifiIcon} mr="$2" />
        <MenuItemLabel size="sm">Configure Wireless</MenuItemLabel>
      </MenuItem>
      <MenuItem key="ppp" textValue="ppp">
        <Icon as={CableIcon} mr="$2" />
        <MenuItemLabel size="sm">Configure PPP</MenuItemLabel>
      </MenuItem>
    </Menu>
  )

  const onSubmit = (item, type, enable) => {
    let new_entry

    if (type == 'wifi') {
      new_entry = { Iface: iface, Enabled: enable, Networks: [item] }
    } else if (type == 'ppp') {
      new_entry = { ...item, Enabled: enable, Iface: iface }
    } else if (type == 'ip') {
      new_entry = { ...item, Name: iface, Enabled: enable }
    } else if (type == 'config') {
      new_entry = { ...item, Name: iface, Enabled: enable }
    } else {
      context.error('Unknown type ' + type)
      return
    }
    let path = `/uplink/${type}`

    if (type == 'config') {
      path = `/link/${type}`
    }

    api
      .put(path, new_entry)
      .then((res2) => {
        fetchInfo()
        setShowModal(false)
      })
      .catch((err) => {
        context.error(err)
        setShowModal(false)
      })
  }

  return (
    <ScrollView h={'100%'}>
      <VStack space="md" sx={{ '@md': { maxWidth: '$3/4' } }}>
        <ListHeader
          title="Uplink Configuration"
          info="Interfaces connected to other networks & internet"
        />

        {/* for each uplink, display a pleasant table with the interface name and the ip address*/}

        <FlatList
          data={uplinks}
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

              <Text flex={2} size="sm" color="$muted500">
                {linkMACs[item.Interface]}
              </Text>

              <VStack flex={2} space="sm">
                {item.IPs.map((ip, i) => (
                  <Text
                    size="sm"
                    bold
                    key={ip}
                    display={i == 0 ? 'flex' : 'none'}
                  >
                    {ip}
                  </Text>
                ))}
              </VStack>

              <HStack flex={1}>
                {item.Enabled ? (
                  <Badge size="sm" action="success" variant="solid" size="sm">
                    <BadgeIcon as={CheckIcon} />
                    <BadgeText
                      ml="$1"
                      display="none"
                      sx={{ '@md': { display: 'flex' } }}
                    >
                      Enabled
                    </BadgeText>
                  </Badge>
                ) : null}
              </HStack>

              {moreMenu(item.Interface, item)}
            </ListItem>
          )}
        />

        <ListHeader
          title="Other Interfaces"
          info="AP, Clients and other interfaces"
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
              <VStack flex={3} space="sm">
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
              {iface && modal == 'wifi' ? (
                <UplinkAddWifi iface={iface} onSubmit={onSubmit} />
              ) : null}
              {iface && modal == 'config' ? (
                <UplinkSetConfig
                  curItem={currentItem}
                  iface={iface}
                  onSubmit={onSubmit}
                />
              ) : null}
              {iface && modal == 'ip' ? (
                <UplinkSetIP
                  curItem={currentItem}
                  iface={iface}
                  onSubmit={onSubmit}
                />
              ) : null}
              {iface && modal == 'ppp' ? (
                <UplinkAddPPP
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

export default UplinkInfo
