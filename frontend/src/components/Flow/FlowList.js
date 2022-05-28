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
  faTag,
  faTags,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { firewallAPI } from 'api'
import ModalForm from 'components/ModalForm'
//import AddBlock from './AddBlock'
import { AlertContext } from 'AppContext'
import { FlowCard, TriggerCardDate, ActionCardBlock } from './FlowCard'
import AddFlowCard from './AddFlowCard'

import {
  Badge,
  Box,
  Button,
  FlatList,
  FormControl,
  SectionList,
  Heading,
  IconButton,
  Input,
  Stack,
  HStack,
  VStack,
  Menu,
  Pressable,
  Text,
  Popover,
  useColorModeValue,
  Divider
} from 'native-base'

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
    //context.alert(`TODO: Add ${type}`)
    props.addCard(type)
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
            <TriggerCardDate item={item} edit={true} />
          ) : (
            <ActionCardBlock item={item} edit={true} />
          )}
        </Box>
      )}
      renderSectionFooter={({ section: { title, type } }) => (
        <Button
          _variant="subtle"
          variant="ghost"
          colorScheme="muted"
          rounded="md"
          leftIcon={<Icon icon={faCirclePlus} color="muted.500" />}
          onPress={() => addCard(type.replace(/s$/, ''))}
        >
          Add card
        </Button>
      )}
    />
  )
}

const FlowList = (props) => {
  const context = useContext(AlertContext)
  const [cardType, setCardType] = useState('trigger')
  //=trigger/actions
  let trigger = {
    type: 'Date',
    from: '10:00',
    to: '18:00',
    days: ['mon', 'tue', 'wed', 'thu', 'fri']
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

  // NOTE addCard is selecting a card from already created ones
  const addCard = (type) => {
    setCardType(type)
    refModal.current()
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
          title={`Add ${cardType} to flow`}
          triggerText="Add Flow"
          triggerIcon={faPlus}
          modalRef={refModal}
        >
          <AddFlowCard cardType={cardType} />
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
              <Icon icon={faArrowRightLong} color="muted.200" size="10x" />
            </Box>
          </Box>
        )}
        keyExtractor={(item, index) => index}
      />

      <Divider my={4} color="violet.400" />

      <Heading size="sm">Add flow</Heading>

      <Flow trigger={trigger} action={action} addCard={addCard} />

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
