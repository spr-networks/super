import { useContext, useEffect, useState } from 'react'
import { deviceAPI } from 'api'
import { useNavigate } from 'react-router-dom'
import Device from 'components/Devices/Device'
import { AlertContext } from 'layouts/Admin'

import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faEllipsis, faPlus, faTimes } from '@fortawesome/free-solid-svg-icons'

import {
  Button,
  Box,
  Divider,
  Fab,
  FlatList,
  Heading,
  Icon,
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
//import { SwipeListView } from 'react-native-swipe-list-view'

const DeviceListing = (props) => {
  const [devices, setDevices] = useState(null)
  const navigate = useNavigate()
  const context = useContext(AlertContext)

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
  }

  useEffect(() => {
    refreshDevices()
  }, [])

  const handleRedirect = () => {
    navigate('/admin/add_device')
  }

  /*
  const closeRow = (rowMap, rowKey) => {
    if (rowMap[rowKey]) {
      rowMap[rowKey].closeRow()
    }
  }

  const deleteRow = (rowMap, rowKey) => {
    console.log('delete row:', rowKey)
    //closeRow(rowMap, rowKey)
    //const newData = [...devices]
    //const prevIndex = devices.findIndex((item) => item.key === rowKey)
    //newData.splice(prevIndex, 1)
    //setDevices(newData)
  }

  const onRowDidOpen = (rowKey) => console.log('row opened', rowKey)
  */
  const renderItem = ({ item }) => (
    <Device device={item} notifyChange={refreshDevices} />
  )

  /*
  const renderHiddenItem = (data, rowMap) => (
    <HStack flex="1" pl="2">
      <Pressable
        w="70"
        ml="auto"
        cursor="pointer"
        bg="coolGray.200"
        justifyContent="center"
        onPress={() => closeRow(rowMap, data.item.key)}
        _pressed={{
          opacity: 0.5
        }}
      >
        <VStack alignItems="center" space={2}>
          <Icon
            as={<Icon as={FontAwesomeIcon} icon={faEllipsis} />}
            size="xs"
            color="coolGray.800"
          />
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
        onPress={() => deleteRow(rowMap, data.item.key)}
        _pressed={{
          opacity: 0.5
        }}
      >
        <VStack alignItems="center" space={2}>
          <Icon
            as={<Icon as={FontAwesomeIcon} icon={faTimes} />}
            color="white"
            size="xs"
          />
          <Text color="white" fontSize="xs" fontWeight="medium">
            Delete
          </Text>
        </VStack>
      </Pressable>
    </HStack>
  )*/

  return (
    <View>
      <ScrollView h="calc(100vh - 96px)">
        <Box
          bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
          rounded="md"
          w="100%"
          p={4}
        >
          <HStack mb="4">
            <Heading fontSize="xl">Configured Devices</Heading>

            <Button
              marginLeft="auto"
              size="md"
              variant="outline"
              colorScheme="primary"
              rounded="full"
              borderWidth={1}
              borderColor="info.400"
              leftIcon={<Icon as={FontAwesomeIcon} icon={faPlus} />}
              onPress={handleRedirect}
            >
              Add Device
            </Button>
          </HStack>

          {devices !== null ? (
            <>
              {/*<SwipeListView
                data={devices}
                renderItem={renderItem}
                renderHiddenItem={renderHiddenItem}
                rightOpenValue={-130}
                previewRowKey={'0'}
                previewOpenValue={-40}
                previewOpenDelay={3000}
                onRowDidOpen={onRowDidOpen}
              />*/}

              {devices.length ? (
                <FlatList
                  data={devices}
                  renderItem={renderItem}
                  keyExtractor={(item) => item.Name}
                />
              ) : (
                <Text color="muted.500">
                  There are no devices configured yet
                </Text>
              )}
            </>
          ) : null}
        </Box>
      </ScrollView>

      <Fab
        renderInPortal={false}
        shadow={2}
        size="sm"
        icon={
          <Icon color="white" as={FontAwesomeIcon} icon={faPlus} size="sm" />
        }
        onPress={handleRedirect}
      />
    </View>
  )
}

export default DeviceListing
