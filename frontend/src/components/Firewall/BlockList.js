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

import { FlashList } from '@shopify/flash-list'

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
      <HStack justifyContent="space-between" alignItems="center" p={4}>
        <VStack maxW={{ base: 'full', md: '60%' }}>
          <Heading fontSize="md" isTruncated>
            {title}
          </Heading>
          <Text color="muted.500" flexWrap="wrap">
            Block traffic coming into the network at the PREROUTING stage
          </Text>
        </VStack>
        <ModalForm
          title={`Add IP Block`}
          triggerText="Add IP Block"
          triggerProps={{
            display: { base: 'none', md: list.length ? 'flex' : 'none' }
          }}
          modalRef={refModal}
        >
          <AddBlock notifyChange={notifyChange} />
        </ModalForm>
      </HStack>

      <Box px={4} mb={4}>
        <FlatList
          data={list}
          renderItem={({ item }) => (
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
            <Text flexWrap="wrap">
              Block inbound WAN traffic from reaching a private IP address on
              the LAN.
            </Text>
          ) : null}
          <Button
            display={{ base: 'flex', md: list.length ? 'none' : 'flex' }}
            variant={useColorModeValue('subtle', 'solid')}
            colorScheme={useColorModeValue('primary', 'muted')}
            rounded="none"
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
