import { useContext, useEffect, useState } from 'react'
import { deviceAPI } from 'api'
import { useNavigate } from 'react-router-dom'
import Device from 'components/Devices/Device'
import { AlertContext } from 'layouts/Admin'
import { AppContext } from 'AppContext'
import Icon, { FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faCirclePlus,
  faEllipsis,
  faPlus,
  faTimes
} from '@fortawesome/free-solid-svg-icons'

import {
  Button,
  Box,
  Divider,
  Fab,
  FlatList,
  Heading,
  IconButton,
  Stack,
  HStack,
  VStack,
  Pressable,
  ScrollView,
  Text,
  View,
  useColorModeValue
} from 'native-base'
import { SwipeListView } from 'components/SwipeListView'

const DeviceListing = (props) => {
  const context = useContext(AlertContext)
  const appContext = useContext(AppContext)

  const [devices, setDevices] = useState(null)
  const navigate = useNavigate()
  const [groups, setGroups] = useState(['wan', 'dns', 'lan'])
  const [tags, setTags] = useState([])

  // set device oui if avail, else fail gracefully
  const setOUIs = async (devices) => {
    let ouis = []
    try {
      ouis = await deviceAPI.ouis(
        Object.keys(devices).filter((id) => id.includes(':'))
      )
    } catch (err) {
      return
    }

    for (let mac in devices) {
      devices[mac].oui = ''

      for (let oui of ouis) {
        if (oui.MAC == mac) {
          devices[mac].oui = oui.Vendor
        }
      }
    }
  }

  const refreshDevices = async () => {
    const devices = await deviceAPI.list().catch((error) => {
      context.error('API Failure: ' + error.message)
    })

    if (!devices) {
      return
    }

    await setOUIs(devices)

    setDevices(Object.values(devices))

    setGroups([
      ...new Set(
        Object.values(devices)
          .map((device) => device.Groups)
          .flat()
      )
    ])

    setTags([
      ...new Set(
        Object.values(devices)
          .map((device) => device.DeviceTags)
          .flat()
      )
    ])
  }

  useEffect(() => {
    refreshDevices()
  }, [])

  const handleRedirect = () => {
    if (appContext.isWifiDisabled) {
      navigate('/admin/wireguard')
    } else {
      navigate('/admin/add_device')
    }
  }

  const closeRow = (rowMap, rowKey) => {
    if (rowMap[rowKey]) {
      rowMap[rowKey].closeRow()
    }
  }

  const deleteRow = (rowMap, rowKey) => {
    closeRow(rowMap, rowKey)
    const newData = [...devices]
    const prevIndex = devices.findIndex((item) => item.MAC === rowKey)
    newData.splice(prevIndex, 1)
    setDevices(newData)
  }

  const renderItem = ({ item }) => (
    <Box
      flex={1}
      _light={{ bg: 'backgroundCardLight', borderColor: 'coolGray.200' }}
      _dark={{ bg: 'backgroundCardDark', borderColor: 'muted.700' }}
      borderBottomWidth={1}
      p={4}
    >
      <Pressable
        onPress={() => {
          console.log('**press**')
        }}
      >
        <Device
          device={item}
          edit={true}
          groups={groups}
          tags={tags}
          notifyChange={refreshDevices}
        />
      </Pressable>
    </Box>
  )

  const renderHiddenItem = (data, rowMap) => (
    <HStack flex="1" pl="2">
      <Pressable
        w="70"
        ml="auto"
        cursor="pointer"
        bg="coolGray.200"
        justifyContent="center"
        onPress={() => closeRow(rowMap, data.item.MAC)}
        _pressed={{
          opacity: 0.5
        }}
      >
        <VStack alignItems="center" space={2}>
          <Icon icon={faEllipsis} color="coolGray.800" />
          <Text fontSize="xs" fontWeight="medium" color="coolGray.800">
            More
          </Text>
        </VStack>
      </Pressable>
      <Pressable
        w="70"
        cursor="pointer"
        bg="red.500"
        justifyContent="center"
        onPress={() => deleteRow(rowMap, data.item.MAC)}
        _pressed={{
          opacity: 0.5
        }}
      >
        <VStack alignItems="center" space={2}>
          <Icon icon={faTimes} color="white" />
          <Text color="white" fontSize="xs" fontWeight="medium">
            Delete
          </Text>
        </VStack>
      </Pressable>
    </HStack>
  )

  return (
    <View>
      <ScrollView h="calc(100vh - 96px)">
        <HStack mb={4} alignItems="center">
          <Heading fontSize="xl">Configured Devices</Heading>

          <Button
            marginLeft="auto"
            size="md"
            variant="ghost"
            colorScheme="blueGray"
            _rounded="lg"
            leftIcon={<Icon icon={faCirclePlus} />}
            onPress={handleRedirect}
          >
            Add Device
          </Button>
        </HStack>

        <Box
          bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
          rounded="md"
          w="100%"
        >
          {devices !== null ? (
            <Box safeArea>
              {/*<SwipeListView
                data={devices}
                renderItem={renderItem}
                renderHiddenItem={renderHiddenItem}
                rightOpenValue={-140}
              />*/}
              {devices.length ? (
                <FlatList
                  data={devices}
                  renderItem={renderItem}
                  keyExtractor={(item, index) => item.Name + index}
                />
              ) : (
                <Text color="muted.500">
                  There are no devices configured yet
                </Text>
              )}
            </Box>
          ) : null}
        </Box>
      </ScrollView>

      <Fab
        renderInPortal={false}
        shadow={2}
        size="sm"
        icon={<Icon color="white" icon={faPlus} />}
        onPress={handleRedirect}
      />
    </View>
  )
}

export default DeviceListing
