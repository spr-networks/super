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
import AddForwardBlock from './AddForwardBlock'

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

import { FlashList } from '@shopify/flash-list'

const ForwardBlockList = (props) => {
  let list = props.list || []
  let title = props.title || `ForwardBlockList:`

  let refModal = useRef(null)

  const deleteListItem = (item) => {
    const done = (res) => {
      props.notifyChange('block')
    }

    firewallAPI.deleteForwardBlock(item).then(done)
  }

  const notifyChange = (t) => {
    refModal.current()
    props.notifyChange('block')
  }

  return (
    <>
      <HStack justifyContent="space-between" alignItems="center" p={4}>
        <VStack maxW="60%">
          <Heading fontSize="md" isTruncated>
            {title}
          </Heading>
          <Text color="muted.500" isTruncated>
            Add rules to block traffic at the FORWARDING stage
          </Text>
        </VStack>
        <ModalForm
          title={`Add Forwarding Block`}
          triggerText="Add Forwarding Block"
          modalRef={refModal}
        >
          <AddForwardBlock notifyChange={notifyChange} />
        </ModalForm>
      </HStack>

      <Box
        bg={useColorModeValue('warmGray.50', 'blueGray.800')}
        _rounded={{ md: 'md' }}
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
                <Text>{item.DstPort}</Text>

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
              There are no forwarding block rules configured yet
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
            Add Forwarding Block
          </Button>
        </VStack>
      </Box>
    </>
  )
}

ForwardBlockList.propTypes = {
  notifyChange: PropTypes.func.isRequired
}

export default ForwardBlockList
