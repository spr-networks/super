import React, { useRef, useContext } from 'react'
import PropTypes from 'prop-types'

import { firewallAPI } from 'api'
import ModalForm from 'components/ModalForm'
import AddContainerInterfaceRule from './AddContainerInterfaceRule'
import { AppContext } from 'AppContext'

import {
  Badge,
  BadgeText,
  Button,
  ButtonText,
  ButtonIcon,
  Box,
  FlatList,
  HStack,
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
  const appContext = useContext(AppContext)

  const deleteListItem = (item) => {
    const done = (res) => {
      props.notifyChange('custom_interface')
    }

    firewallAPI.deleteCustomInterfaceRule(item).then(done)
  }

  const notifyChange = (t) => {
    refModal.current()
    props.notifyChange('custom_interface')
  }


  return (
    <VStack>
      <ListHeader
        title={title}
        description="Manage network access for custom interface names"
      >
        <ModalForm
          title={`Add Custom Interface Rule`}
          triggerText="Add Custom Interface Rule"
          triggerProps={{
            sx: {
              '@base': { display: 'none' },
              '@md': { display: list.length ? 'flex' : 'flex' }
            }
          }}
          modalRef={refModal}
        >
          <AddContainerInterfaceRule notifyChange={notifyChange} appContext={appContext} />
        </ModalForm>
      </ListHeader>

      <FlatList
        data={list}
        renderItem={({ item }) => (
          <ListItem>

            <Text>{item.Interface}</Text>
            <Text>{item.SrcIP}</Text>
            <HStack>
            { ["DNS", "LAN", "WAN"].map((entry) => {
              if (item[entry]) {
                return <Badge action="muted" variant="outline">
                  <BadgeText>{entry}</BadgeText>
                </Badge>
              }
            })}
            </HStack>

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
        <ButtonText>Add Interface Rule</ButtonText>
        <ButtonIcon as={AddIcon} />
      </Button>
    </VStack>
  )
}

ContainerInterfaceRulesList.propTypes = {
  notifyChange: PropTypes.func.isRequired
}

export default ContainerInterfaceRulesList
