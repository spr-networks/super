import React, { useContext, useState, useEffect } from 'react'

import { wireguardAPI } from 'api/Wireguard'
import PeerList from 'components/Wireguard/PeerList'
import SiteVPN from 'components/Wireguard/SiteVPN'
import { AppContext } from 'AppContext'

import {
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  HStack,
  Input,
  InputField,
  ScrollView,
  Switch,
  Text,
  VStack,
  AddIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'
import { AlertContext } from 'layouts/Admin'

const Wireguard = (props) => {
  const appContext = useContext(AppContext)
  const context = useContext(AlertContext)

  let [isUp, setIsUp] = useState(true)
  let [config, setConfig] = useState({})
  let [endpoints, setEndpoints] = useState([])
  let [showInput, setShowInput] = useState(false)
  let [pendingEndpoint, setPendingEndpoint] = useState('')

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

    wireguardAPI
      .getEndpoints()
      .then((endpoints) => {
        if (endpoints) {
          setEndpoints(endpoints)
        }
      })
      .catch((err) => {
        context.error('Wireguard plugin is disabled')
      })
  }, [])

  const addDomain = () => {
    setShowInput(true)
  }

  const deleteDomain = (v) => {
    let s = endpoints.filter((e) => e != v)
    setEndpoints(s)
    wireguardAPI.setEndpoints(s).then(() => {})
  }

  const handleEndpoint = (v) => {
    setPendingEndpoint(v)
  }

  const updateNewDomain = () => {
    if (!pendingEndpoint.length) {
      return context.error('Missing endpoint domain')
    }

    let s = endpoints ? endpoints.concat(pendingEndpoint) : [pendingEndpoint]
    setPendingEndpoint('')
    setShowInput(false)
    setEndpoints(s)
    wireguardAPI.setEndpoints(s).then(() => {})
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
      <ListHeader title="Wireguard"></ListHeader>

      <Box
        bg="$backgroundCardLight"
        sx={{
          _dark: {
            bg: '$backgroundCardDark'
          }
        }}
        p="$4"
        mb="$4"
      >
        <HStack space="md">
          <VStack flex={1} space="md" sx={{ '@md': { flexDirection: 'row' } }}>
            {config.listenPort ? (
              <>
                <Text size="sm">
                  Wireguard is listening on port {config.listenPort} with
                  PublicKey:
                </Text>
                <Text size="sm" italic>
                  {config.publicKey}
                </Text>
              </>
            ) : (
              <Text size="sm">
                Wireguard is not running. See /configs/wireguard/wg0.conf
              </Text>
            )}
          </VStack>
          <Switch marginLeft="auto" value={isUp} onToggle={handleChange} />
        </HStack>
      </Box>

      <ListHeader
        title="Default Endpoint"
        description="Set default endpoint clients should connect to"
      ></ListHeader>
      <FlatList
        data={endpoints}
        renderItem={({ item }) => (
          <ListItem>
            <Text flex={1} bold>
              {item}
            </Text>

            <Button size="sm" variant="link" onPress={() => deleteDomain(item)}>
              <ButtonIcon as={CloseIcon} color="$red700" />
            </Button>
          </ListItem>
        )}
      />

      {showInput ? (
        <ListItem>
          <Input w="$full">
            <InputField
              type="text"
              placeholder="yourdomain.com"
              value={pendingEndpoint}
              autoFocus={false}
              onChangeText={(value) => handleEndpoint(value)}
              onSubmitEditing={updateNewDomain}
            />
          </Input>
        </ListItem>
      ) : null}

      <Button
        sx={{ '@md': { display: endpoints.length ? 'none' : 'flex' } }}
        action="primary"
        variant="solid"
        rounded="$none"
        onPress={addDomain}
      >
        <ButtonText>Add Endpoint</ButtonText>
        <ButtonIcon as={AddIcon} />
      </Button>

      <PeerList defaultEndpoints={endpoints} />

      {!appContext.isPlusDisabled ? <SiteVPN /> : null}
    </ScrollView>
  )
}

export default Wireguard
