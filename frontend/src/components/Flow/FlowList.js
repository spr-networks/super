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
import { FlowCard, Token, TriggerCardDate, ActionCardBlock } from './FlowCard'
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
import { setSyntheticTrailingComments } from 'typescript'

// Add/Edit flow
const Flow = (props) => {
  const context = useContext(AlertContext)
  const [cardType, setCardType] = useState('trigger')
  const [sections, setSections] = useState([
    {
      title: 'When...',
      type: 'triggers',
      data: []
    },
    {
      title: 'Then...',
      type: 'actions',
      data: []
    }
  ])
  const [triggers, setTriggers] = useState([])
  const [actions, setActions] = useState([])

  let { trigger, action } = props

  useEffect(() => {}, [])

  useEffect(() => {
    setSections([
      {
        title: 'When...',
        type: 'triggers',
        data: triggers
      },
      {
        title: 'Then...',
        type: 'actions',
        data: actions
      }
    ])
  }, [triggers, actions])

  let refModal = useRef(null)

  // NOTE addCard is selecting a card from already created ones
  const addCard = (type) => {
    setCardType(type)
    refModal.current()
  }

  // TODO refactor to use list instead of trigger or action checks
  // TODO dynamic vars? see if possible:
  // - Date have 0 vars at start, add a var - choose "day", "hour" etc.

  const handleAddCard = (card) => {
    // TODO verify not added / same conditions
    refModal.current()
    if (cardType == 'trigger') {
      setTriggers(triggers.concat(card))
    } else {
      setActions(actions.concat(card))
    }
  }

  const handleDelete = (item) => {
    if (cardType == 'trigger') {
      setTriggers(triggers.filter((card) => card.title !== item.title))
    } else {
      setActions(actions.filter((card) => card.title !== item.title))
    }
  }

  return (
    <>
      <ModalForm
        title={`Add ${cardType} to flow`}
        triggerText="Add Flow"
        triggerIcon={faPlus}
        modalRef={refModal}
      >
        <AddFlowCard cardType={cardType} onSubmit={handleAddCard} />
      </ModalForm>

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
            <FlowCard
              edit={true}
              title={item.title}
              description={
                <HStack space={2}>
                  {Object.keys(item.props).map((k) => (
                    <Token
                      value={k}
                      onChange={(value) => {
                        item.props[k] = value
                      }}
                    />
                  ))}
                </HStack>
              }
              onDelete={() => handleDelete(item)}
              icon={<Icon icon={item.icon} color={item.color} size="12x" />}
            />
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
    </>
  )
}

const FlowList = (props) => {
  const context = useContext(AlertContext)

  //=trigger/actions
  let trigger = {
    title: 'Date',
    icon: faClock,
    color: 'violet.300',
    props: {
      from: '10:00',
      to: '18:00',
      days: ['mon', 'tue', 'wed', 'thu', 'fri']
    }
  }

  let action = { Protocol: 'tcp', SrcIP: '1.2.3.4', DstIP: '1.2.3.4' }

  let flows = [{ trigger, action }]

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
