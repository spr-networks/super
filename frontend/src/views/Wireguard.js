import React, { useContext, useState, useEffect } from 'react'

import { wireguardAPI } from 'api/Wireguard'
import PeerList from 'components/Wireguard/PeerList'
import SiteVPN from 'components/Wireguard/SiteVPN'
import { AppContext } from 'AppContext'
import Icon, { FontAwesomeIcon } from 'FontAwesomeUtils'
import { faXmark, faCirclePlus } from '@fortawesome/free-solid-svg-icons'

import {
  Box,
  Button,
  FlatList,
  Heading,
  HStack,
  IconButton,
  Input,
  Stack,
  Switch,
  Text,
  View,
  ScrollView,
  useColorModeValue
} from 'native-base'

const Wireguard = (props) => {
  const context = useContext(AppContext)

  let [isUp, setIsUp] = useState(true)
  let [config, setConfig] = useState({})
  let [endpoints, setEndpoints] = useState([])
  let [showInput, setShowInput] = useState(false)
  let [pendingEndpoint, setPendingEndpoint] = useState("")

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

    wireguardAPI.getEndpoints().then(endpoints => {
      setEndpoints(endpoints)
    })

  }, [])

  const addDomain = () => {
    setShowInput(true)
  }

  const deleteDomain = (v) => {
    let s = endpoints.filter(e => e != v)
    setEndpoints(s)
    wireguardAPI.setEndpoints(s).then( () => {})
  }

  const handleEndpoint = (v) => {
    setPendingEndpoint(v)
  }

  const updateNewDomain = () => {
    let s = endpoints.concat(pendingEndpoint)
    setPendingEndpoint("")
    setShowInput(false)
    setEndpoints(s)
    wireguardAPI.setEndpoints(s).then( () => {})
  }

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
    <ScrollView>
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

      <Box
      _light={{ bg: 'backgroundCardLight' }}
      _dark={{ bg: 'backgroundCardDark' }}
      p={4}
      mb={4}
      mx={4}
      >
        <Heading fontSize="sm">Default Endpoints</Heading>
        <Box>
        <FlatList
          data={endpoints}
          renderItem={({ item }) => (
            <HStack
              space={2}
              justifyContent="space-between"
              alignItems="center"
              bg="backgroundCardLight"
              borderBottomWidth={1}
              _dark={{
                bg: 'backgroundCardDark',
                borderColor: 'borderColorCardDark'
              }}
              borderColor="borderColorCardLight"
              p={4}
            >
              <Stack
                flex={1}
                space={1}
                direction={{ base: 'column', md: 'row' }}
                justifyContent="space-between"
              >
                <Text flex="1" bold>
                  {item}
                </Text>
                <IconButton
                  alignSelf="center"
                  size="sm"
                  variant="ghost"
                  colorScheme="secondary"
                  icon={<Icon icon={faXmark} />}
                  onPress={() => deleteDomain(item)}
                />
              </Stack>
            </HStack>
          )}/>
        </Box>
        {(showInput ?

          <Input
            size="lg"
            type="text"
            w="100%"
            value={pendingEndpoint}
            autoFocus={false}
            onChangeText={(value) => handleEndpoint(value)}
            onSubmitEditing={updateNewDomain}
            placeholder="yourdomain.com"
          />


          : null)}
      </Box>
      <Button
        display={{
          base: 'flex',
          md: 'flex'
        }}
        variant={useColorModeValue('subtle', 'solid')}
        colorScheme={useColorModeValue('muted', 'muted')}
        leftIcon={<Icon icon={faCirclePlus} />}
        onPress={addDomain}
        mt={4}
      >
        Add Endpoint
      </Button>


      <PeerList
        defaultEndpoints={endpoints}
       />

      {!context.isPlusDisabled ? (
        //PLUS feature
        <SiteVPN />
      ) : null}
    </ScrollView>
  )
}

export default Wireguard
