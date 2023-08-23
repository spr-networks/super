/*
  TBD -
    configure a bonded interface
      set load balancing, failover
      test failover
*/
import React, { useContext, useEffect, useState } from 'react'
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
  Text,
  VStack,
  View,
  useDisclose,
  useColorModeValue,
  Checkbox
} from 'native-base'

import Icon from 'FontAwesomeUtils'

import { faEllipsis, faTag } from '@fortawesome/free-solid-svg-icons'

import { wifiAPI, api } from 'api'
import { AlertContext } from 'AppContext'
import { ucFirst } from 'utils'

import { Select } from 'components/Select'
import InputSelect from 'components/InputSelect'
import { deviceAPI } from 'api'

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
    setOptsSSIDs([{ label: 'Scanning...', value: null }])

    //set interface up and scan
    wifiAPI.ipLinkState(iface, 'up').then(
      wifiAPI.iwScan(iface).then((scanList) => {
        setSSIDs(scanList)
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
  }, [ssids])

  useEffect(() => {
    // scan on init
    if (iface != null) {
      scan(iface)
    }

    getWifiClients()
  }, [])

  return (
    <VStack space={4}>
      <FormControl>
        <FormControl.Label>SSID</FormControl.Label>
        <InputSelect
          options={optSSIDs}
          value={item.SSID}
          onChange={handleChangeSSID}
          onChangeText={handleChangeSSID}
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

        <Checkbox
          size="sm"
          colorScheme="primary"
          value={!assignBSSID}
          onChange={setAssignBSSID}
        >
          Assign
        </Checkbox>
      </FormControl>
      <FormControl>
        <FormControl.Label>Auth</FormControl.Label>
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

      {/*
        //priority will only matter once UI supports multiple ssids.
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
      */}

      <FormControl>
        <FormControl.Label>Status</FormControl.Label>

        <Checkbox
          size="sm"
          colorScheme="primary"
          defaultIsChecked
          value={!item.Disabled}
          onChange={(val) => setItem({ ...item, Disabled: !val })}
        >
          Enabled
        </Checkbox>
      </FormControl>

      <Button colorScheme="primary" onPress={() => doSubmit(item)}>
        Save
      </Button>
    </VStack>
  )
}

const UplinkSetConfig = ({ iface, onSubmit, ...props }) => {
  const type = 'config'
  const context = useContext(AlertContext)

  const [item, setItem] = useState({
    Type: 'Uplink'
  })

  const [errors, setErrors] = useState({})

  const [enable, setEnable] = useState(true)

  const validate = () => {
    if (item.Type != 'Other' && item.Type != 'Uplink') {
      context.error('Failed to validate Type')
      return false
    }
    return true
  }

  const doSubmit = (item) => {
    validate() ? onSubmit(item, type, enable) : null
  }

  let validTypes = [
    { label: 'Uplink', value: 'Uplink' },
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

const UplinkSetIP = ({ iface, onSubmit, ...props }) => {
  const type = 'ip'
  const context = useContext(AlertContext)

  const [item, setItem] = useState({
    DisableDHCP: false,
    IP: '',
    Router: '',
    VLAN: ''
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
    <VStack space={4}>
      <FormControl>
        <FormControl.Label>DHCP Settings</FormControl.Label>
        <Checkbox
          size="sm"
          colorScheme="primary"
          value={item.DisableDHCP}
          onChange={(value) => {
            setItem({ ...item, DisableDHCP: value })
          }}
        >
          Manually Set IP
        </Checkbox>
      </FormControl>

      {item.DisableDHCP ? (
        <>
          <FormControl>
            <FormControl.Label>Assign IP</FormControl.Label>
            <Input
              variant="underlined"
              placeholder="192.168.1.1/24"
              value={item.IP}
              onChangeText={(IP) => setItem({ ...item, IP })}
              autoFocus
            />
          </FormControl>
          <FormControl>
            <FormControl.Label>Assign Router</FormControl.Label>
            <Input
              variant="underlined"
              placeholder="192.168.1.1"
              value={item.Router}
              onChangeText={(Router) => setItem({ ...item, Router })}
              autoFocus
            />
          </FormControl>
        </>
      ) : null}

      <Button colorScheme="primary" onPress={() => doSubmit(item)}>
        Save
      </Button>
    </VStack>
  )
}

const UplinkAddPPP = ({ iface, onSubmit, ...props }) => {
  const type = 'ppp'
  const [item, setItem] = useState({
    Username: '',
    Secret: '',
    VLAN: '',
    MTU: ''
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
    <VStack space={4}>
      <FormControl>
        <FormControl.Label>Assign Client</FormControl.Label>
        <Input
          variant="underlined"
          placeholder="user@provider.com"
          value={item.Username}
          onChangeText={(Username) => setItem({ ...item, Username })}
          autoFocus
        />
      </FormControl>
      <FormControl>
        <FormControl.Label>Secret</FormControl.Label>
        <Input
          variant="underlined"
          type="password"
          autoComplete="off"
          autoCorrect="off"
          placeholder="Password..."
          value={item.Secret}
          onChangeText={(Secret) => setItem({ ...item, Secret })}
          autoFocus
        />
      </FormControl>
      <FormControl>
        <FormControl.Label>VLAN ID</FormControl.Label>
        <Input
          variant="underlined"
          placeholder="201 (Optional)"
          value={item.VLAN}
          onChangeText={(VLAN) => setItem({ ...item, VLAN })}
          autoFocus
        />
      </FormControl>
      <FormControl>
        <FormControl.Label>Set MTU</FormControl.Label>
        <Input
          variant="underlined"
          placeholder="1492 (Optional)"
          value={item.MTU}
          onChangeText={(MTU) => setItem({ ...item, MTU })}
          autoFocus
        />
      </FormControl>
      <Button colorScheme="primary" onPress={() => doSubmit(item)}>
        Save
      </Button>
    </VStack>
  )
}

const UplinkInfo = (props) => {
  const context = useContext(AlertContext)

  const [interfaces, setInterfaces] = useState({})
  const [linkIPs, setLinkIPs] = useState({})
  const [links, setLinks] = useState([])
  const [uplinks, setUplinks] = useState([])

  const [iface, setIface] = useState(null)

  const [modal, setModal] = useState('')

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
  }

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
          Interface: link,
          IPs: linkIPs[link].sort(),
          Type: interfaces[link].Type,
          Subtype: interfaces[link].Subtype,
          Enabled: interfaces[link].Enabled
        }
        uplinks.push(entry)
      } else {
        let Type = interfaces[link]?.Type || 'Other'
        let entry = { Interface: link, IPs: linkIPs[link].sort(), Type }
        links.push(entry)
      }
    }
    setUplinks(uplinks)
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

  const moreMenu = (iface) => (
    <Menu w={190} closeOnSelect={true} trigger={trigger}>
      <Menu.Item
        onPress={() => {
          setIface(iface)
          setModal('config')
          onOpen()
        }}
      >
        Modify Interface
      </Menu.Item>
      <Menu.Item
        onPress={() => {
          setIface(iface)
          setModal('ip')
          onOpen()
        }}
      >
        Modify IP Settings
      </Menu.Item>
      <Menu.Item
        onPress={() => {
          setIface(iface)
          setModal('wifi')
          onOpen()
        }}
      >
        Configure Wireless
      </Menu.Item>
      <Menu.Item
        onPress={() => {
          setIface(iface)
          setModal('ppp')
          onOpen()
        }}
      >
        Configure PPP
      </Menu.Item>
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
        onClose()
      })
      .catch((err) => {
        context.error(err)
        onClose()
      })
  }

  return (
    <View h={'100%'}>
      <VStack space={2}>
        <HStack p={4}>
          <Heading fontSize="md">Uplink Configuration</Heading>
        </HStack>

        {/* for each uplink, display a pleasant table with the interface name and the ip address*/}

        <VStack
          mx={{ base: 0, md: 4 }}
          width={{ base: '100%', md: '75%' }}
          bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
          _space={2}
        >
          <FlatList
            data={uplinks}
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
                  {item.IPs.map((ip, i) => (
                    <Text key={ip} display={i == 0 ? 'flex' : 'none'}>
                      {ip}
                    </Text>
                  ))}
                </VStack>
                {item.Enabled ? (
                  <Badge
                    key={item.Name}
                    variant="outline"
                    colorScheme="success"
                    color="success.500"
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
                <VStack flex={2} space={1}>
                  {item.IPs.map((ip) => (
                    <Text key={ip}>{ip}</Text>
                  ))}
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
                {iface && modal == 'wifi' ? (
                  <UplinkAddWifi iface={iface} onSubmit={onSubmit} />
                ) : null}
                {iface && modal == 'config' ? (
                  <UplinkSetConfig iface={iface} onSubmit={onSubmit} />
                ) : null}
                {iface && modal == 'ip' ? (
                  <UplinkSetIP iface={iface} onSubmit={onSubmit} />
                ) : null}
                {iface && modal == 'ppp' ? (
                  <UplinkAddPPP iface={iface} onSubmit={onSubmit} />
                ) : null}
              </Modal.Body>
            </Modal.Content>
          </Modal>
        </VStack>
      </VStack>
    </View>
  )
}

export default UplinkInfo
