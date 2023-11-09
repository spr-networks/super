import React, { useRef } from 'react'
import PropTypes from 'prop-types'

import { firewallAPI } from 'api'
import ModalForm from 'components/ModalForm'
import AddContainerInterfaceRule from './AddContainerInterfaceRule'

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

const ContainerInterfaceRulesList = (props) => {
  let list = props.list || []
  let title = props.title || `ContainerInterfaceRulesList:`

  let refModal = useRef(null)

  const deleteListItem = (item) => {
    const done = (res) => {
      props.notifyChange('container_interface')
    }

    firewallAPI.deleteContainerInterfaceRule(item).then(done)
  }

  const notifyChange = (t) => {
    refModal.current()
    props.notifyChange('container_interface')
  }

  return (
    <VStack>
      <ListHeader
        title={title}
        description="Add rules to allow custom docker networks access"
      >
        <ModalForm
          title={`Add Container Interface Rule`}
          triggerText="Add Container Interface Rule"
          triggerProps={{
            sx: {
              '@base': { display: 'none' },
              '@md': { display: list.length ? 'flex' : 'flex' }
            }
          }}
          modalRef={refModal}
        >
          <AddContainerInterfaceRule notifyChange={notifyChange} />
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
          Control access for custom docker networks
        </Text>
      ) : null}

      <Button
        sx={{ '@md': { display: list.length ? 'none' : 'none' } }}
        action="primary"
        variant="solid"
        rounded="$none"
        onPress={() => refModal.current()}
      >
        <ButtonText>Add Container Interface Rule</ButtonText>
        <ButtonIcon as={AddIcon} />
      </Button>
    </VStack>
  )
}

ContainerInterfaceRulesList.propTypes = {
  notifyChange: PropTypes.func.isRequired
}

export default ContainerInterfaceRulesList
