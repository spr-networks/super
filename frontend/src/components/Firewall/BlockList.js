import React, { useRef } from 'react'
import PropTypes from 'prop-types'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faCirclePlus,
  faPlus,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { firewallAPI } from 'api'
import ModalForm from 'components/ModalForm'
import AddBlock from './AddBlock'

import {
  Badge,
  Button,
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

const BlockList = (props) => {
  let list = props.list || []
  let title = props.title || `BlockList:`

  let refModal = useRef(null)

  const deleteListItem = (item) => {
    const done = (res) => {
      props.notifyChange('block')
    }

    firewallAPI.deleteBlock(item).then(done)
  }

  const notifyChange = (t) => {
    refModal.current()
    props.notifyChange('block')
  }

  return (
    <>
      <HStack justifyContent="space-between" alignItems="center" mb={4}>
        <VStack maxW="60%">
          <Heading fontSize="md" isTruncated>
            {title}
          </Heading>
        </VStack>
        <ModalForm
          title={`Add IP Block`}
          triggerText="Add IP Block"
          modalRef={refModal}
        >
          <AddBlock notifyChange={notifyChange} />
        </ModalForm>
      </HStack>

      <Box
        bg={useColorModeValue('warmGray.50', 'blueGray.800')}
        rounded="md"
        width="100%"
        p={4}
        mb={4}
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
              <HStack
                space={3}
                justifyContent="space-between"
                alignItems="center"
              >
                <Badge variant="outline">{item.Protocol}</Badge>

                <Text>{item.SrcIP}</Text>
                <Text>{item.DstIP}</Text>

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
          keyExtractor={(item) => `${item.Protocol}${item.SrcIP}${item.DstIP}`}
        />

        <VStack>
          {!list.length ? (
            <Text alignSelf={'center'}>
              There are no block rules configured yet
            </Text>
          ) : null}
          <Button
            display={{ base: 'flex', md: list.length ? 'none' : 'flex' }}
            variant={useColorModeValue('subtle', 'solid')}
            colorScheme="muted"
            leftIcon={<Icon icon={faCirclePlus} />}
            onPress={() => refModal.current()}
            mt={4}
          >
            Add IP Block
          </Button>
        </VStack>
      </Box>
    </>
  )
}

BlockList.propTypes = {
  notifyChange: PropTypes.func.isRequired
}

export default BlockList
