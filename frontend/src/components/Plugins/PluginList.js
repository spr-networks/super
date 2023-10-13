import React, { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  FlatList,
  Input,
  InputField,
  InfoIcon,
  Link,
  HStack,
  VStack,
  Switch,
  Text,
  View,
  CloseIcon,
  LinkText,
  Tooltip,
  TooltipContent,
  TooltipText
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'

import { api, pluginAPI } from 'api'
import { AppContext, alertState } from 'AppContext'
import ModalForm from 'components/ModalForm'
import AddPlugin from 'components/Plugins/AddPlugin'

const PluginList = (props) => {
  const [list, _setList] = useState([])
  const [plusList, setPlusList] = useState([])

  const [token, setToken] = useState('')
  const [activeToken, setActiveToken] = useState('')
  const [updated, setUpdated] = useState(false)

  const contextType = useContext(AppContext)

  const navigate = useNavigate()

  const setList = (plugins) => {
    _setList(plugins.filter((x) => x.Plus == false))
    setPlusList(plugins.filter((x) => x.Plus == true))
  }

  //get each plugin version
  const getVersion = async (plugins) => {
    for (let i = 0; i < plugins.length; i++) {
      let name = plugins[i].Name.toLowerCase()
      if (name == 'dns-block-extension' || name == 'dns-log-extension') {
        name = 'dns'
      }

      let ver = await api.version('super' + name).catch((err) => {
        //this is noisy, we can disable for now
        //alertState.error('failed to fetch plugin version ' + name)
      })

      plugins[i].Version = ver
    }

    return plugins
  }

  const refreshList = (next) => {
    pluginAPI
      .list()
      .then(async function (plugins) {
        plugins = await getVersion(plugins)

        setList(plugins)
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
      .then(async (plugins) => {
        plugins = await getVersion(plugins)
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
    navigate('/admin/plugins')
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

  const renderItem = ({ item }) => {
    return (
      <ListItem>
        <VStack space="sm">
          <Tooltip
            placement="top"
            trigger={(triggerProps) => (
              <Text bold {...triggerProps}>
                {item.Name}
              </Text>
            )}
          >
            <TooltipContent>
              <TooltipText>{`URI: ${item.URI}`}</TooltipText>
            </TooltipContent>
          </Tooltip>

          <Badge
            variant="outline"
            action={item.Version ? 'success' : 'muted'}
            alignSelf="flex-start"
          >
            <BadgeText>{item.Version || 'none'}</BadgeText>
          </Badge>
        </VStack>

        <VStack
          flex="1"
          space="md"
          sx={{
            '@base': { display: 'none' },
            '@md': { display: 'none' }
          }}
        >
          <Text size="sm" isTruncated>
            {item.UnixPath}
          </Text>

          {item.ComposeFilePath ? (
            <HStack
              space="sm"
              sx={{
                '@base': { display: 'none' },
                '@base': { display: 'flex' }
              }}
            >
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
          <Box w="100" alignItems="center" alignSelf="center">
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
  }

  return (
    <View h={'100%'}>
      <ListHeader title="Plugins" description="">
        <ModalForm
          title="Add a new Plugin"
          triggerText="Add Plugin"
          modalRef={refModal}
        >
          <AddPlugin notifyChange={notifyChange} />
        </ModalForm>
      </ListHeader>

      <FlatList
        data={list}
        estimatedItemSize={100}
        renderItem={renderItem}
        keyExtractor={(item) => item.Name}
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
          <Link isExternal href="https://www.supernetworks.org/">
            <LinkText>Learn about PLUS Mode</LinkText>
          </Link>
        </HStack>
      </ListHeader>

      <Box
        p="$4"
        mb="$4"
        bg="$backgroundCardLight"
        sx={{
          _dark: {
            bg: '$backgroundCardDark'
          }
        }}
      >
        <Input
          onChangeText={(value) => handleToken(value)}
          onSubmitEditing={handleTokenSubmit}
          onMouseLeave={handleTokenSubmit}
        >
          <InputField
            type="text"
            variant="underlined"
            placeholder={activeToken || 'Token'}
          />
        </Input>
      </Box>
    </View>
  )
}

export default PluginList
