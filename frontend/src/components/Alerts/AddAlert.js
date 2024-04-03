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
  Icon,
  Input,
  InputField,
  Switch,
  HStack,
  VStack,
  Text,
  Textarea,
  TextareaInput,
  TrashIcon,
  AddIcon,
  CheckIcon,
  Badge,
  BadgeText
} from '@gluestack-ui/themed'

import { Select } from 'components/Select'
import FilterInputSelect from 'components/Logs/FilterInputSelect'
import { prettyJSONPath, prettyToJSONPath } from 'components/Logs/FilterSelect'
import { ItemMenu } from 'components/TagMenu'

import { dbAPI } from 'api'
import { CheckCircle2Icon, Settings2Icon } from 'lucide-react-native'

//note: unused
const getAlertMessageForTopic = (topic) => {
  if (topic.startsWith('dns:serve:')) {
    return ['DNS', `DNS Lookup {{FirstName}}`]
  }

  if (topic.startsWith('nft:drop:input')) {
    return ['Drop', `Src = {{Ethernet.SrcMAC}}`]
  }

  if (topic.startsWith('wifi:auth:success')) {
    return ['WiFi Alert', `WiFi Connected {{MAC}}`]
  }

  if (topic.startsWith('wifi:station:disconnect')) {
    return ['WiFi Alert', `WiFi Disconnect {{MAC}}`]
  }

  return ['', '']
}

const AddAlert = ({ onSubmit, curItem, ...props }) => {
  const [TopicPrefix, setTopicPrefix] = useState('nft:drop:input')
  const [MatchAnyOne, setMatchAnyOne] = useState(false)
  const [InvertRule, setInvertRule] = useState(false)
  const [Conditions, setConditions] = useState([])
  const [Disabled, setDisabled] = useState(false)
  const [logItems, setLogItems] = useState([])
  const [notificationType, setNotificationType] = useState('info')
  const [Name, setName] = useState('Alert')

  const [showAdvanced, setShowAdvanced] = useState(false)

  //only one action is supported now. in the future we will implement
  // different action types, for example, disconnecting a device.
  const [GrabFields, setGrabFields] = useState([])
  const [ActionConfig, setActionConfig] = useState({
    SendNotification: true,
    GrabEvent: false,
    StoreAlert: false,
    NotificationType: 'info'
  })

  const NotificationTypes = ['info', 'warning', 'success', 'error'].map(
    (x) => ({
      label: x,
      value: x
    })
  )

  useEffect(() => {
    if (!curItem) {
      return
    }

    setShowAdvanced(true)

    //populate the modal from it
    setName(curItem.Name)
    setTopicPrefix(curItem.TopicPrefix)
    setMatchAnyOne(curItem.MatchAnyOne)
    setInvertRule(curItem.InvertRule)
    if (curItem.Conditions) {
      let conditions = curItem.Conditions.map((c) => {
        return {
          ...c,
          JPath: prettyJSONPath(c.JPath)
        }
      })
      setConditions(conditions)
    }
    setDisabled(curItem.Disabled)

    //only one action supported currently
    if (curItem.Actions) {
      setActionConfig({ ...curItem.Actions[0] })
      setNotificationType(curItem.Actions[0].NotificationType)
      if (curItem.Actions[0]?.GrabFields) {
        setGrabFields(curItem.Actions[0]?.GrabFields)
      }
    }
  }, [curItem])

  // fetch sample with this prefix to get json syntax
  const getLogs = async (bucket) => {
    // fuzzy match list of buckets, example: dns:serve:xxx
    try {
      let buckets = await dbAPI.buckets()

      if (!buckets.includes(bucket)) {
        for (let b of buckets) {
          if (b.startsWith(bucket)) {
            bucket = b
            break
          }
        }
      }

      const items = await dbAPI.items(bucket)
      if (items) {
        setLogItems(items)
      }
    } catch (err) {
      //console.error(err)
      setLogItems([])
    }
  }

  useEffect(() => {
    getLogs(TopicPrefix)
  }, [TopicPrefix])

  const handleSubmit = () => {
    //validate here?
    let action = ActionConfig
    if (GrabFields.length > 0) {
      action.GrabFields = GrabFields
    }

    action.NotificationType = notificationType

    let conditions = Conditions.map((c) => {
      return { ...c, JPath: prettyToJSONPath(c.JPath) }
    })

    let item = {
      TopicPrefix,
      MatchAnyOne,
      InvertRule,
      Conditions: conditions,
      Actions: [action],
      Name,
      Disabled
    }

    onSubmit(item)
  }

  const resetForm = () => {
    setActionConfig({ ...ActionConfig, MessageTitle: '', MessageBody: '' })
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

  const handleGrabFieldChange = (value, index) => {
    let newGrabFields = [...GrabFields]
    newGrabFields[index] = value
    setGrabFields(newGrabFields)
  }

  return (
    <VStack space="md" p="$4">
      <HStack space="md">
        <FormControl flex={1}>
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
        <FormControl flex={1}>
          <FormControlLabel alignItems="center">
            <FormControlLabelText>Notification Type</FormControlLabelText>
          </FormControlLabel>
          <Select
            selectedValue={notificationType}
            onValueChange={(value) => setNotificationType(value)}
          >
            {NotificationTypes.map((opt) => (
              <Select.Item key={opt} label={opt.label} value={opt.value} />
            ))}
          </Select>
        </FormControl>
      </HStack>

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
          <FormControlLabel alignItems="center">
            <FormControlLabelText>Event Prefix</FormControlLabelText>
            <Icon
              size="sm"
              as={CheckCircle2Icon}
              color="$success500"
              ml="$1"
              display={logItems.length ? 'flex' : 'none'}
            />
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
      </HStack>

      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Body</FormControlLabelText>
        </FormControlLabel>
        <Textarea size="sm" h="$16">
          <TextareaInput
            placeholder="Message body"
            value={ActionConfig.MessageBody}
            onChangeText={(value) =>
              setActionConfig({ ...ActionConfig, MessageBody: value })
            }
          />
        </Textarea>
      </FormControl>

      <VStack space="md" display={showAdvanced ? 'flex' : 'none'}>
        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Conditions</FormControlLabelText>
          </FormControlLabel>
          <VStack space="md">
            {Conditions.length > 0 ? (
              <HStack space="md">
                <FormControl flex={1}>
                  <HStack space="md">
                    <Switch
                      value={MatchAnyOne}
                      onValueChange={() => setMatchAnyOne(!MatchAnyOne)}
                    />
                    <Text size="sm" bold>
                      {MatchAnyOne ? 'Match Any' : 'Match All'}
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
                {/*
              <Input flex={1} type="text" variant="solid">
                <InputField
                  name={`JPath-${index}`}
                  value={condition.JPath}
                  placeholder="TBD: JSONPath helper"
                  onChangeText={(value) => handleConditionChange(value, index)}
                />
              </Input>
              */}
                <FilterInputSelect
                  flex={1}
                  placeholder="JSONPath filter"
                  value={condition.JPath}
                  items={logItems}
                  topic={TopicPrefix}
                  onChangeText={(value) => {
                    handleConditionChange(value, index)
                  }}
                  onSubmitEditing={(value) => {
                    handleConditionChange(value, index)
                  }}
                />
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
              <FormControlLabelText size="sm">
                Notification
              </FormControlLabelText>
            </FormControlLabel>
            <Switch
              size="sm"
              value={ActionConfig.SendNotification}
              onValueChange={() =>
                setActionConfig({
                  ...ActionConfig,
                  SendNotification: !ActionConfig.SendNotification
                })
              }
            />

            <FormControlHelper>
              <FormControlHelperText size="xs">
                Show Notification
              </FormControlHelperText>
            </FormControlHelper>
          </FormControl>

          <FormControl flex={1}>
            <FormControlLabel>
              <FormControlLabelText size="sm">Persistent</FormControlLabelText>
            </FormControlLabel>
            <Switch
              size="sm"
              value={ActionConfig.StoreAlert}
              onValueChange={() =>
                setActionConfig({
                  ...ActionConfig,
                  StoreAlert: !ActionConfig.StoreAlert
                })
              }
            />
            <FormControlHelper>
              <FormControlHelperText size="xs">
                Store alert in database
              </FormControlHelperText>
            </FormControlHelper>
          </FormControl>

          <FormControl flex={1}>
            <FormControlLabel>
              <FormControlLabelText size="sm">Copy Event</FormControlLabelText>
            </FormControlLabel>
            <Switch
              size="sm"
              value={ActionConfig.GrabEvent}
              onValueChange={() =>
                setActionConfig({
                  ...ActionConfig,
                  GrabEvent: !ActionConfig.GrabEvent
                })
              }
            />
            <FormControlHelper>
              <FormControlHelperText size="xs">
                {ActionConfig.GrabEvent
                  ? 'Uncheck to select'
                  : 'Select fields to copy'}
              </FormControlHelperText>
            </FormControlHelper>
          </FormControl>

          <FormControl
            flex={1}
            display={ActionConfig.StoreAlert ? 'flex' : 'none'}
          >
            <FormControlLabel>
              <FormControlLabelText size="sm">
                Alert Suffix
              </FormControlLabelText>
            </FormControlLabel>
            <Input type="text" variant="underlined">
              <InputField
                placeholder="Optional"
                name="StoreTopicSuffix"
                value={ActionConfig.StoreTopicSuffix}
                onChangeText={(value) =>
                  setActionConfig({
                    ...ActionConfig,
                    StoreTopicSuffix: value
                  })
                }
              />
            </Input>
          </FormControl>
        </HStack>

        <VStack space="md" display={ActionConfig.GrabEvent ? 'none' : 'flex'}>
          <FormControl>
            <FormControlLabel>
              <FormControlLabelText size="sm">
                Event Fields
              </FormControlLabelText>
            </FormControlLabel>

            <HStack space="md" alignItems="center">
              <HStack space="sm">
                {GrabFields.map((field, index) => (
                  <Badge action="muted" variant="outline">
                    <BadgeText>{field}</BadgeText>
                  </Badge>
                ))}
              </HStack>
              <ItemMenu
                type="Event Field"
                items={GrabFields}
                selectedKeys={GrabFields}
                onSelectionChange={(items) => {
                  setGrabFields([...items])
                }}
              />
            </HStack>
          </FormControl>

          {/*<VStack space="md">
            {GrabFields.map((field, index) => (
              <FormControl key={index}>
              <FormControlLabel>
              <FormControlLabelText size="sm">
                    Field Name
                  </FormControlLabelText>
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
          */}
        </VStack>
      </VStack>

      <HStack space="md">
        <Button flex={1} action="primary" size="md" onPress={handleSubmit}>
          <ButtonText>Save</ButtonText>
          <ButtonIcon as={CheckIcon} ml="$2" />
        </Button>

        <Button
          flex={1}
          action="secondary"
          variant="outline"
          size="md"
          onPress={() => setShowAdvanced(!showAdvanced)}
        >
          <ButtonText>Advanced</ButtonText>
          <ButtonIcon as={Settings2Icon} ml="$2" />
        </Button>

        {/*
        <Button
          flex={1}
          action="secondary"
          variant="outline"
          size="md"
          onPress={resetForm}
        >
          <ButtonText>Reset Form</ButtonText>
          <ButtonIcon as={XIcon} ml="$2" />
        </Button>
        */}
      </HStack>
    </VStack>
  )
}

export default AddAlert
