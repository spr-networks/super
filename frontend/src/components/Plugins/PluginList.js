import React, { useContext, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'

import {
  View,
  Divider,
  Box,
  Heading,
  Icon,
  IconButton,
  Stack,
  HStack,
  VStack,
  Switch,
  Text,
  useColorModeValue
} from 'native-base'

import { pluginAPI } from 'api'
import { APIErrorContext } from 'layouts/Admin'
import ModalForm from 'components/ModalForm'
import Toggle from 'components/Toggle'
import AddPlugin from 'components/Plugins/AddPlugin'

const PluginList = (props) => {
  const [list, setList] = useState([])
  const contextType = useContext(APIErrorContext)

  const refreshList = (next) => {
    pluginAPI
      .list()
      .then((plugins) => {
        setList(plugins)
      })
      .catch((err) => {
        contextType.reportError('failed to fetch plugins')
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
      <HStack alignItems="stretch" mb="4">
        <Heading sz="sm">Plugins</Heading>
        <Box marginLeft="auto">
          <ModalForm
            title="Add a new Plugin"
            triggerText="Add a plugin"
            modalRef={refModal}
          >
            <AddPlugin notifyChange={notifyChange} />
          </ModalForm>
        </Box>
      </HStack>

      {list.length ? (
        <>
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <VStack space="1" w="100%" pr="5">
              <Stack direction="row" alignItems="stretch">
                <Text flex="1" bold color="emerald.400">
                  Name
                </Text>
                <Text flex="1" bold color="emerald.400">
                  URI
                </Text>
                <Text flex="2" bold color="emerald.400">
                  UnixPath
                </Text>
                <Text flex="1" bold color="emerald.400">
                  Active
                </Text>
                <Text
                  bold
                  w="50"
                  justifySelf="right"
                  textAlign="right"
                  color="emerald.400"
                >
                  Delete
                </Text>
              </Stack>
              <Divider _light={{ bg: 'muted.200' }} />
              {list.map((row, i) => (
                <>
                  <Stack direction="row" py="4" alignItems="stretch">
                    <Box flex="1">{row.Name}</Box>
                    <Box flex="1">{row.URI}</Box>
                    <Box flex="2">{row.UnixPath}</Box>
                    <Box flex="1">
                      <Switch
                        defaultIsChecked={row.Enabled}
                        onValueChange={() => handleChange(row, !row.Enabled)}
                      />
                    </Box>
                    <Box w="50" justifySelf="right">
                      <IconButton
                        size="sm"
                        mt="-1"
                        variant="ghost"
                        colorScheme="secondary"
                        icon={<Icon as={FontAwesomeIcon} icon={faXmark} />}
                        onPress={(e) => deleteListItem(row)}
                      />
                    </Box>
                  </Stack>
                  <Divider _light={{ bg: 'muted.200' }} />
                </>
              ))}
            </VStack>
          </View>
        </>
      ) : null}
    </Box>
  )
}

export default PluginList
