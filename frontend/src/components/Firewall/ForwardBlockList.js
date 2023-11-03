import React, { useRef } from 'react'
import PropTypes from 'prop-types'

import { firewallAPI } from 'api'
import ModalForm from 'components/ModalForm'
import AddForwardBlock from './AddForwardBlock'

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
    <VStack>
      <ListHeader
        title={title}
        description="Add rules to block traffic at the FORWARDING stage"
      >
        <ModalForm
          title={`Add Forwarding Block`}
          triggerText="Add Forwarding Block"
          triggerProps={{
            sx: {
              '@base': { display: 'none' },
              '@md': { display: list.length ? 'flex' : 'flex' }
            }
          }}
          modalRef={refModal}
        >
          <AddForwardBlock notifyChange={notifyChange} />
        </ModalForm>
      </ListHeader>

      <FlatList
        data={list}
        renderItem={({ item }) => (
          <ListItem>
            <Badge action="muted" variant="outline">
              <BadgeText>{item.Protocol}</BadgeText>
            </Badge>

            <Text>{item.SrcIP}</Text>
            <Text>{item.DstIP}</Text>
            <Text>{item.DstPort}</Text>

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

      {!list.length ? (
        <Text
          bg="$backgroundCardLight"
          sx={{ _dark: { bg: '$backgroundCardDark' } }}
          p="$4"
          flexWrap="wrap"
        >
          Control forward and block rules on the LAN.
        </Text>
      ) : null}

      <Button
        sx={{ '@md': { display: list.length ? 'none' : 'none' } }}
        action="primary"
        variant="solid"
        rounded="$none"
        onPress={() => refModal.current()}
      >
        <ButtonText>Add Forwarding Block</ButtonText>
        <ButtonIcon as={AddIcon} />
      </Button>
    </VStack>
  )
}

ForwardBlockList.propTypes = {
  notifyChange: PropTypes.func.isRequired
}

export default ForwardBlockList
