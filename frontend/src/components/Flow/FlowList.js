import { useContext, useEffect, useRef, useState } from 'react'
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
import { FlowCard, Cards, NewCard } from './FlowCard'
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

const CardList = ({ title, cards: defaultCards, cardType, edit, ...props }) => {
  const [cards, setCards] = useState(defaultCards)
  let refModal = useRef(null)

  useEffect(() => {
    if (props.onChange) {
      props.onChange(cards)
    }
  }, [cards])

  const addCard = (type) => {
    refModal.current()
  }

  const handleAddCard = (item) => {
    if (cards.filter((card) => card.title === item.title).length) {
      return
    }

    refModal.current()
    setCards(cards.concat(item))
  }

  const onChange = (item) => {
    setCards(cards.map((card) => (card.title == item.title ? item : card)))
  }

  const onDelete = (item) => {
    setCards(cards.filter((card) => card.title !== item.title))
  }

  return (
    <VStack space={2}>
      <Text bold>{title}</Text>

      <FlatList
        data={cards}
        listKey={`list${cardType}`}
        keyExtractor={(item, index) => index}
        renderItem={({ item, index }) => (
          <FlowCard
            edit={edit}
            card={item}
            onChange={onChange}
            onDelete={onDelete}
            mb={2}
          />
        )}
      />

      {edit ? (
        <>
          <ModalForm
            key={`form${cardType}`}
            title={`Add ${cardType} to flow`}
            modalRef={refModal}
          >
            <AddFlowCard cardType={cardType} onSubmit={handleAddCard} />
          </ModalForm>

          <Button
            _variant="subtle"
            variant="ghost"
            colorScheme="muted"
            rounded="md"
            leftIcon={<Icon icon={faCirclePlus} color="muted.500" />}
            onPress={() => addCard(cardType)}
            disabled={cards.length}
            key={'add' + cardType}
          >
            Add card
          </Button>
        </>
      ) : null}
    </VStack>
  )
}

// Add/Edit flow
const Flow = ({ edit, ...props }) => {
  const context = useContext(AlertContext)
  // NOTE we have multiple but only support one atm.
  const [triggers, setTriggers] = useState(props.actions || [])
  const [actions, setActions] = useState(props.triggers || [])

  const onSubmit = () => {
    let data = []

    data.push(
      triggers.map((card) => {
        return { type: card.title, ...card.values }
      })
    )

    data.push(
      actions.map((card) => {
        return { type: card.title, ...card.values }
      })
    )

    console.log('save this:', data)
  }

  return (
    <Stack direction={edit ? 'column' : 'row'} maxW={350}>
      <CardList
        title="When..."
        cards={triggers}
        onChange={setTriggers}
        cardType="trigger"
        edit={edit}
      />
      <CardList
        title="Then..."
        cards={actions}
        onChange={setActions}
        cardType="action"
        edit={edit}
      />

      {edit ? (
        <Button variant="solid" colorScheme="primary" mt={4} onPress={onSubmit}>
          Save
        </Button>
      ) : null}
    </Stack>
  )
}

const FlowList = (props) => {
  const context = useContext(AlertContext)

  let trigger = NewCard({
    title: 'Date',
    cardType: 'trigger',
    values: { days: 'mon,tue', from: '09:23', to: '16:23' }
  })

  let action = NewCard({
    title: 'Block TCP',
    cardType: 'action',
    values: { SrcIP: '192.168.2.23', DstIP: '23.23.23.23' }
  })

  let flows = [{ triggers: [trigger], actions: [action] }]

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
            <Flow triggers={item.triggers} actions={item.actions} />
          </Box>
        )}
        keyExtractor={(item, index) => index}
      />

      <Divider my={4} color="violet.400" />

      <Heading size="sm">Add flow</Heading>

      <Flow edit={true} />

      {!flows.length ? <Text>There are no flows configured yet</Text> : null}
    </Box>
  )
}

export default FlowList
