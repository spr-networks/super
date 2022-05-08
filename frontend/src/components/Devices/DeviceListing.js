import { useContext, useEffect, useState } from 'react'
import { deviceAPI } from 'api'
import { useHistory } from 'react-router-dom'
import Device from 'components/Devices/Device'
import { AlertContext } from 'layouts/Admin'

import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'

import {
  Button,
  Box,
  Divider,
  Fab,
  Heading,
  Icon,
  IconButton,
  Stack,
  HStack,
  VStack,
  ScrollView,
  Switch,
  Text,
  View,
  useColorModeValue
} from 'native-base'

const DeviceListing = (props) => {
  const [devices, setDevices] = useState(null)
  const history = useHistory()
  const context = AlertContext

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
    history.push('/admin/add_device')
  }

  return (
    <View>
      <ScrollView h="calc(100vh - 96px)">
        <Box
          _light={{ bg: 'warmGray.50' }}
          _dark={{ bg: 'blueGray.800' }}
          rounded="md"
          w="100%"
          p="4"
        >
          <HStack mb="4">
            <Heading fontSize="lg">Configured Devices</Heading>

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
              {devices.length ? (
                <VStack space="4" w="100%" divider={<Divider />}>
                  {/*
              <HStack w="100%" alignItems="stretch">
                <Text flex={1.5} bold color="emerald.400">
                  Name
                </Text>
                <Text flex="1" bold color="emerald.400">
                  IP/MAC
                </Text>
                <Text flex="1" bold color="emerald.400" textAlign="center">
                  Auth
                </Text>
                <Text flex="2" bold color="emerald.400">
                  Groups &amp; Tags
                </Text>

                <Text w="50" bold color="emerald.400" justifySelf="right">
                  Delete
                </Text>
              </HStack>
              */}
                  {devices.map((device) => (
                    <Device
                      key={device.Name}
                      device={device}
                      notifyChange={refreshDevices}
                    />
                  ))}
                </VStack>
              ) : (
                <Text color="muted.500">
                  There are no devices configured yet
                </Text>
              )}
            </>
          ) : null}

          {/*<Button
          size="md"
          variant="outline"
          colorScheme="primary"
          rounded="full"
          borderColor="info.400"
          leftIcon={<Icon as={FontAwesomeIcon} icon={faPlus} />}
          onPress={handleRedirect}
        >
          Add Device
        </Button>*/}
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
