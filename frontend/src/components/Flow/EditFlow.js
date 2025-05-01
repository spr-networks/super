import React, { useContext, useEffect, useState, useRef, useCallback } from 'react'
import { useWindowDimensions } from 'react-native'

import {
  Button,
  ButtonText,
  ButtonIcon,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  HStack,
  VStack,
  Text,
  Box,
  Divider,
  ScrollView,
  CheckIcon,
  CloseIcon,
  ArrowRightIcon,
  ArrowDownIcon,
  Heading,
  Modal,
  ModalBackdrop,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
} from '@gluestack-ui/themed'

import { BanIcon, GlobeIcon } from 'lucide-react-native'

import { FlowCard } from './FlowCard'
import EditItem from './EditItem'
import AddFlowCard from './AddFlowCard'
import { flowObjParse } from './Utils'
import { Address4 } from 'ip-address'
import ModalForm from 'components/ModalForm'

const SimpleModal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalBackdrop />
      <ModalContent maxWidth="$full">
        <ModalHeader>
          <Heading size="md">{title}</Heading>
          <ModalCloseButton onPress={onClose} />
        </ModalHeader>
        <ModalBody>
          {children}
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

const TagsGroupsInput = ({ type, value, onChange, options }) => {
  return (
    <VStack space="xs" w="$full" mb="$2">
      <Text size="sm" bold> </Text>
      <Text size="sm" bold> </Text>
      <Box w="$full">
        <EditItem
          key={type}
          label={type}
          value={value || ""}
          options={options && options[type]}
          size="sm"
          onChange={(value) => {
            if (onChange) onChange(type, value)
          }}
        />
      </Box>
    </VStack>
  )
}

const FlowNode = ({ title, color, children, width }) => {
  return (
    <Box
      bg="$warmGray50"
      borderWidth="$1"
      borderColor={color || "$coolGray200"}
      borderLeftWidth="$4"
      borderLeftColor={color || "$blue500"}
      rounded="$md"
      p="$4"
      w={width || "auto"}
      flex={width ? undefined : 1}
      sx={{
        _dark: { bg: '$secondary900', borderColor: '$coolGray900' }
      }}
      shadow="$1"
    >
      <Heading size="sm" color={color || "$coolGray600"} mb="$2">{title}</Heading>
      {children}
    </Box>
  )
}

const ParamGroup = ({ title, params, item, options, onChange }) => {
  const filteredParams = params.filter(p => !p.hidden)

  if (filteredParams.length === 0) return null

  return (
    <VStack space="sm" mb="$2">
      {title && <Text size="xs" color="$muted500" mb="$1">{title}</Text>}
      {filteredParams.map(p => (
        <VStack space="xs" key={p.name} w="$full" mb="$2">
          <Text size="sm" bold>{p.name}</Text>
          {p.description && (
            <Text size="xs" color="$muted400">
              {p.description}
            </Text>
          )}
          <Box w="$full">
            <EditItem
              key={p.name}
              label={p.name}
              value={
                item.values && item.values[p.name] !== undefined
                  ? p.name === 'Client' || p.name === 'Dst' || p.name === 'OriginalDst'
                    ? flowObjParse(item.values[p.name])
                    : item.values[p.name]
                  : ""
              }
              options={options && options[p.name]}
              description={p.description}
              format={p.format}
              size="sm"
              onChange={(value) => {
                if (onChange) onChange(p.name, value)
              }}
            />
          </Box>
        </VStack>
      ))}
    </VStack>
  )
}

const EditFlow = ({ flow, ...props }) => {
  const [title, setTitle] = useState(flow.title || 'New Flow')
  const [triggers, setTriggers] = useState(flow.triggers || [])
  const [action, setAction] = useState(flow.actions && flow.actions.length > 0 ? flow.actions[0] : null)
  const [options, setOptions] = useState({})
  const { width } = useWindowDimensions()

  const [layoutType, setLayoutType] = useState(width < 768 ? 'vertical' : 'horizontal')

  useEffect(() => {
    setLayoutType(width < 768 ? 'vertical' : 'horizontal')
  }, [width])

  const refTriggerModal = useRef(null)
  const refActionModal = useRef(null)

  useEffect(() => {
    if (flow?.triggers) {
      setTitle(flow.title)
      setTriggers(flow.triggers)

      if (flow.actions && flow.actions.length > 0) {
        setAction(flow.actions[0])
      } else {
        setAction(null)
      }
    }
  }, [flow])

  useEffect(() => {
    if (title === 'NewFlow' && action) {
      setTitle(action.title)
    }

    if (action) {
      fetchOptions()
    }
  }, [action])

  const fetchOptions = async () => {
    if (!action) return {}

    try {
      let optionsNew = {}

      for (let p of action.params) {
        if (p.hidden) continue

        let name = p.name
        let opts = await action.getOptions(name)
        if (opts && opts.length) {
          optionsNew[name] = opts
        }
      }

      setOptions(optionsNew)
      return optionsNew
    } catch (error) {
      console.error("Error fetching options:", error)
      return {}
    }
  }

  const onChangeValue = useCallback((name, value) => {
    if (!action) return

    if (name === 'Dst' || name === 'OriginalDst') {
      if (typeof value === 'object') {
        action.values[name] = value
      } else if (value && value.trim() !== '') {
        try {
          new Address4(value)
          action.values[name] = { IP: value }
        } catch (err) {
          action.values[name] = { Domain: value }
        }
      } else {
        action.values[name] = undefined
      }
    } else {
      action.values[name] = value
    }

    const newAction = {
      ...action,
      values: { ...action.values }
    }

    setAction(newAction)

    if (props.onChange) {
      props.onChange(newAction)
    }
  }, [action, props.onChange])

  const onSubmit = () => {
    if (props.onSubmit) {
      const actions = action ? [action] : []

      let newFlow = { title, triggers, actions }
      if (flow.index !== undefined) {
        newFlow.index = flow.index
      }

      props.onSubmit(newFlow)

      setAction(action)
    }
  }

  const addTrigger = () => {
    if (refTriggerModal.current) {
      refTriggerModal.current()
    }
  }

  const handleAddTrigger = (trigger) => {
    if (refTriggerModal.current) {
      refTriggerModal.current()
    }
    setTriggers([...triggers, trigger])
  }

  const addAction = () => {
    if (refActionModal.current) {
      refActionModal.current()
    }
  }

  const handleAddAction = (newAction) => {
    if (refActionModal.current) {
      refActionModal.current()
    }
    setAction(newAction)
  }

  const sourceParams = action?.params?.filter(p =>
    p.name === 'Client' || p.name === 'Protocol'
  ) || []

  const sourceFilterParams = action?.params?.filter(p =>
    p.name === 'OriginalDst' || p.name === 'OriginalDstPort'
  ) || []

  const destinationParams = action?.params?.filter(p =>
    p.name === 'Dst' || p.name === 'DstPort' ||
    p.name === 'DstInterface' || p.name === 'Container' ||
    p.name === 'ContainerPort'
  ) || []

  const otherParams = action?.params?.filter(p =>
    !sourceParams.includes(p) &&
    !sourceFilterParams.includes(p) &&
    !destinationParams.includes(p) &&
    !p.hidden
  ) || []

  const getFlowLayout = () => {
    if (!action) return null

    const FlowContainer = layoutType === 'horizontal' ? HStack : VStack
    const ArrowIcon = layoutType === 'horizontal' ? ArrowRightIcon : ArrowDownIcon

    if (action.title === 'Block') {
      return (
        <FlowContainer space="md" mb="$4" alignItems={layoutType === 'horizontal' ? "flex-start" : "stretch"}>
          <FlowNode title="Source & Traffic to Block" color="$red500" width={layoutType === 'horizontal' ? "50%" : "100%"}>
            <ParamGroup
              title="Source"
              params={sourceParams}
              item={action}
              options={options}
              onChange={onChangeValue}
            />
            <ParamGroup
              title="Traffic to Block"
              params={[...sourceFilterParams, ...destinationParams].filter(p =>
                p.name !== 'Container' && p.name !== 'ContainerPort')}
              item={action}
              options={options}
              onChange={onChangeValue}
            />
          </FlowNode>
        </FlowContainer>
      )
    }

    if (action.title === 'Set Device Tags' || action.title === 'Set Device Groups') {
      const isTag = action.title === 'Set Device Tags'
      const type = isTag ? 'Tags' : 'Groups'

      return (
        <FlowContainer space="md" mb="$4" alignItems={layoutType === 'horizontal' ? "flex-start" : "stretch"}>
          <FlowNode
            title="Client"
            color="$blue500"
            width={layoutType === 'horizontal' ? "45%" : "100%"}
          >
            <ParamGroup
              params={action.params.filter(p => p.name === 'Client')}
              item={action}
              options={options}
              onChange={onChangeValue}
            />
          </FlowNode>

          <Box
            justifyContent="center"
            alignItems="center"
            alignSelf={layoutType === 'horizontal' ? "center" : "center"}
            my={layoutType === 'horizontal' ? "$0" : "$2"}
          >
            <ArrowIcon size="lg" color="$coolGray400" />
          </Box>

          <FlowNode
            title={type}
            color="$cyan500"
            width={layoutType === 'horizontal' ? "45%" : "100%"}
          >
            <TagsGroupsInput
              type={type}
              value={action.values && action.values[type]}
              options={options}
              onChange={onChangeValue}
            />
          </FlowNode>
        </FlowContainer>
      )
    }

    if (action.title === 'Docker Forward') {
      return (
        <FlowContainer space="md" mb="$4" alignItems={layoutType === 'horizontal' ? "flex-start" : "stretch"}>
          <FlowNode
            title="Source & Filters"
            color="$blue500"
            width={layoutType === 'horizontal' ? "45%" : "100%"}
          >
            <ParamGroup
              title="Source"
              params={sourceParams}
              item={action}
              options={options}
              onChange={onChangeValue}
            />
            {sourceFilterParams.length > 0 && (
              <ParamGroup
                title="Original Destination"
                params={sourceFilterParams}
                item={action}
                options={options}
                onChange={onChangeValue}
              />
            )}
          </FlowNode>

          <Box
            justifyContent="center"
            alignItems="center"
            alignSelf={layoutType === 'horizontal' ? "center" : "center"}
            my={layoutType === 'horizontal' ? "$0" : "$2"}
          >
            <ArrowIcon size="lg" color="$coolGray400" />
          </Box>

          <FlowNode
            title="Container"
            color="$green500"
            width={layoutType === 'horizontal' ? "45%" : "100%"}
          >
            <ParamGroup
              params={action.params.filter(p =>
                p.name === 'Container' || p.name === 'ContainerPort')}
              item={action}
              options={options}
              onChange={onChangeValue}
            />
          </FlowNode>
        </FlowContainer>
      )
    }

    return (
      <FlowContainer space="md" mb="$4" alignItems={layoutType === 'horizontal' ? "flex-start" : "stretch"}>
        <FlowNode
          title="Source & Filters"
          color="$blue500"
          width={layoutType === 'horizontal' ? undefined : "100%"}
        >
          <ParamGroup
            title="Source"
            params={sourceParams}
            item={action}
            options={options}
            onChange={onChangeValue}
          />
          {sourceFilterParams.length > 0 && (
            <ParamGroup
              title="Original Destination"
              params={sourceFilterParams}
              item={action}
              options={options}
              onChange={onChangeValue}
            />
          )}
        </FlowNode>

        <Box
          justifyContent="center"
          alignItems="center"
          alignSelf={layoutType === 'horizontal' ? "center" : "center"}
          my={layoutType === 'horizontal' ? "$0" : "$2"}
        >
          <ArrowIcon size="lg" color="$coolGray400" />
        </Box>

        <FlowNode
          title="New Destination"
          color="$green500"
          width={layoutType === 'horizontal' ? undefined : "100%"}
        >
          <ParamGroup
            params={destinationParams}
            item={action}
            options={options}
            onChange={onChangeValue}
          />
        </FlowNode>

        {otherParams.length > 0 && (
          <>
            <Box
              justifyContent="center"
              alignItems="center"
              alignSelf={layoutType === 'horizontal' ? "center" : "center"}
              my={layoutType === 'horizontal' ? "$0" : "$2"}
            >
              <ArrowIcon size="lg" color="$coolGray400" />
            </Box>
            <FlowNode
              title="Additional Options"
              color="$purple500"
              width={layoutType === 'horizontal' ? undefined : "100%"}
            >
              <ParamGroup
                params={otherParams}
                item={action}
                options={options}
                onChange={onChangeValue}
              />
            </FlowNode>
          </>
        )}
      </FlowContainer>
    )
  }

  return (
    <ScrollView maxW="$full">
      <FormControl mb="$4">
        <FormControlLabel>
          <FormControlLabelText size="sm">Flow Name</FormControlLabelText>
        </FormControlLabel>
        <Input>
          <InputField
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={onSubmit}
            placeholder="Enter flow name"
          />
        </Input>
      </FormControl>

      <VStack mb="$4">
        <FlowNode title="When" color="$violet500">
          {triggers.length > 0 ? (
            triggers.map((trigger, idx) => (
              <FlowCard
                key={idx}
                card={trigger}
                edit={true}
                size="md"
                onChange={(updated) => {
                  const newTriggers = [...triggers]
                  newTriggers[idx] = updated
                  setTriggers(newTriggers)
                }}
                onDelete={() => {
                  const newTriggers = [...triggers]
                  newTriggers.splice(idx, 1)
                  setTriggers(newTriggers)
                }}
              />
            ))
          ) : (
            <Button
              action="primary"
              variant="outline"
              onPress={addTrigger}
            >
              <ButtonText>Add trigger</ButtonText>
            </Button>
          )}
        </FlowNode>

        <ModalForm
          title="Add trigger to flow"
          modalRef={refTriggerModal}
          maxWidth="$full"
        >
          <ScrollView maxHeight={400}>
            <AddFlowCard cardType="trigger" onSubmit={handleAddTrigger} />
          </ScrollView>
        </ModalForm>
      </VStack>

      {action ? (
        getFlowLayout()
      ) : (
        <Button
          action="primary"
          variant="outline"
          onPress={addAction}
          mb="$4"
        >
          <ButtonText>Add action</ButtonText>
        </Button>
      )}

      <ModalForm
        title="Add action to flow"
        modalRef={refActionModal}
        maxWidth="$full"
      >
        <ScrollView maxHeight={400}>
          <AddFlowCard cardType="action" onSubmit={handleAddAction} />
        </ScrollView>
      </ModalForm>

      <HStack mb="$4" space="md">
        <Button flex={1} action="primary" variant="solid" onPress={onSubmit}>
          <ButtonText>Save</ButtonText>
          <ButtonIcon as={CheckIcon} ml="$1" />
        </Button>
        <Button
          flex={1}
          action="secondary"
          variant="outline"
          onPress={props.onReset}
        >
          <ButtonText>Reset</ButtonText>
          <ButtonIcon as={CloseIcon} ml="$1" />
        </Button>
      </HStack>
    </ScrollView>
  )
}

export default EditFlow
