import React, { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from 'FontAwesomeUtils'
import { faCircleInfo, faXmark } from '@fortawesome/free-solid-svg-icons'

import {
  Badge,
  Box,
  FlatList,
  Heading,
  IconButton,
  Input,
  Link,
  HStack,
  VStack,
  Spacer,
  Switch,
  Text,
  View,
  useColorModeValue,
  Tooltip
} from 'native-base'

import { FlashList } from '@shopify/flash-list'

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
        alertState.error('failed to fetch plugin version ' + name)
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
    pluginAPI.update(plugin).then(async (plugins) => {
      plugins = await getVersion(plugins)
      setList(plugins)
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
      <Box
        bg="backgroundCardLight"
        borderBottomWidth={1}
        _dark={{
          bg: 'backgroundCardDark',
          borderColor: 'borderColorCardDark'
        }}
        borderColor="borderColorCardLight"
        p={4}
      >
        <HStack space={3} justifyContent="space-between">
          <VStack minW="20%" space={1}>
            <Tooltip label={`URI: ${item.URI}`}>
              <Text bold>{item.Name}</Text>
            </Tooltip>

            <Badge
              variant={item.Version ? 'outline' : 'outline'}
              colorScheme={item.Version ? 'trueGray' : 'muted'}
              rounded="sm"
              alignSelf="flex-start"
            >
              {item.Version || 'none'}
            </Badge>
          </VStack>

          <Text
            alignSelf="center"
            isTruncated
            display={{ base: 'none', md: true }}
          >
            {item.UnixPath}
          </Text>
          <Spacer />

          {item.ComposeFilePath ? (
            <HStack
              alignSelf="center"
              space={1}
              display={{ base: 'none', md: true }}
            >
              <Text color="muted.500">Compose Path</Text>
              <Text isTruncated>{item.ComposeFilePath}</Text>
            </HStack>
          ) : null}

          <Box w="100" alignItems="center" alignSelf="center">
            <Switch
              defaultIsChecked={item.Enabled}
              onValueChange={() => handleChange(item, !item.Enabled)}
            />
          </Box>

          <IconButton
            alignSelf="center"
            size="sm"
            variant="ghost"
            colorScheme="secondary"
            icon={<Icon icon={faXmark} />}
            onPress={() => deleteListItem(item)}
          />
        </HStack>
      </Box>
    )
  }

  return (
    <View h={'100%'}>
      <HStack p={4} justifyContent="space-between" alignItems="center">
        <Heading fontSize="md">Plugins</Heading>

        <Box alignSelf="center">
          <ModalForm
            title="Add a new Plugin"
            triggerText="Add Plugin"
            modalRef={refModal}
          >
            <AddPlugin notifyChange={notifyChange} />
          </ModalForm>
        </Box>
      </HStack>

      <FlatList
        data={list}
        estimatedItemSize={100}
        renderItem={renderItem}
        keyExtractor={(item) => item.Name}
      />

      {activeToken !== '' ? (
        <>
          <Heading fontSize="md" p={4}>
            PLUS
          </Heading>

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

      <HStack p={4} justifyContent="space-between" alignItems="center">
        <Heading fontSize="md">
          {activeToken == '' ? 'Enable PLUS' : 'Reset PLUS Token'}
        </Heading>
        <HStack space={2} alignItems="center">
          <Icon icon={faCircleInfo} color="muted.500" />
          <Link _text="text" isExternal href="https://www.supernetworks.org/">
            Learn about PLUS Mode
          </Link>
        </HStack>
      </HStack>

      <Box
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        p={4}
        mb={4}
      >
        <Input
          size="lg"
          type="text"
          variant="underlined"
          placeholder={activeToken || 'Token'}
          onChangeText={(value) => handleToken(value)}
          onSubmitEditing={handleTokenSubmit}
          onMouseLeave={handleTokenSubmit}
        />
      </Box>
    </View>
  )
}

export default PluginList
