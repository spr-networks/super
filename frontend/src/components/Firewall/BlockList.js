import React, { useRef } from 'react'
import PropTypes from 'prop-types'

import { firewallAPI } from 'api'
import ModalForm from 'components/ModalForm'
import AddBlock from './AddBlock'

import {
  Badge,
  BadgeText,
  Button,
  ButtonText,
  ButtonIcon,
  Box,
  FlatList,
  VStack,
  Text,
  AddIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import { ListHeader, ListItem } from 'components/List'

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
      <ListHeader
        title={title}
        description="Block traffic coming into the network at the PREROUTING stage"
      >
        <ModalForm
          title={`Add IP Block`}
          triggerText="Add IP Block"
          triggerProps={{
            sx: {
              '@base': { display: 'none' },
              '@md': { display: list.length ? 'flex' : 'none' }
            }
          }}
          modalRef={refModal}
        >
          <AddBlock notifyChange={notifyChange} />
        </ModalForm>
      </ListHeader>

      <Box>
        <FlatList
          data={list}
          renderItem={({ item }) => (
            <ListItem>
              <Badge action="info" variant="outline">
                <BadgeText>{item.Protocol}</BadgeText>
              </Badge>

              <Text>{item.SrcIP}</Text>
              <Text>{item.DstIP}</Text>

              <Button
                alignSelf="center"
                size="sm"
                action="negative"
                variant="link"
                onPress={() => deleteListItem(item)}
              >
                <ButtonIcon as={CloseIcon} color="$red700" />
              </Button>
            </ListItem>
          )}
          keyExtractor={(item) => `${item.Protocol}${item.SrcIP}${item.DstIP}`}
        />

        <VStack>
          {!list.length ? (
            <Text px="$4" mb="$4" flexWrap="wrap">
              Block inbound WAN traffic from reaching a private IP address on
              the LAN.
            </Text>
          ) : null}

          <Button
            sx={{ '@md': { display: list.length ? 'none' : 'flex' } }}
            action="primary"
            variant="solid"
            rounded="$none"
            onPress={() => refModal.current()}
          >
            <ButtonText>Add IP Block</ButtonText>
            <ButtonIcon as={AddIcon} />
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
