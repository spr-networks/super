import React, { useRef, useContext, useState, useEffect } from 'react'
import PropTypes from 'prop-types'

import { firewallAPI, api } from 'api'
import ModalForm from 'components/ModalForm'
import AddContainerInterfaceRule from './AddContainerInterfaceRule'
import { AlertContext, AppContext } from 'AppContext'

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
import { PolicyItem, GroupItem, TagItem } from 'components/TagItem'

const ContainerInterfaceRulesList = (props) => {
  let list = props.list || []
  let title = props.title || `ContainerInterfaceRulesList:`

  let refModal = useRef(null)
  const appContext = useContext(AppContext)
  const alertContext = useContext(AlertContext)
  const [interfaceList, setInterfaceList] = useState([])
  const [netBlocks, setNetblocks] = useState([])

  useEffect(() => {
    api
      .get('/info/dockernetworks')
      .then((docker) => {
        let networked = docker.filter(
          (n) => n.Options && n.Options['com.docker.network.bridge.name']
        )

        let s = []
        let blocks = []
        for (let n of networked) {
          let iface = n.Options['com.docker.network.bridge.name']
          s.push(iface)
          if (n.IPAM?.Config?.[0]?.Subnet) {
            blocks.push(n.IPAM.Config[0].Subnet)
          }
        }
        setInterfaceList(s)
        setNetblocks(blocks)
      })
      //.catch((err) => alertContext.error('fail ' + err))
      .catch((err) => {})
  }, [])

  const deleteListItem = (item) => {
    const done = (res) => {
      props.notifyChange('custom_interface')
    }

    firewallAPI
      .deleteCustomInterfaceRule(item)
      .then(done)
      .catch((err) => {
        alertContext.error('Firewall API Failure', err)
      })
  }

  const notifyChange = (t) => {
    refModal.current()
    props.notifyChange('custom_interface')
  }

  return (
    <VStack>
      <ListHeader
        title={title}
        description="Manage network access policy for custom interfaces"
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
          <AddContainerInterfaceRule
            notifyChange={notifyChange}
            appContext={appContext}
            interfaceList={interfaceList}
            netBlocks={netBlocks}
          />
        </ModalForm>
      </ListHeader>

      <FlatList
        data={list}
        renderItem={({ item }) => (
          <ListItem>
            <VStack
              flex={1}
              space="md"
              sx={{ '@md': { flexDirection: 'row' } }}
            >
              <Text flex={2} bold>
                {item.Interface}
              </Text>
              <Text flex={1}>{item.RuleName}</Text>
              <Text flex={1}>{item.SrcIP}</Text>
              <Text flex={1}>{item.RouteDst}</Text>
            </VStack>
            <HStack flex={1} space="sm">
              {item.Policies
                ? item.Policies.map((entry) => (
                    <PolicyItem key={entry} name={entry} />
                  ))
                : null}
            </HStack>
            <HStack flex={1} space="sm">
              {item.Groups
                ? item.Groups.map((entry) => (
                    <GroupItem key={entry} name={entry} />
                  ))
                : null}
            </HStack>

            <HStack flex={1} space="sm">
              {item.Tags
                ? item.Tags.map((entry) => <TagItem key={entry} name={entry} />)
                : null}
            </HStack>

            <HStack>
              {item.SetRoute ? (
                <Badge action="muted" variant="outline">
                  <BadgeText>setRoute</BadgeText>
                </Badge>
              ) : null}
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
        keyExtractor={(item) => `${list.indexOf(item)}-ciface`}
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
