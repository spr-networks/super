import React from 'react'
import PropTypes from 'prop-types'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'

import ModalForm from 'components/ModalForm'
import DNSAddOverride from 'components/DNS/DNSAddOverride'
import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'
import { format as timeAgo } from 'timeago.js'

import {
  Box,
  FlatList,
  Heading,
  IconButton,
  Stack,
  HStack,
  VStack,
  Text,
  useColorModeValue
} from 'native-base'

const DNSOverrideList = (props) => {
  const context = React.useContext(AlertContext)

  const deleteListItem = async (item) => {
    blockAPI
      .deleteOverride(item)
      .then((res) => {
        props.notifyChange('config')
      })
      .catch((error) => {
        context.error('API Failure: ' + error.message)
      })
  }

  let modalRef = React.useRef(null) //React.createRef()

  const notifyChange = async () => {
    if (props.notifyChange) {
      await props.notifyChange('config')
    }
    // close modal when added
    modalRef.current()
  }

  let overrideType = props.title.includes('Block') ? 'block' : 'permit'
  let list = props.list

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p={4}
      mb={4}
    >
      <HStack justifyContent="space-between" alignContent="center">
        <VStack>
          <Heading fontSize="md">{props.title || 'DNS Override'}</Heading>
          <Text color="muted.500">Set rules for DNS queries</Text>
        </VStack>

        <ModalForm
          title={'Add ' + props.title}
          triggerText="add"
          triggerIcon={faPlus}
          modalRef={modalRef}
        >
          <DNSAddOverride type={overrideType} notifyChange={notifyChange} />
        </ModalForm>
      </HStack>

      <FlatList
        data={list}
        renderItem={({ item }) => (
          <Box
            borderBottomWidth={1}
            _dark={{
              borderColor: 'muted.600'
            }}
            borderColor="muted.200"
            py={2}
          >
            <Stack
              direction={{ base: 'column', md: 'row' }}
              space={3}
              justifyContent="space-evenly"
              alignItems="center"
            >
              <HStack flex={1} space={2}>
                <Stack space={2} direction={{ base: 'column', md: 'row' }}>
                  <Text bold>{item.Domain}</Text>
                  <HStack space={2}>
                    <Text
                      display={{ base: 'none', md: 'flex' }}
                      color="muted.500"
                    >
                      =
                    </Text>
                    <Text>{item.ResultIP}</Text>
                  </HStack>
                </Stack>
              </HStack>

              <Stack
                flex={1}
                space={2}
                direction={{ base: 'column', md: 'row' }}
                justifyContent="space-between"
              >
                <HStack space={1}>
                  <Text color="muted.500">Client:</Text>
                  <Text>{item.ClientIP}</Text>
                </HStack>

                <HStack space={1}>
                  <Text color="muted.500">Expiration:</Text>
                  <Text>
                    {item.Expiration
                      ? timeAgo(new Date(item.Expiration * 1e3))
                      : 'Never'}
                  </Text>
                </HStack>
              </Stack>

              <IconButton
                alignSelf="center"
                size="sm"
                variant="ghost"
                colorScheme="secondary"
                icon={<Icon icon={faXmark} />}
                onPress={() => deleteListItem(item)}
              />
            </Stack>
          </Box>
        )}
        keyExtractor={(item) => item.Domain}
      />
    </Box>
  )
}

DNSOverrideList.propTypes = {
  title: PropTypes.string.isRequired,
  list: PropTypes.array,
  notifyChange: PropTypes.func
}

export default DNSOverrideList
