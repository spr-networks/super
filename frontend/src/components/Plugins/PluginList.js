import React, { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faCircleInfo,
  faPlus,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import {
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
  useColorModeValue
} from 'native-base'

import { FlashList } from '@shopify/flash-list'

import { pluginAPI } from 'api'
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

  const refreshList = (next) => {
    pluginAPI
      .list()
      .then((plugins) => {
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
    pluginAPI.update(plugin).then(setList)
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
        renderItem={({ item }) => (
          <Box
            bg="warmGray.50"
            borderBottomWidth={1}
            borderColor="muted.200"
            _dark={{
              bg: 'blueGray.800',
              borderColor: 'muted.600'
            }}
            p={4}
          >
            <HStack space={3} justifyContent="space-between">
              <VStack minW="20%">
                <Text bold>{item.Name}</Text>
                <Text>{item.URI}</Text>
              </VStack>

              <Text
                alignSelf="center"
                isTruncated
                display={{ base: 'none', md: true }}
              >
                {item.UnixPath}
              </Text>
              <Spacer />
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
        )}
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
            renderItem={({ item }) => (
              <Box
                bg="warmGray.50"
                borderBottomWidth={1}
                borderColor="muted.200"
                _dark={{
                  bg: 'blueGray.800',
                  borderColor: 'muted.600'
                }}
                p={4}
              >
                <HStack space={3} justifyContent="space-between">
                  <VStack minW="20%">
                    <Text bold>{item.Name}</Text>
                    <Text>{item.URI}</Text>
                  </VStack>

                  <Text
                    alignSelf="center"
                    isTruncated
                    display={{ base: 'none', md: true }}
                  >
                    {item.UnixPath}
                  </Text>
                  <Spacer />
                  <HStack
                    alignSelf="center"
                    space={1}
                    display={{ base: 'none', md: true }}
                  >
                    <Text color="muted.500">Compose Path</Text>
                    <Text isTruncated>{item.ComposeFilePath}</Text>
                  </HStack>
                  <Spacer />
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
            )}
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
        bg={useColorModeValue('warmGray.50', 'blueGray.800')}
        width="100%"
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
