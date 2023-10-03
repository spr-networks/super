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
        <VStack maxW={{ base: 'full', md: '60%' }}>
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
          triggerProps={{
            display: { base: 'none', md: list.length ? 'flex' : 'none' }
          }}
          modalRef={refModal}
        >
          <AddForwardBlock notifyChange={notifyChange} />
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
            <Text flexWrap="wrap">
              Control forward and block rules on the LAN.
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
