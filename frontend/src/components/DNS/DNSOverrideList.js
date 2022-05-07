import React from 'react'
import PropTypes from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'

import ModalForm from 'components/ModalForm'
import DNSAddOverride from 'components/DNS/DNSAddOverride'
import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'

import {
  Box,
  FlatList,
  Heading,
  Icon,
  IconButton,
  Stack,
  HStack,
  VStack,
  Skeleton,
  Spacer,
  Spinner,
  Switch,
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
    //modalRef.current()
  }

  let overrideType = props.title.includes('Block') ? 'block' : 'permit'
  let list = props.list

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p="4"
      mb="4"
    >
      <HStack justifyContent="space-between" alignContent="center">
        <VStack>
          <Heading fontSize="xl">{props.title || 'DNS Override'}</Heading>
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
            borderBottomWidth="1"
            _dark={{
              borderColor: 'muted.600'
            }}
            borderColor="muted.200"
            py="2"
          >
            <HStack space={3} justifyContent="space-evenly" alignItems="center">
              <HStack flex="1" space={2}>
                <Stack space={2} direction={{ base: 'column', md: 'row' }}>
                  <Text bold>{item.Domain}</Text>
                  <HStack space={2}>
                    <Text color="muted.500">=</Text>
                    <Text>{item.ResultIP}</Text>
                  </HStack>
                </Stack>
              </HStack>

              <Stack
                flex="1"
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
                  <Text>{item.Expiration}</Text>
                </HStack>
              </Stack>

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
        keyExtractor={(item) => item.Domain}
      />
    </Box>
  )
}

DNSOverrideList.propTypes = {
  title: PropTypes.string.isRequired,
  list: PropTypes.array.isRequired,
  notifyChange: PropTypes.func
}

export default DNSOverrideList
