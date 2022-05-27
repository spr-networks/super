import { useContext, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Icon } from 'FontAwesomeUtils'
import {
  faAddressCard,
  faArrowRight,
  faArrowRightLong,
  faBan,
  faCircleInfo,
  faCirclePlus,
  faClock,
  faEllipsis,
  faPlus,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { firewallAPI } from 'api'
import ModalForm from 'components/ModalForm'
//import AddBlock from './AddBlock'
import { AlertContext } from 'AppContext'
import FlowCard from './FlowCard'

import {
  Badge,
  Box,
  Button,
  FlatList,
  SectionList,
  Heading,
  IconButton,
  Image,
  Stack,
  HStack,
  VStack,
  Menu,
  Pressable,
  Text,
  View,
  useColorModeValue,
  Divider
} from 'native-base'

const TriggerCardDate = ({ item, ...props }) => (
  <FlowCard
    title="Date"
    description={
      <Text>
        Weekdays {item.from} - {item.to}
      </Text>
    }
    icon={
      <Icon
        icon={faClock}
        color="violet.300"
        size={props.size == 'xs' ? '8x' : '12x'}
      />
    }
    {...props}
  />
)

const ActionCardBlock = ({ item, ...props }) => (
  <FlowCard
    title={`Block ${item.Protocol.toUpperCase()}`}
    description={
      <HStack space={1}>
        Source <Text bold>{item.SrcIP}</Text> Dest
        <Text bold>{item.DstIP}</Text>
      </HStack>
    }
    icon={
      <Icon
        icon={faBan}
        color="red.400"
        size={props.size == 'xs' ? '8x' : '12x'}
      />
    }
    {...props}
  />
)

// Add/Edit flow
const Flow = (props) => {
  const context = useContext(AlertContext)

  let { trigger, action } = props
  let sections = [
    {
      title: 'When...',
      type: 'triggers',
      data: [trigger]
    },
    {
      title: 'Then...',
      type: 'actions',
      data: [action]
    }
  ]

  const addCard = (type) => {
    context.alert(`TODO: Add ${type}`)
  }

  return (
    <SectionList
      px={2}
      w={360}
      sections={sections}
      keyExtractor={(item, index) => index}
      renderSectionHeader={({ section: { title } }) => (
        <Text mt={4} bold>
          {title}
        </Text>
      )}
      renderItem={({ item, section: { title, type } }) => (
        <Box py={4}>
          {type == 'triggers' ? (
            <TriggerCardDate item={item} />
          ) : (
            <ActionCardBlock item={item} />
          )}
        </Box>
      )}
      renderSectionFooter={({ section: { title, type } }) => (
        <Button
          variant="subtle"
          colorScheme="muted"
          rounded="md"
          leftIcon={<Icon icon={faCirclePlus} color="muted.500" />}
          onPress={() => addCard(type)}
        >
          Add card
        </Button>
      )}
    />
  )
}

const FlowList = (props) => {
  const context = useContext(AlertContext)
  //=trigger/actions
  let trigger = {
    type: 'Date',
    from: '10:00',
    to: '18:00',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  }

  let action = { Protocol: 'tcp', SrcIP: '1.2.3.4', DstIP: '1.2.3.4' }

  let flows = [{ trigger, action }]

  let refModal = useRef(null)

  /*
  const deleteListItem = (item) => {
    const done = (res) => {
      props.notifyChange('block')
    }

    firewallAPI.deleteBlock(item).then(done)
  }*/

  const notifyChange = (t) => {
    refModal.current()
    props.notifyChange('block')
  }

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p={4}
      mb={4}
    >
      <HStack justifyContent="space-between" alignContent="center">
        <VStack>
          <Heading fontSize="xl">Flows</Heading>
        </VStack>
        <ModalForm
          title={`Add Flow`}
          triggerText="Add Flow"
          triggerIcon={faPlus}
          modalRef={refModal}
        >
          <Text>TODO</Text>
        </ModalForm>
      </HStack>

      <HStack space={3} justifyContent="space-around" alignItems="center">
        <Text w={360} bold textAlign="center" color="muted.700">
          When...
        </Text>
        <Text w={360} bold textAlign="center" color="muted.700">
          Then...
        </Text>
      </HStack>

      <FlatList
        data={flows}
        renderItem={({ item }) => (
          <Box
            borderBottomWidth={1}
            _dark={{
              borderColor: 'muted.600'
            }}
            borderColor="muted.200"
            py={10}
          >
            <HStack space={3} justifyContent="space-around" alignItems="center">
              <TriggerCardDate size="xs" item={item.trigger} />
              <ActionCardBlock size="xs" item={item.action} />
            </HStack>
            <Box
              w={320}
              mx="auto"
              mt={-50}
              mb={50}
              style={{ positon: 'relative', zIndex: -1 }}
              alignItems="center"
            >
              {/*<Divider />*/}
              <Icon icon={faArrowRightLong} color="muted.200" size="10x" />
            </Box>
          </Box>
        )}
        keyExtractor={(item, index) => index}
      />

      <Divider my={4} color="violet.400" />

      <Heading size="sm">Add flow</Heading>

      <Flow trigger={trigger} action={action} />

      {!flows.length ? <Text>There are no flows configured yet</Text> : null}
    </Box>
  )
}

/*
FlowList.propTypes = {
  notifyChange: PropTypes.func.isRequired
}
*/

export default FlowList
