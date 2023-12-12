import React, { useEffect, useState } from 'react'

import {
  Button,
  ButtonIcon,
  ButtonText,
  FormControl,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  Switch,
  HStack,
  VStack,
  Text,
  TrashIcon,
  AddIcon,
  Heading
} from '@gluestack-ui/themed'

import { Select } from 'components/Select'

const AddAlert = ({ onSubmit, ...props }) => {
  const [TopicPrefix, setTopicPrefix] = useState('nft:wan:out')
  const [MatchAnyOne, setMatchAnyOne] = useState(false)
  const [InvertRule, setInvertRule] = useState(false)
  const [Conditions, setConditions] = useState([])
  const [Disabled, setDisabled] = useState(false)

  //only one action is supported now. in the future we will implement
  // different action types, for example, disconnecting a device.
  const [GrabFields, setGrabFields] = useState([])
  const [ActionConfig, setActionConfig] = useState({
    GrabEvent: true,
    StoreAlert: true
  })
  const [Name, setName] = useState('')

  const handleSubmit = () => {
    //validate here?
    let action = ActionConfig
    if (GrabFields.length > 0) {
      action.GrabFields = GrabFields
    }
    let item = {
      TopicPrefix,
      MatchAnyOne,
      InvertRule,
      Conditions,
      Actions: [action],
      Name,
      Disabled
    }

    onSubmit(item)
  }

  const handleConditionChange = (value, index) => {
    const newConditions = [...Conditions]
    newConditions[index].JPath = value
    setConditions(newConditions)
  }

  const addCondition = () => {
    setConditions([...Conditions, { JPath: '' }])
  }

  const removeCondition = (index) => {
    const newConditions = [...Conditions]
    newConditions.splice(index, 1)
    setConditions(newConditions)
  }

  const addGrabField = () => {
    setGrabFields([...GrabFields, ''])
  }

  const removeGrabField = (index) => {
    const newGrabFields = [...GrabFields]
    newGrabFields.splice(index, 1)
    setGrabFields(newGrabFields)
  }

  return (
    <VStack space="md">
      <FormControl display="none">
        <FormControlLabel>
          <FormControlLabelText>Alert Name</FormControlLabelText>
        </FormControlLabel>
        <Input type="text" variant="underlined">
          <InputField
            name="Name"
            value={Name}
            onChangeText={(value) => setName(value)}
          />
        </Input>
      </FormControl>

      <HStack space="md">
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Title</FormControlLabelText>
          </FormControlLabel>
          <Input type="text" variant="underlined">
            <InputField
              name="MessageTitle"
              value={ActionConfig.MessageTitle}
              onChangeText={(value) =>
                setActionConfig({ ...ActionConfig, MessageTitle: value })
              }
            />
          </Input>
        </FormControl>

        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Body</FormControlLabelText>
          </FormControlLabel>
          <Input type="text" variant="underlined">
            <InputField
              name="MessageBody"
              value={ActionConfig.MessageBody}
              onChangeText={(value) =>
                setActionConfig({ ...ActionConfig, MessageBody: value })
              }
            />
          </Input>
        </FormControl>
      </HStack>
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Event Filter Prefix</FormControlLabelText>
        </FormControlLabel>
        <Input type="text" variant="underlined">
          <InputField
            name="TopicPrefix"
            value={TopicPrefix}
            onChangeText={(value) => setTopicPrefix(value)}
          />
        </Input>
        <FormControlHelper>
          <FormControlHelperText>Topic prefix filter</FormControlHelperText>
        </FormControlHelper>
      </FormControl>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Conditions</FormControlLabelText>
        </FormControlLabel>
        <VStack space="md">
          {Conditions.length > 1 ? (
            <HStack space="md">
              <FormControl flex={1}>
                <HStack space="md">
                  <Switch
                    value={MatchAnyOne}
                    onValueChange={() => setMatchAnyOne(!MatchAnyOne)}
                  />
                  <Text size="sm" bold>
                    Match Any Condition
                  </Text>
                </HStack>
              </FormControl>

              <FormControl flex={1}>
                <HStack space="md">
                  <Switch
                    value={InvertRule}
                    onValueChange={() => setInvertRule(!InvertRule)}
                  />
                  <Text size="sm" bold>
                    Invert Rule
                  </Text>
                </HStack>
              </FormControl>
            </HStack>
          ) : null}

          {Conditions.map((condition, index) => (
            <HStack key={index} space="md">
              <Input flex={1} type="text" variant="solid">
                <InputField
                  name={`JPath-${index}`}
                  value={condition.JPath}
                  placeholder="TBD: JSONPath helper"
                  onChangeText={(value) => handleConditionChange(value, index)}
                />
              </Input>
              <Button
                action="danger"
                variant="link"
                size="sm"
                onPress={() => removeCondition(index)}
              >
                <ButtonIcon as={TrashIcon} color="$red700" />
              </Button>
            </HStack>
          ))}
        </VStack>
      </FormControl>

      <Button
        action="secondary"
        variant="outline"
        size="sm"
        onPress={addCondition}
      >
        <ButtonText>Add Condition Filter</ButtonText>
        <ButtonIcon as={AddIcon} mr="$2" />
      </Button>

      <HStack space="lg">
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Send Notification</FormControlLabelText>
          </FormControlLabel>
          <Switch
            value={ActionConfig.SendNotification}
            onValueChange={() =>
              setActionConfig({
                ...ActionConfig,
                SendNotification: !ActionConfig.SendNotification
              })
            }
          />
          <FormControlHelper>
            <FormControlHelperText>
              Show Notification on trigger
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Persistent Event</FormControlLabelText>
          </FormControlLabel>
          <Switch
            value={ActionConfig.StoreAlert}
            onValueChange={() =>
              setActionConfig({
                ...ActionConfig,
                StoreAlert: !ActionConfig.StoreAlert
              })
            }
          />
          <FormControlHelper>
            <FormControlHelperText>
              Store alert in database
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>
      </HStack>

      <HStack space="lg">
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Copy Event into Alert</FormControlLabelText>
          </FormControlLabel>
          <Switch
            value={ActionConfig.GrabEvent}
            onValueChange={() =>
              setActionConfig({
                ...ActionConfig,
                GrabEvent: !ActionConfig.GrabEvent
              })
            }
          />
          <FormControlHelper>
            <FormControlHelperText>
              {ActionConfig.GrabEvent
                ? 'Uncheck to select fields to copy'
                : 'Select fields to copy'}
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        <FormControl
          flex={1}
          display={ActionConfig.StoreAlert ? 'flex' : 'none'}
        >
          <FormControlLabel>
            <FormControlLabelText>Alert Topic Suffix</FormControlLabelText>
          </FormControlLabel>
          <Input type="text" variant="underlined">
            <InputField
              placeholder="Optional"
              name="StoreTopicSuffix"
              value={ActionConfig.StoreTopicSuffix}
              onChangeText={(value) =>
                setActionConfig({ ...ActionConfig, StoreTopicSuffix: value })
              }
            />
          </Input>
        </FormControl>
      </HStack>

      <VStack space="md" display={ActionConfig.GrabEvent ? 'none' : 'flex'}>
        <VStack space="md">
          {GrabFields.map((field, index) => (
            <FormControl key={index}>
              <FormControlLabel>
                <FormControlLabelText>Field Name</FormControlLabelText>
              </FormControlLabel>
              <HStack key={index} space="md">
                <Input flex={1} type="text" variant="solid">
                  <InputField
                    name={`GrabField-${index}`}
                    value={field}
                    onChangeText={(value) =>
                      handleGrabFieldChange(value, index)
                    }
                  />
                </Input>
                <Button
                  action="danger"
                  variant="link"
                  size="sm"
                  onPress={() => removeGrabField(index)}
                >
                  <ButtonIcon as={TrashIcon} color="$red700" />
                </Button>
              </HStack>
            </FormControl>
          ))}
        </VStack>

        <Button
          action="secondary"
          variant="outline"
          size="sm"
          onPress={addGrabField}
        >
          <ButtonText>Add Field to copy from Event</ButtonText>
          <ButtonIcon as={AddIcon} mr="$2" />
        </Button>
      </VStack>

      <Button action="primary" size="md" onPress={handleSubmit}>
        <ButtonText>Save</ButtonText>
      </Button>
    </VStack>
  )
}

export default AddAlert
