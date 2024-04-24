import React, { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  Input,
  InputField,
  InfoIcon,
  Link,
  HStack,
  VStack,
  Switch,
  Text,
  CloseIcon,
  LinkText,
  ScrollView,
  Spinner,
  ButtonSpinner,
  AddIcon,
  CheckIcon
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'
import { Tooltip } from 'components/Tooltip'

import { api, pluginAPI } from 'api'
import { AppContext, alertState } from 'AppContext'
import ModalForm from 'components/ModalForm'
import AddPlugin from 'components/Plugins/AddPlugin'
import { MonitorCheckIcon } from 'lucide-react-native'

const PluginList = (props) => {
  const [list, _setList] = useState([])
  const [plusList, setPlusList] = useState([])

  const [token, setToken] = useState('')
  const [activeToken, setActiveToken] = useState('')
  const [updated, setUpdated] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const navigate = useNavigate()

  const setList = (plugins) => {
    _setList(plugins.filter((x) => x.Plus == false))
    setPlusList(plugins.filter((x) => x.Plus == true))
  }

  const getPluginVersionName = (plugin) => {
    let name = plugin.Name.toLowerCase()
    if (name.match(/^dns-(block|log)-extension$/)) {
      name = 'dns'
    }

    return `super${name}`
  }

  //get each plugin version
  const fetchVersions = async (plugins) => {
    let names = plugins.map(getPluginVersionName)
    let res = await api.version(names)
    let pluginsV = [...plugins].map((p) => {
      let k = getPluginVersionName(p)
      p.Version = res[k] || 'none'
      return p
    })

    setList(pluginsV)
  }

  const refreshList = (next) => {
    pluginAPI
      .list()
      .then((plugins) => {
        setList(plugins)
        fetchVersions(plugins)
          .then((withVersion) => {})
          .catch((err) => {})
      })
      .catch((err) => {
        alertState.error('failed to fetch plugins')
      })

    pluginAPI
      .getPlusToken()
      .then((token) => {
        setActiveToken(token)
      })
      .catch((err) => {
        alertState.error('failed to check plus settings')
      })
  }

  useEffect(() => {
    refreshList()
  }, [])

  const handleChange = (plugin, value) => {
    plugin.Enabled = value
    pluginAPI
      .update(plugin)
      .then((plugins) => {
        setList(plugins)
      })
      .catch((err) => {
        alertState.error('Failed to update plugin state: ' + err.message)
      })

    if (plugin.Plus == true) {
      if (value == false) {
        pluginAPI.stopPlusExtension(plugin.Name)
      } else {
        pluginAPI.startPlusExtension(plugin.Name)
      }
    }
  }

  const deleteListItem = (row) => {
    pluginAPI
      .remove(row)
      .then((res) => {
        refreshList()
      })
      .catch((err) => {})
  }

  const refModal = useRef(null)

  const notifyChange = (type) => {
    refModal.current()
    refreshList()
  }

  const handleToken = (value) => {
    setToken(value)
    setUpdated(true)
  }

  const handleTokenSubmit = () => {
    //navigate('/admin/plugins')
    if (updated) {
      setUpdated(false)
      pluginAPI
        .setPlusToken(token)
        .then((res) => {
          alertState.success('PLUS enabled')
          refreshList()
        })
        .catch((err) => {
          alertState.error('Failed to install PLUS token: ' + err.message)
        })
    }
  }

  const verifyToken = () => {
    setIsLoading(true)
    pluginAPI
      .validPlusToken()
      .then((res) => {
        setIsLoading(false)
        alertState.success('Token login ok')
      })
      .catch((err) => {
        setIsLoading(false)
        alertState.error('failed to login using token')
      })
  }

  const renderItem = ({ item }) => (
    <ListItem>
      <VStack flex={1} space="sm">
        <Tooltip label={`URI: ${item.URI || 'not set'}`}>
          <Text size="md" bold>
            {item.Name}
          </Text>
        </Tooltip>

        <HStack space="sm">
          {item.Version === undefined ? (
            <Spinner size="small" />
          ) : (
            <Badge
              variant="outline"
              action={item.Version ? 'success' : 'muted'}
              alignSelf="center"
            >
              <BadgeText>{item.Version || 'none'}</BadgeText>
            </Badge>
          )}

          {item.Enabled && item.HasUI ? (
            <Tooltip label={'Show plugin UI'}>
              <Button
                variant="link"
                action="secondary"
                size="sm"
                onPress={() =>
                  navigate(
                    '/admin/custom_plugin/' + encodeURIComponent(item.URI)
                  )
                }
              >
                <ButtonIcon as={MonitorCheckIcon} size={24} />
              </Button>
            </Tooltip>
          ) : null}
        </HStack>
      </VStack>

      <VStack
        flex={2}
        space="md"
        sx={{
          '@base': { display: 'none' },
          '@md': { display: 'flex' }
        }}
        alignItems="flex-end"
      >
        {/*item.UnixPath ? (
          <HStack space="sm">
            <Text size="sm" color="$muted500">
              Socket Path
            </Text>
            <Text size="sm" isTruncated>
              {item.UnixPath}
            </Text>
          </HStack>
        ) : null*/}

        {item.ComposeFilePath ? (
          <HStack space="sm">
            <Text size="sm" color="$muted500">
              Compose Path
            </Text>
            <Text size="sm" isTruncated>
              {item.ComposeFilePath}
            </Text>
          </HStack>
        ) : null}
      </VStack>

      <HStack space="4xl">
        <Box w={100} alignItems="center" alignSelf="center">
          <Switch
            value={item.Enabled}
            onValueChange={() => handleChange(item, !item.Enabled)}
          />
        </Box>

        <Button
          alignSelf="center"
          variant="link"
          onPress={() => deleteListItem(item)}
          ml="$8"
        >
          <ButtonIcon as={CloseIcon} color="$red700" />
        </Button>
      </HStack>
    </ListItem>
  )

  return (
    <ScrollView sx={{ '@md': { h: '92vh' } }}>
      <ListHeader title="Plugins" description="">
        <HStack space="sm">
          <Button
            size="sm"
            action="secondary"
            onPress={() => navigate('/admin/custom_plugin/:name')}
          >
            <ButtonText>Add Plugin from URL</ButtonText>
            <ButtonIcon as={AddIcon} ml="$2" />
          </Button>
          <ModalForm
            title="Add a new Plugin"
            triggerText="New Plugin"
            modalRef={refModal}
          >
            <AddPlugin notifyChange={notifyChange} />
          </ModalForm>
        </HStack>
      </ListHeader>

      <FlatList
        data={list}
        estimatedItemSize={100}
        renderItem={renderItem}
        keyExtractor={(item) => JSON.stringify(item)}
      />

      {activeToken !== '' ? (
        <>
          <ListHeader title="PLUS Plugins" />

          <FlatList
            data={plusList}
            estimatedItemSize={100}
            renderItem={renderItem}
            keyExtractor={(item) => item.Name}
          />
        </>
      ) : (
        <></>
      )}

      <ListHeader
        title={activeToken == '' ? 'Enable PLUS' : 'Reset PLUS Token'}
      >
        <HStack space="md" alignItems="center">
          <InfoIcon color="$muted500" />
          <Link isExternal href="https://www.supernetworks.org/plus.html">
            <LinkText>Learn about PLUS Mode</LinkText>
          </Link>
        </HStack>
      </ListHeader>

      <VStack
        space="md"
        p="$4"
        mb="$4"
        bg="$backgroundCardLight"
        sx={{
          '@md': { flexDirection: 'row' },
          _dark: {
            bg: '$backgroundCardDark'
          }
        }}
      >
        <Input
          sx={{
            '@md': { width: 440 }
          }}
        >
          <InputField
            onChangeText={(value) => handleToken(value)}
            onSubmitEditing={handleTokenSubmit}
            onMouseLeave={handleTokenSubmit}
            type="text"
            variant="underlined"
            placeholder={activeToken || 'Token'}
            onChangeText={handleToken}
            onSubmitEditing={handleTokenSubmit}
            onMouseLeave={handleTokenSubmit}
          />
        </Input>
        <Button onPress={handleTokenSubmit} isDisabled={!token?.length}>
          <ButtonIcon as={CheckIcon} mr="$2" />

          <ButtonText>Update token</ButtonText>
        </Button>
        {activeToken?.length ? (
          <Button action="secondary" onPress={verifyToken}>
            {isLoading ? (
              <ButtonSpinner mr="$2" />
            ) : (
              <ButtonIcon as={CheckIcon} mr="$2" />
            )}
            <ButtonText>Verify token</ButtonText>
          </Button>
        ) : null}
      </VStack>
    </ScrollView>
  )
}

export default PluginList
