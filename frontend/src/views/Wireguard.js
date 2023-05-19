import React, { useContext, useState, useEffect } from 'react'

import { wireguardAPI } from 'api/Wireguard'
import PeerList from 'components/Wireguard/PeerList'
import SiteVPN from 'components/Wireguard/SiteVPN'
import { AppContext } from 'AppContext'

import {
  Box,
  Heading,
  HStack,
  Stack,
  Switch,
  Text,
  View,
  useColorModeValue
} from 'native-base'

const Wireguard = (props) => {
  const context = useContext(AppContext)

  let [isUp, setIsUp] = useState(true)
  let [config, setConfig] = useState({})

  const getStatus = () => {
    wireguardAPI
      .status()
      .then((status) => {
        if (
          !status ||
          !Object.keys(status).length ||
          !status.wg0 ||
          !status.wg0.listenPort
        ) {
          setIsUp(false)
          return
        }

        let publicKey = status.wg0.publicKey,
          listenPort = status.wg0.listenPort

        setConfig({ publicKey, listenPort })
      })
      .catch((err) => {
        setIsUp(false)
      })
  }

  useEffect(() => {
    getStatus()
  }, [])

  const handleChange = () => {
    let done = (res) => {
      let value = !isUp
      if (!isUp) {
        getStatus()
      } else {
        setConfig({})
      }
      setIsUp(value)
    }

    if (isUp) {
      wireguardAPI
        .down()
        .then(done)
        .catch((err) => {})
    } else {
      wireguardAPI
        .up()
        .then(done)
        .catch((err) => {})
    }
  }

  return (
    <View>
      <HStack alignItems="center" p={4}>
        <Heading fontSize="md">Wireguard</Heading>

        <Switch
          marginLeft="auto"
          isChecked={isUp}
          onValueChange={handleChange}
        />
      </HStack>
      <Box
        _light={{ bg: 'backgroundCardLight' }}
        _dark={{ bg: 'backgroundCardDark' }}
        p={4}
        mb={4}
        mx={4}
      >
        <Box>
          {config.listenPort ? (
            <Stack direction={{ base: 'column', md: 'row' }} space={1}>
              <Text>
                Wireguard is listening on port {config.listenPort} with
                PublicKey:
              </Text>
              <Text italic>{config.publicKey}</Text>
            </Stack>
          ) : (
            <Text>
              Wireguard is not running. See /configs/wireguard/wg0.conf
            </Text>
          )}
        </Box>
      </Box>

      <PeerList />

      {!context.isPlusDisabled ? (
        //PLUS feature
        <SiteVPN />
      ) : null}
    </View>
  )
}

export default Wireguard
