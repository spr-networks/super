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
  FlatList,
  Modal,
  Menu,
  Stack,
  Text,
  View,
  VStack,
  ScrollView,
  useDisclose,
  useColorModeValue
} from 'native-base'
import Icon from 'FontAwesomeUtils'

import {
  faEllipsis,
} from '@fortawesome/free-solid-svg-icons'


import { wifiAPI, api } from 'api'
import { AlertContext } from 'AppContext'
import { ucFirst } from 'utils'

const UplinkInfo = (props) => {
  const context = useContext(AlertContext)

  const [interfaces, setInterfaces] = useState({})
  const [linkIPs, setLinkIPs] = useState({})

  function isLocalIpAddress(ipAddress) {
    const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    const ipv6Regex = /([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}/;

    const ipv4LocalRanges = [
      /^127\./
    ];

    const ipv6LocalRanges = [
      /^fc00:/,
      /^fd/,
      /^fe80:/,
      /^::1$/
    ];

    if (ipv4Regex.test(ipAddress)) {
      return ipv4LocalRanges.some((range) => range.test(ipAddress));
    }

    if (ipv6Regex.test(ipAddress)) {
      return ipv6LocalRanges.some((range) => range.test(ipAddress));
    }

    throw new Error('The string is not a valid IP address.');
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
              if (addr_info.family == "inet" || addr_info.family == "inet6") {
                if (addr_info.scope == 'global') {
                  ips.push(addr_info.local)
                }
              }
            }
            x[iface.ifname] = ips
          }
          setLinkIPs(x)

        })
        .catch((err) => context.error("fail " + err))

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
  for (let link of Object.keys(linkIPs)) {
    //check if its in the interfaces configuration
    if (interfaces[link] &&
       (interfaces[link].Type == "Uplink" ||
        interfaces[link].Type == "Bonded")) {
      let entry = {"Interface": link, "IPs": linkIPs[link]}
      uplinks.push(entry)
    }
    links.push(link)
  }

  const { isOpen, onOpen, onClose } = useDisclose();

  const trigger = (triggerProps) => (
    <IconButton
      variant="unstyled"
      ml="auto"
      icon={<Icon icon={faEllipsis} color="muted.600" />}
      {...triggerProps}
    ></IconButton>
  )

  const moreMenu = (
    <Menu w={190} closeOnSelect={true} trigger={trigger}>
      <Menu.Item>
        <Text>Modify Interface</Text>
      </Menu.Item>
    </Menu>)

  return (
    <ScrollView h={'100%'}>
      <VStack space={2}>
        <HStack p={4}>
          <Heading fontSize="md">Uplink Configuration</Heading>
        </HStack>
  
        {/* for each uplink, display a pleasant table with the interface name and the ip address*/}

        <Box width={{ base: '100%', md: '50%' }}
            bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
          >
          <FlatList
            data={uplinks}
            renderItem={({ item }) => (
              <HStack
                p={2}
                rounded="md"
                my={1}
              >
                {moreMenu}
                <Text flex={2} textAlign="center">
                  {item.Interface}
                </Text>
                <Text flex={3} textAlign="center">
                  {item.IPs}
                </Text>
              </HStack>
            )}
            ListHeaderComponent={() => (
              <HStack
                bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
                p={3}
                rounded="md"
                my={1}
              >
                <Text flex={1}></Text>
                <Text flex={2} fontWeight="bold" textAlign="center">
                  Interface
                </Text>
                <Text flex={3} fontWeight="bold" textAlign="center">
                  IP Address
                </Text>
              </HStack>
            )}
          />

          <Modal isOpen={isOpen} onClose={onClose}>
            <Modal.Content>
              <Modal.CloseButton />
              <Modal.Header fontSize="4xl" fontWeight="bold">
                Hello World
              </Modal.Header>
              <Modal.Body>
                Lorem ipsum dolor sit amet consectetur adipisicing elit. Quos quasi
                cupiditate expedita, ipsa corporis officia totam similique delectus!
                Debitis esse, ea blanditiis iste enim iure at odit fugiat autem.
                Accusamus?
              </Modal.Body>
              <Modal.Footer>
                <Button colorScheme="blue" mr={1}>
                  Save
                </Button>
                <Button onPress={onClose}>Close</Button>
              </Modal.Footer>
            </Modal.Content>
          </Modal>        
        </Box>

        <Box width={{ base: "100%", md: "50%" }}>
          <VStack space={4} mb="4"
            bg={useColorModeValue(
              'backgroundCardLight',
              'backgroundCardDark'
            )}>
            <HStack
              flex={1}
              space={2}
              p={4}
              justifyContent="space-between"
            >
              <Text>Uplink IPs</Text>
              {uplinks.map(uplink => (
                <Box key={uplink.id}>
                  <Text>
                    {uplink.interface} {uplink.ipAddress}
                  </Text>
                </Box>
              ))}
              <Text color="muted.500">{JSON.stringify(uplinks)}</Text>
            </HStack>
            <HStack
              flex={1}
              space={2}
              p={4}
              justifyContent="space-between"
            >
              <Text>Manage Uplink Interfaces</Text>
            </HStack>
            <HStack
              flex={1}
              space={2}
              p={4}
              justifyContent="space-between"
            >
              <Text>{JSON.stringify(links)}</Text>
            </HStack>
            <HStack
              flex={1}
              space={2}
              p={4}
              justifyContent="space-between"
            >
              <Text>Bond Interfaces</Text>
            </HStack>

            <HStack
              flex={1}
              space={2}
              p={4}
              justifyContent="space-between"
            >
              <Text>Set Load Balancing Strategy</Text>
            </HStack>
          </VStack>
        </Box>


      </VStack>
    </ScrollView>
  )
}

export default UplinkInfo
