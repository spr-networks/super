import React, { useContext, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'

import {
  View,
  Divider,
  Box,
  FlatList,
  Heading,
  Icon,
  IconButton,
  Stack,
  HStack,
  VStack,
  Spacer,
  Switch,
  Text,
  useColorModeValue
} from 'native-base'

import { pluginAPI } from 'api'
import { AlertContext } from 'layouts/Admin'
import ModalForm from 'components/ModalForm'
import AddPlugin from 'components/Plugins/AddPlugin'

const PluginList = (props) => {
  const [list, setList] = useState([])
  const contextType = useContext(AlertContext)

  const refreshList = (next) => {
    pluginAPI
      .list()
      .then((plugins) => {
        setList(plugins)
      })
      .catch((err) => {
        contextType.error('failed to fetch plugins')
      })
  }

  useEffect(() => {
    refreshList()
  }, [])

  const handleChange = (plugin, value) => {
    plugin.Enabled = value
    pluginAPI.update(plugin).then(setList)
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

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p="4"
    >
      <HStack justifyContent="space-between">
        <Heading fontSize="xl" pb="3" alignSelf="center">
          Plugins
        </Heading>

        <Box alignSelf="center">
          <ModalForm
            title="Add a new Plugin"
            triggerText="Add a plugin"
            modalRef={refModal}
          >
            <AddPlugin notifyChange={notifyChange} />
          </ModalForm>
        </Box>
      </HStack>

      <FlatList
        data={list}
        renderItem={({ item }) => (
          <Box
            borderBottomWidth="1"
            _dark={{
              borderColor: 'muted.600'
            }}
            borderColor="muted.200"
            py="2"
          >
            <HStack space={3} justifyContent="space-between">
              <VStack minW="20%">
                <Text bold>{item.Name}</Text>
                <Text>{item.URI}</Text>
              </VStack>

              <Text alignSelf="center" isTruncated>
                {item.UnixPath}
              </Text>
              <Spacer />
              <Box w="100" alignItems="center" alignSelf="center">
                <Switch
                  size="lg"
                  defaultIsChecked={item.Enabled}
                  onValueChange={() => handleChange(item, !item.Enabled)}
                />
              </Box>

              <IconButton
                alignSelf="center"
                size="sm"
                variant="ghost"
                colorScheme="secondary"
                icon={<Icon as={FontAwesomeIcon} icon={faXmark} />}
                onPress={() => deleteListItem(item)}
              />
            </HStack>
          </Box>
        )}
        keyExtractor={(item) => item.Name}
      />
    </Box>
  )
}

export default PluginList
