import React, { useContext, useEffect, useState } from 'react'

import { AlertContext } from 'AppContext'
import { NewCard } from './FlowCard'
import { numToDays, toCron } from './FlowCards'
import EditFlow from './EditFlow'
import { pfwAPI } from 'api/Pfw'
import { TouchableOpacity, Platform } from 'react-native'

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
  TrashIcon,
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
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  FormControl,
  Pressable,
  Switch
} from '@gluestack-ui/themed'

import Flow from './Flow'
import { dateArrayToStr } from './Utils'
import { CircleSlashIcon, Search, ChevronLeft, ChevronRight, ChevronDownIcon, Plus, X } from 'lucide-react-native'

import { Tooltip } from 'components/Tooltip'


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
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [flow, setFlow] = useState({
    title: 'NewFlow',
    triggers: [],
    actions: []
  })

  const refInput = React.useRef(null)

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

          if (flows.length > selectedFlowIndex) {
            setFlow(flows[selectedFlowIndex])
          }
        }
      })
      .catch((err) => {
        context.error(err.message)
      })
  }

  useEffect(() => {
    fetchFlows()
  }, [])

  const filterFlows = (query) => {
    if (!query) {
      setFilteredFlows(flows)
      return
    }

    const lowercaseQuery = query.toLowerCase()
    const filtered = flows.filter(f => {
      if (f.title.toLowerCase().includes(lowercaseQuery)) {
        return true
      }

      const valuesString = JSON.stringify(f).toLowerCase()
      return valuesString.includes(lowercaseQuery)
    })

    setFilteredFlows(filtered)
  }

  useEffect(() => {
    filterFlows(searchQuery)
  }, [searchQuery, flows])

  const onSubmit = (data) => {
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
    if (data.index !== undefined) {
      flow.index = data.index
    }

    saveFlow(flow, context)
      .then((res) => {
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
    saveFlow(newFlow, context).then((res) => {
      fetchFlows()
    })
  }

  const toggleDisable = (item) => {

    const updatedFlow = {
      ...item,
      disabled: !item.disabled
    };

    saveFlow(updatedFlow, context)
      .then(() => {
        fetchFlows();
      })
      .catch((err) => {
        console.error('Error saving flow disabled state:', err);
        context.error('Failed to update flow: ' + (err.message || err));
      });
  }

  const handleSelectFlow = (index) => {
    if (index >= 0 && index < filteredFlows.length) {
      setSelectedFlowIndex(index)
      setFlow(filteredFlows[index])
      setIsModalOpen(false)
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
        <Text color="$muted600" textAlign="center">No flows available</Text>
        <Button
          variant="solid"
          size="md"
          onPress={resetFlow}
          bg="$primary500"
          borderRadius="$lg"
        >
          <Icon as={Plus} color="$white" mr="$1.5" />
          <ButtonText color="$white">Create New Flow</ButtonText>
        </Button>
      </VStack>
    </Center>
  )

  const renderCurrentFlow = () => {
    if (filteredFlows.length === 0)
      return renderEmptyState()

    if (!filteredFlows[selectedFlowIndex])
      return (<></>)

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
                  ml="$1.5"
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

            <Box flex={1} maxWidth={{ md: "$96" }} ml={{ md: "$40" }} mt={{ md: "-$12" }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setIsModalOpen(true)}
              >
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
                    pointerEvents="none"
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
              </TouchableOpacity>
            </Box>

            <Modal
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              useRNModal={Platform.OS === 'web'}
              avoidKeyboard
              closeOnOverlayClick
            >
              <ModalBackdrop />
              <ModalContent
                borderRadius="$lg"
                width="$full"
                maxWidth={450}
                marginX="auto"
                overflow="hidden"
              >
                <ModalHeader
                  borderBottomWidth={1}
                  borderBottomColor="$borderColor"
                  px="$4"
                  py="$3"
                >
                  <HStack alignItems="center" justifyContent="space-between" width="$full">
                    <Heading size="sm">Select Flow</Heading>
                    <ModalCloseButton>
                      <Icon as={X} />
                    </ModalCloseButton>
                  </HStack>
                </ModalHeader>

                <ModalBody p="$0">
                  <VStack>
                    <Box
                      p="$3"
                      borderBottomWidth={1}
                      borderBottomColor="$borderColor"
                    >
                      <Input
                        size="md"
                        variant="outline"
                        borderRadius="$full"
                      >
                        <InputSlot pl="$3">
                          <InputIcon as={Search} />
                        </InputSlot>
                        <InputField
                          placeholder="Search flows..."
                          value={searchQuery}
                          onChangeText={(text) => {
                            setSearchQuery(text)
                            filterFlows(text)
                          }}
                          autoFocus={Platform.OS === 'web'}
                        />
                      </Input>
                    </Box>

                    <ScrollView maxHeight={400} showsVerticalScrollIndicator={true}>
                      <VStack space="sm" p="$3">
                        {filteredFlows.length === 0 ? (
                          <Center py="$8">
                            <Text color="$muted600" textAlign="center">No matching flows found</Text>
                          </Center>
                        ) : (
                          filteredFlows.map((item, index) => (
                            <Pressable
                              key={`flow-${index}`}
                              onPress={() => handleSelectFlow(index)}
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
                </ModalBody>
              </ModalContent>
            </Modal>
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
              key={flow.index !== undefined ? `flow-${flow.index}-${flow.title}` : `flow-${flow.title}-1`}
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
