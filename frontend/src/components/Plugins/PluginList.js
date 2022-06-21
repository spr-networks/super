import React, { useContext, useEffect, useRef, useState } from 'react'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'

import {
  Box,
  FlatList,
  Heading,
  IconButton,
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
    <>
      <HStack justifyContent="space-between" alignItems="center">
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
      <Box
        bg={useColorModeValue('warmGray.50', 'blueGray.800')}
        rounded="md"
        width="100%"
        p={4}
        my={4}
      >
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
      </Box>
    </>
  )
}

export default PluginList
