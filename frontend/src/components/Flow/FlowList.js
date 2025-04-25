import React, { useContext, useEffect, useState } from 'react'

import { AlertContext } from 'AppContext'
import { NewCard } from './FlowCard'
import { numToDays, toCron } from './FlowCards'
import EditFlow from './EditFlow'
import { pfwAPI } from 'api/Pfw'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  Heading,
  Icon,
  HStack,
  VStack,
  Text,
  ScrollView,
  Menu,
  MenuItem,
  MenuItemLabel,
  ThreeDotsIcon,
  TrashIcon,
  CheckIcon,
  CopyIcon,
  Input,
  InputField,
  InputIcon,
  InputSlot,
  Select,
  SelectTrigger,
  SelectInput,
  SelectPortal,
  SelectContent,
  SelectItem,
  SelectDragIndicator,
  SelectDragIndicatorWrapper,
  Divider,
  Center,
  Popover,
  PopoverBackdrop,
  PopoverBody,
  PopoverContent,
  FormControl,
  Pressable
} from '@gluestack-ui/themed'

import { dateArrayToStr } from './Utils'
import { PencilIcon, CircleSlashIcon, Search, ChevronLeft, ChevronRight, ChevronDownIcon, Plus } from 'lucide-react-native'

import { Tooltip } from 'components/Tooltip'

// Show flow card
const Flow = ({ flow, ...props }) => {
  const [title, setTitle] = useState(flow?.title)
  const [triggers, setTriggers] = useState(flow?.triggers)
  const [actions, setActions] = useState(flow?.actions)

  useEffect(() => {
    if (flow?.triggers && flow?.actions) {
      setTitle(flow.title)
      setTriggers(flow.triggers)
      setActions(flow.actions)
    }
  }, [flow])

  //set title when we update actions
  useEffect(() => {
    if (title == 'NewFlow' && actions.length) {
      let title = actions[0].title
      setTitle(title)
    }
  }, [actions])

  //mini

  const triggerBtn = (triggerProps) => (
    <Button action="secondary" variant="link" ml="auto" {...triggerProps}>
      <ButtonIcon as={ThreeDotsIcon} color="$muted600" />
    </Button>
  )

  const onEdit = () => {
    if (props.onEdit) {
      props.onEdit(flow)
    }
  }

  const onDelete = () => {
    if (props.onDelete) {
      props.onDelete(flow)
    }
  }

  const onDuplicate = () => {
    if (props.onDuplicate) {
      props.onDuplicate(flow)
    }
  }

  const onDisable = () => {
    if (props.onDisable) {
      props.onDisable(flow)
    }
  }

  const moreMenu = (
    <Menu
      flex={1}
      trigger={triggerBtn}
      selectionMode="single"
      closeOnSelect={true}
      onSelectionChange={(e) => {
        let key = e.currentKey
        if (key == 'disable') {
          onDisable()
        } else if (key == 'edit') {
          onEdit()
        } else if (key == 'duplicate') {
          onDuplicate()
        } else if (key == 'delete') {
          onDelete()
        }
      }}
    >
      <MenuItem key="disable">
        <Icon
          as={flow.disabled ? CheckIcon : CircleSlashIcon}
          color={flow.disabled ? '$success700' : '$red700'}
          mr="$2"
        />
        <MenuItemLabel size="sm">
          {flow.disabled ? 'Enable' : 'Disable'}
        </MenuItemLabel>
      </MenuItem>
      <MenuItem key="edit">
        <Icon as={PencilIcon} color="$muted500" mr="$2" />
        <MenuItemLabel size="sm">Edit</MenuItemLabel>
      </MenuItem>
      <MenuItem key="duplicate">
        <CopyIcon color="$muted500" mr="$2" />
        <MenuItemLabel size="sm">Duplicate</MenuItemLabel>
      </MenuItem>

      <MenuItem key="delete">
        <TrashIcon color="$red700" mr="$2" />
        <MenuItemLabel color="$red700">Delete</MenuItemLabel>
      </MenuItem>
    </Menu>
  )

  // TODO mini component

  let trigger = triggers[0],
    action = actions[0]

  if (!trigger || !action) {
    return <></>
  }

  const displayValue = (value, label) => {
    if (!value) {
      return value
    }

    if (label == 'Client') {
      return value.Identity || value.Group || value.SrcIP
    }

    if (label == 'Dst' || label == 'OriginalDst') {
      return value.IP || value.Domain
    }

    if (Array.isArray(value)) {
      return value.join(',')
    }

    if (label == 'days') {
      return dateArrayToStr(value.split(','))
    }

    return value
  }

  return (
    <VStack
      p="$4"
      py="$4"
      sx={{
        '@base': { flexDirection: 'column-reverse' },
        '@md': { flexDirection: 'row', p: '$8' },
        _dark: { bg: '$backgroundCardDark' }
      }}
      bg="$backgroundCardLight"
      space="md"
      shadow={2}
    >
      <VStack flex={1} space="md">
        <HStack space="md" alignItems="center">
          <HStack space="md">
            <Text bold>{title}</Text>
            <Text>{trigger.title}</Text>
            <Icon as={trigger.icon} color={trigger.color} />
            <Text>{action.title}</Text>
            <Icon as={action.icon} color={action.color} />
          </HStack>
          {flow.disabled ? (
            <Text size="xs" color="$muted500">
              Disabled
            </Text>
          ) : null}
        </HStack>

        { props.renderFields && (
          <HStack space="sm" flexWrap="wrap">
            {Object.keys(trigger.values).map((key) => (
              <Tooltip key={key} label={key}>
                <Badge variant="outline" action="muted" size="xs">
                  <BadgeText>{displayValue(trigger.values[key], key)}</BadgeText>
                </Badge>
              </Tooltip>
            ))}

            {Object.keys(action.values).map((key) => (
              <Tooltip key={key} label={key}>
                <Badge variant="outline" action="muted" size="xs">
                  <BadgeText>{displayValue(action.values[key], key)}</BadgeText>
                </Badge>
              </Tooltip>
            ))}
          </HStack>
        )}
      </VStack>
      {moreMenu}
    </VStack>
  )
}

const saveFlow = async (flow, context) => {
  let trigger = flow.triggers[0],
    action = flow.actions[0]

  console.log('flow. save:', flow)

  let data = {}

  try {
    data = {
      RuleName: flow.title,
      ...trigger.preSubmit(),
      ...(await action.preSubmit())
    }
  } catch (err) {
    context.error(err)
    return
  }

  data.Disabled = flow.disabled

  console.log('flow. put:', data)

  if (!action.submit) {
    console.error('missing submit action for', action)
  }

  return action.submit(data, flow)
}

const convertTrigger = (rule) => {
  let days = numToDays(rule.Time.Days),
    from = rule.Time.Start,
    to = rule.Time.End

  let trigger

  if (from != '') {
    trigger = NewCard({
      title: 'Date',
      cardType: 'trigger',
      values: { days, from, to }
    })
  } else {
    trigger = NewCard({
      title: 'Always',
      cardType: 'trigger',
      values: {}
    })
  }

  return trigger
}

const convertBlockRuleCard = (rule, index) => {
  let trigger = convertTrigger(rule)

  let action = NewCard({
    title: 'Block',
    cardType: 'action',
    values: {
      Protocol: rule.Protocol,
      Client: rule.Client,
      Dst: rule.Dst,
      DstPort: rule.DstPort
    }
  })

  return {
    title: rule.RuleName,
    index: parseInt(index),
    triggers: [trigger],
    actions: [action],
    disabled: rule.Disabled
  }
}

const convertForwardingRuleCard = (rule, index) => {
  let trigger = convertTrigger(rule)

  let action

  //NOTE: titles have to match or they will be invisible

  if (rule.DstInterface == '' && rule.Protocol != '') {
    action = NewCard({
      title: 'Forward',
      cardType: 'action',
      values: {
        Protocol: rule.Protocol,
        Client: rule.Client,
        OriginalDst: rule.OriginalDst,
        OriginalDstPort: rule.OriginalDstPort,
        Dst: rule.Dst,
        DstPort: rule.DstPort
      }
    })
  } else if (rule.DstInterface != '') {
    if (rule.Protocol == '') {
      action = NewCard({
        title: 'Forward all traffic to Interface, Site VPN or Uplink',
        cardType: 'action',
        values: {
          Client: rule.Client,
          OriginalDst: rule.OriginalDst,
          Dst: rule.Dst,
          DstInterface: rule.DstInterface
        }
      })
    } else {
      action = NewCard({
        title: 'Port Forward to Interface, Site VPN or Uplink',
        cardType: 'action',
        values: {
          Client: rule.Client,
          OriginalDst: rule.OriginalDst,
          OriginalDstPort: rule.OriginalDstPort,
          Dst: rule.Dst,
          Protocol: rule.Protocol,
          DstInterface: rule.DstInterface
        }
      })
    }
  }

  return {
    title: rule.RuleName,
    index: parseInt(index),
    triggers: [trigger],
    actions: [action],
    disabled: rule.Disabled
  }
}

const convertGroupRuleCard = (rule, index) => {
  let trigger = convertTrigger(rule)

  let action = NewCard({
    title: 'Set Device Groups',
    cardType: 'action',
    values: {
      Client: rule.Client,
      Groups: rule.Groups
    }
  })

  return {
    title: rule.RuleName,
    index: parseInt(index),
    triggers: [trigger],
    actions: [action],
    disabled: rule.Disabled
  }
}

const convertTagRuleCard = (rule, index) => {
  let trigger = convertTrigger(rule)

  let action = NewCard({
    title: 'Set Device Tags',
    cardType: 'action',
    values: {
      Client: rule.Client,
      Tags: rule.Tags
    }
  })

  return {
    title: rule.RuleName,
    index: parseInt(index),
    triggers: [trigger],
    actions: [action],
    disabled: rule.Disabled
  }
}

const FlowList = (props) => {
  const context = useContext(AlertContext)
  const [flows, setFlows] = useState([])
  const [filteredFlows, setFilteredFlows] = useState([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedFlowIndex, setSelectedFlowIndex] = useState(0)
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [flow, setFlow] = useState({
    title: 'NewFlow',
    triggers: [],
    actions: []
  })

  const refInput = React.useRef(null)

  // empty new/edit flow when adding/modifying flows
  const resetFlow = () => {
    setFlow({
      title: 'NewFlow',
      triggers: [],
      actions: []
    })
    setSelectedFlowIndex(-1)
  }

  const fetchFlows = () => {
    pfwAPI
      .config()
      .then((result) => {
        if (result) {
          if (result.ForwardingRules == null) {
            result.ForwardingRules = []
          }
          if (result.BlockRules == null) {
            result.BlockRules = []
          }
          if (result.GroupRules == null) {
            result.GroupRules = []
          }
          if (result.TagRules == null) {
            result.TagRules = []
          }
          let flows = [
            ...result.BlockRules.map((x, i) => convertBlockRuleCard(x, i)),
            ...result.ForwardingRules.map((x, i) =>
              convertForwardingRuleCard(x, i)
            ),
            ...result.GroupRules.map((x, i) => convertGroupRuleCard(x, i)),
            ...result.TagRules.map((x, i) => convertTagRuleCard(x, i))
          ]
          setFlows(flows)
          setFilteredFlows(flows)

          // Set the editor to edit the first flow if available
          if (flows.length > selectedFlowIndex) {
            setFlow(flows[selectedFlowIndex])
          }
        }
      })
      .catch((err) => {
        context.error(err.message)
      })
  }

  // load flows
  useEffect(() => {
    fetchFlows()
  }, [])

  // Filter flows based on search query
  const filterFlows = (query) => {
    if (!query) {
      setFilteredFlows(flows)
      return
    }

    const lowercaseQuery = query.toLowerCase()
    const filtered = flows.filter(f => {
      // Search in title
      if (f.title.toLowerCase().includes(lowercaseQuery)) {
        return true
      }

      // Search in values (via JSON stringify)
      const valuesString = JSON.stringify(f).toLowerCase()
      return valuesString.includes(lowercaseQuery)
    })

    setFilteredFlows(filtered)
  }

  useEffect(() => {
    filterFlows(searchQuery)
  }, [searchQuery, flows])

  const onSubmit = (data) => {
    // NOTE we only have one trigger + one action for now
    if (!data.triggers.length) {
      return context.error('missing trigger')
    }

    if (!data.actions.length) {
      return context.error('missing actions')
    }

    let title = data.title || 'NewFlow#1'
    let triggers = data.triggers.map((card) => NewCard({ ...card }))
    let actions = data.actions.map((card) => NewCard({ ...card }))

    let flow = { title, triggers, actions }
    // update
    if (data.index !== undefined) {
      flow.index = data.index
    }

    // send flow to api
    saveFlow(flow, context)
      .then((res) => {
        // update ui
        fetchFlows()
      })
      .catch((err) => {
        context.error(err)
      })
  }

  const onEdit = (item, index) => {
    setFlow({ index, ...item })
  }

  const onDelete = (flow, _index) => {
    let index = flow.index
    // update ui
    const done = () => {
      fetchFlows()
    }

    const deleteBlock = (index) => {
      pfwAPI
        .deleteBlock(index)
        .then(done)
        .catch((err) => context.error(err))
    }

    const deleteForward = (index) => {
      pfwAPI
        .deleteForward(index)
        .then(done)
        .catch((err) => context.error(err))
    }

    const deleteGroups = (index) => {
      pfwAPI
        .deleteGroups(index)
        .then(done)
        .catch((err) => context.error(err))
    }

    const deleteTags = (index) => {
      pfwAPI
        .deleteTags(index)
        .then(done)
        .catch((err) => context.error(err))
    }

    let actionTitle = flow.actions[0].title

    if (
      actionTitle.match(/(Block|Forward)/) ||
      actionTitle.match(/Forward to Site VPN/)
    ) {
      let ruleType = actionTitle.startsWith('Block')
        ? 'BlockRules'
        : 'ForwardingRules'

      return ruleType == 'BlockRules'
        ? deleteBlock(index)
        : deleteForward(index)
    } else if (actionTitle.match(/Set Device (Groups|Tags)/)) {
      let ruleType = actionTitle.endsWith('Groups') ? 'Groups' : 'Tags'
      return ruleType == 'Groups' ? deleteGroups(index) : deleteTags(index)
    }
  }

  const onDuplicate = (item) => {
    let newFlow = Object.assign({}, item)
    delete newFlow.index
    newFlow.title += '#copy'
    //    //tbd -> duplicate should navigate to the latest one
    saveFlow(newFlow, context).then((res) => {
      fetchFlows()
    })
  }

  const toggleDisable = (item) => {
    item.disabled = !item.disabled
    saveFlow(item, context).then((res) => {
      fetchFlows()
    })
  }

  const handleSelectFlow = (index) => {
    if (index >= 0 && index < filteredFlows.length) {
      setSelectedFlowIndex(index)
      setFlow(filteredFlows[index])
    }
  }

  const navigateFlow = (direction) => {
    const newIndex = selectedFlowIndex + direction
    if (newIndex >= 0 && newIndex < filteredFlows.length) {
      handleSelectFlow(newIndex)
    }
  }

  const renderEmptyState = () => (
    <Center p="$8">
      <VStack space="md" alignItems="center">
      </VStack>
    </Center>
  )

  const renderCurrentFlow = () => {
    if (filteredFlows.length === 0 || !filteredFlows[selectedFlowIndex]) {
      return renderEmptyState()
    }

    return (
      <Flow
        flow={filteredFlows[selectedFlowIndex]}
        onDelete={() => onDelete(filteredFlows[selectedFlowIndex], selectedFlowIndex)}
        onDisable={() => toggleDisable(filteredFlows[selectedFlowIndex])}
        onDuplicate={() => onDuplicate(filteredFlows[selectedFlowIndex])}
        onEdit={() => onEdit(filteredFlows[selectedFlowIndex], selectedFlowIndex)}
        renderFields={false}
      />
    )
  }

  return (
    <ScrollView>
      <Box
        bg="$backgroundCardLight"
        borderBottomWidth={1}
        borderBottomColor="$borderColorLight"
        py="$4"
        px="$6"
        shadow="$1"
        sx={{
          _dark: {
            bg: "$backgroundCardDark",
            borderBottomColor: "$borderColorDark"
          }
        }}
      >
        <VStack space="md">
          <HStack alignItems="center" justifyContent="space-between">
            <Heading size="lg" color="$textLight900" sx={{ _dark: { color: "$textDark50" } }}>
              Flows
            </Heading>

            <HStack space="md" alignItems="center">
              <HStack
                space="xs"
                alignItems="center"
                bg="$backgroundLight100"
                px="$2"
                py="$1"
                borderRadius="$md"
                borderWidth={1}
                borderColor="$borderColorLight"
                sx={{
                  _dark: {
                    bg: "$backgroundDark700",
                    borderColor: "$borderColorDark"
                  }
                }}
              >
                <Button
                  variant="link"
                  p="$1"
                  isDisabled={selectedFlowIndex === 0 || filteredFlows.length === 0}
                  onPress={() => navigateFlow(-1)}
                >
                  <Icon as={ChevronLeft} color={selectedFlowIndex === 0 || filteredFlows.length === 0 ? "$textLight400" : "$primary500"} />
                </Button>

                <Text fontSize="$sm" fontWeight="$medium" color="$textLight900" sx={{ _dark: { color: "$textDark50" } }}>
                  {filteredFlows.length > 0 ? `${selectedFlowIndex + 1} / ${filteredFlows.length}` : "0 / 0"}
                </Text>

                <Button
                  variant="link"
                  p="$1"
                  isDisabled={selectedFlowIndex === filteredFlows.length - 1 || filteredFlows.length === 0}
                  onPress={() => navigateFlow(1)}
                >
                  <Icon as={ChevronRight} color={selectedFlowIndex === filteredFlows.length - 1 || filteredFlows.length === 0 ? "$textLight400" : "$primary500"} />
                </Button>
              </HStack>

              <Button
                bg="$primary500"
                borderRadius="$lg"
                px={{ base: "$2", md: "$4" }}
                py="$2"
                onPress={resetFlow}
                sx={{
                  ':hover': { bg: '$primary600' },
                  ':active': { bg: '$primary700' },
                  _dark: {
                    bg: "$primary600",
                    ':hover': { bg: '$primary500' },
                    ':active': { bg: '$primary400' }
                  }
                }}
              >
                <Icon as={Plus} color="$white" />
                <ButtonText
                  color="$white"
                  fontWeight="$medium"
                  display={{ base: "none", md: "flex" }}
                  ml={{ md: "$1.5" }}
                >
                  Create New Flow
                </ButtonText>
              </Button>
            </HStack>
          </HStack>

          <HStack
            alignItems="center"
            display={{ md: "flex" }}
            mt={{ base: "$2", md: 0 }}
          >
            <Divider
              orientation="vertical"
              height="$6"
              mr="$4"
              display={{ base: "none", md: "flex" }}
              position={{ md: "absolute" }}
              left={{ md: "$36" }}
              top={{ md: "$4" }}
            />

            <Popover
              placement="bottom left"
              offset={10}
              trigger={triggerProps => (
                <Box flex={1} maxWidth={{ md: "$96" }} ml={{ md: "$40" }} mt={{ md: "-$12" }}>
                  <Pressable {...triggerProps} onPress={() => setIsPopoverOpen(true)}>
                    <Input
                      size="md"
                      borderColor="$borderColorLight"
                      borderRadius="$lg"
                      bg="$backgroundLight50"
                      sx={{
                        ':focus': {
                          borderColor: '$primary500',
                          bg: '$backgroundLight100'
                        },
                        _dark: {
                          borderColor: "$borderColorDark",
                          bg: "$backgroundDark800",
                          ':focus': {
                            borderColor: '$primary400',
                            bg: '$backgroundDark700'
                          }
                        }
                      }}
                    >
                      <InputSlot pl="$3">
                        <InputIcon as={Search} color="$textLight400" />
                      </InputSlot>
                      <InputField
                        placeholder="Search flows..."
                        value={filteredFlows.length > 0 ? filteredFlows[selectedFlowIndex]?.title : "No flows"}
                        editable={false}
                        color="$textLight900"
                        placeholderTextColor="$textLight400"
                        sx={{
                          _dark: {
                            color: "$textDark50",
                            placeholderTextColor: "$textDark400"
                          }
                        }}
                      />
                      <InputSlot pr="$3">
                        <InputIcon as={ChevronDownIcon} color="$textLight400" />
                      </InputSlot>
                    </Input>
                  </Pressable>
                </Box>
              )}
              isOpen={isPopoverOpen}
              onClose={() => setIsPopoverOpen(false)}
            >
              <PopoverContent w="$80" maxW="$full">
                <PopoverBody p="$3">
                  <VStack space="md">
                    <FormControl>
                      <Input size="sm" rounded="$md">
                        <InputSlot pl="$3">
                          <InputIcon as={Search} />
                        </InputSlot>
                        <InputField
                          ref={refInput}
                          autoFocus={true}
                          value={searchQuery}
                          onChangeText={(text) => {
                            setSearchQuery(text)
                            filterFlows(text)
                          }}
                          placeholder="Filter flows..."
                        />
                      </Input>
                    </FormControl>
                    <ScrollView maxHeight={350} showsVerticalScrollIndicator={false}>
                      <VStack space="sm" justifyContent="flex-start">
                        {filteredFlows.length === 0 ? (
                          <Text textAlign="center" p="$2" color="$muted600">No matching flows found</Text>
                        ) : (
                          filteredFlows.map((item, index) => (
                            <Pressable
                              key={`flow-${index}`}
                              onPress={() => {
                                setSelectedFlowIndex(index)
                                setFlow(item)
                                setIsPopoverOpen(false)
                              }}
                              borderWidth="$1"
                              borderColor={selectedFlowIndex === index ? "$primary500" : "$primary200"}
                              px="$4"
                              py="$3"
                              rounded="$md"
                              sx={{
                                ':hover': { borderColor: '$primary400', bg: '$primary50' },
                                _dark: {
                                  borderColor: selectedFlowIndex === index ? "$primary500" : "$coolGray600",
                                  ':hover': { borderColor: '$coolGray700', bg: '$coolGray800' }
                                }
                              }}
                            >
                              <HStack space="md" alignItems="center">
                                {item.triggers[0]?.icon && (
                                  <Icon as={item.triggers[0].icon} color={item.triggers[0].color} size="sm" />
                                )}
                                {item.actions[0]?.icon && (
                                  <Icon as={item.actions[0].icon} color={item.actions[0].color} size="sm" />
                                )}
                                <Text size="sm" flex={1}>{item.title}</Text>
                                {item.disabled && (
                                  <Text size="xs" color="$muted500">
                                    (Disabled)
                                  </Text>
                                )}
                              </HStack>
                            </Pressable>
                          ))
                        )}
                      </VStack>
                    </ScrollView>
                  </VStack>
                </PopoverBody>
              </PopoverContent>
            </Popover>
          </HStack>
        </VStack>
      </Box>

      <VStack space="md" p="$4">
        <Box
          bg="$backgroundCardLight"
          sx={{
            _dark: { bg: '$backgroundCardDark' },
            rounded: 'md'
          }}
          shadow={2}
        >
          {renderCurrentFlow()}
        </Box>

        <Divider my="$4" />

        <Box
          bg="$backgroundCardLight"
          sx={{
            _dark: { bg: '$backgroundCardDark' },
            rounded: 'md'
          }}
          shadow={2}
          p="$4"
        >
          { flow && (
            <EditFlow
              edit={true}
              flow={flow}
              onSubmit={onSubmit}
              onReset={resetFlow}
            />
          )}
        </Box>

      </VStack>
    </ScrollView>
  )
}

export default FlowList
