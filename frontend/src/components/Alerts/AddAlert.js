import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
  BadgeText,
  Heading
} from '@gluestack-ui/themed'

import { Select } from 'components/Select'
import FilterInputSelect from 'components/Logs/FilterInputSelect'
import {
  prettyJSONPath,
  prettyToJSONPath,
  extractKeys
} from 'components/Logs/FilterSelect'
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
  const [TopicPrefix, setTopicPrefix] = useState(null)
  const [MatchAnyOne, setMatchAnyOne] = useState(false)
  const [InvertRule, setInvertRule] = useState(false)
  const [Conditions, setConditions] = useState([])
  const [Disabled, setDisabled] = useState(false)
  const [logItems, setLogItems] = useState([])
  const [notificationType, setNotificationType] = useState('info')
  const [Name, setName] = useState(null)

  const [showAdvanced, setShowAdvanced] = useState(true)

  //only one action is supported now. in the future we will implement
  // different action types, for example, disconnecting a device.
  const [GrabFields, setGrabFields] = useState([])
  const [ActionConfig, setActionConfig] = useState({
    SendNotification: true,
    GrabEvent: true,
    StoreAlert: false,
    NotificationType: 'info',
    MessageTitle: 'Alert Title',
    MessageBody: 'Alert Body'
  })

  const navigate = useNavigate()

  const NotificationTypes = ['info', 'warning', 'success', 'error'].map(
    (x) => ({
      label: x,
      value: x
    })
  )

  useEffect(() => {
    //set defaults
    setTopicPrefix('wifi:auth:success')
    setActionConfig({
      ...ActionConfig,
      MessageBody: '{{MAC}} connected'
    })

    if (!curItem) {
      return
    }

    //edit alert
    setShowAdvanced(true)
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
      Name: Name || action.MessageTitle,
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

  let eventFields = GrabFields?.length ? GrabFields : extractKeys(logItems)

  return (
    <VStack space="md"
      p="$4"
      bg="$backgroundCardLight"
      sx={{
        _dark: { bg: '$backgroundCardDark' }
      }}
    >
      <VStack
        space="md"
        sx={{
          '@md': { flexDirection: 'row' }
        }}
      >
        <VStack flex={4} space="md">
          {/*<FormControl>
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
            </FormControl>*/}

          <FormControl>
            <FormControlLabel>
              <FormControlLabelText size="sm">Title</FormControlLabelText>
            </FormControlLabel>
            <Input type="text" variant="solid">
              <InputField
                name="MessageTitle"
                value={ActionConfig.MessageTitle}
                onChangeText={(value) =>
                  setActionConfig({ ...ActionConfig, MessageTitle: value })
                }
              />
            </Input>
          </FormControl>

          <FormControl>
            <FormControlLabel>
              <FormControlLabelText size="sm">Body</FormControlLabelText>
            </FormControlLabel>
            <Textarea size="md" h="$16">
              <TextareaInput
                placeholder="Message body"
                value={ActionConfig.MessageBody}
                onChangeText={(value) =>
                  setActionConfig({ ...ActionConfig, MessageBody: value })
                }
              />
            </Textarea>
            {eventFields?.length ? (
              <>
                <FormControlHelper>
                  <FormControlHelperText size="xs">
                    {`Available fields for event: ${eventFields?.join(
                      ', '
                    )}.\nExample: The value is {{${eventFields[0]}}}`}
                  </FormControlHelperText>
                </FormControlHelper>
              </>
            ) : null}
          </FormControl>
        </VStack>
        <VStack flex={3} space="md">
          <FormControl>
            <FormControlLabel alignItems="center">
              <FormControlLabelText size="sm">
                Notification Type
              </FormControlLabelText>
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

          <VStack space="2xl">
            <HStack space="md">
              <Switch
                value={ActionConfig.SendNotification}
                onValueChange={() =>
                  setActionConfig({
                    ...ActionConfig,
                    SendNotification: !ActionConfig.SendNotification
                  })
                }
              />

              {/*<Text size="sm" fontWeight="500"></Text>*/}
              <FormControlLabelText size="sm">
                Show Notification
              </FormControlLabelText>
            </HStack>

            <HStack space="sm" alignItems="center" h="$8">
              <Switch
                value={ActionConfig.StoreAlert}
                onValueChange={() =>
                  setActionConfig({
                    ...ActionConfig,
                    StoreAlert: !ActionConfig.StoreAlert
                  })
                }
              />

              <FormControlLabelText size="sm">Store Alert</FormControlLabelText>

              {/*<FormControlHelper>
                <FormControlHelperText size="xs">
                  Store alert in database
                </FormControlHelperText>
              </FormControlHelper>*/}
              <FormControl display={ActionConfig.StoreAlert ? 'flex' : 'none'}>
                {/*<FormControlLabel>
                  <FormControlLabelText size="sm">
                    Alert Suffix
                  </FormControlLabelText>
                </FormControlLabel>*/}
                <Input size="sm" type="text" variant="solid">
                  <InputField
                    placeholder="Optional Alert suffix"
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
          </VStack>
        </VStack>
      </VStack>

      {/* Event Data */}

      <VStack space="lg">
        <FormControl sx={{ '@md': { maxWidth: '$1/3' } }}>
          <FormControlLabel alignItems="center">
            <FormControlLabelText size="sm">Event Prefix</FormControlLabelText>
            <Icon
              size="sm"
              as={CheckCircle2Icon}
              color="$success500"
              ml="$1"
              display={logItems.length ? 'flex' : 'none'}
            />
          </FormControlLabel>
          <Input type="text" variant="solid">
            <InputField
              name="TopicPrefix"
              value={TopicPrefix}
              onChangeText={(value) => setTopicPrefix(value)}
            />
          </Input>
          <FormControlHelper>
            <FormControlHelperText size="xs">
              Topic prefix filter. Example: wifi:auth:, dhcp:, dns:serve:
            </FormControlHelperText>
          </FormControlHelper>
        </FormControl>
        <VStack
          space="lg"
          sx={{ '@md': { flexDirection: 'row', alignItems: 'center' } }}
        >
          <HStack space="md">
            <Switch
              value={ActionConfig.GrabEvent}
              onValueChange={() =>
                setActionConfig({
                  ...ActionConfig,
                  GrabEvent: !ActionConfig.GrabEvent
                })
              }
            />
            <FormControlLabelText size="sm">
              Copy event data
            </FormControlLabelText>
          </HStack>

          <FormControl display={ActionConfig.GrabEvent ? 'flex' : 'none'}>
            {/*<FormControlLabel>
              <FormControlLabelText size="sm">
                Select Event Fields
              </FormControlLabelText>
            </FormControlLabel>*/}

            <HStack space="md" alignItems="center" flexWrap="wrap">
              <HStack space="sm">
                {!GrabFields?.length ? (
                  <Text size="sm">All fields will be copied by default</Text>
                ) : null}
                {GrabFields.map((field, index) => (
                  <Badge action="muted" variant="outline">
                    <BadgeText>{field}</BadgeText>
                  </Badge>
                ))}
              </HStack>
              <ItemMenu
                type="Event Field"
                items={[...new Set([...GrabFields, ...extractKeys(logItems)])]}
                selectedKeys={GrabFields}
                onSelectionChange={(items) => {
                  setGrabFields([...items])
                }}
              />
            </HStack>
          </FormControl>
        </VStack>
      </VStack>

      {/* Conditions */}
      <VStack my="$4" space="md" display={showAdvanced ? 'flex' : 'none'}>
        <FormControl>
          <HStack space="lg">
            <FormControlLabel>
              <FormControlLabelText>Conditions</FormControlLabelText>
            </FormControlLabel>
            {Conditions.length > 0 ? (
              <HStack space="lg">
                <FormControl>
                  <HStack space="sm" alignItems="center">
                    <Switch
                      size="sm"
                      value={MatchAnyOne}
                      onValueChange={() => setMatchAnyOne(!MatchAnyOne)}
                    />
                    <Text size="sm" bold>
                      {MatchAnyOne ? 'Match Any' : 'Match All'}
                    </Text>
                  </HStack>
                </FormControl>

                <FormControl>
                  <HStack space="sm">
                    <Switch
                      size="sm"
                      value={InvertRule}
                      onValueChange={() => setInvertRule(!InvertRule)}
                    />
                    <Text size="sm" bold>
                      Invert
                    </Text>
                  </HStack>
                </FormControl>
              </HStack>
            ) : null}
          </HStack>

          <FormControlHelper>
            <FormControlHelperText size="sm">
              Set conditions for selected event. Default is to match any, select
              "Match All" to join the conditions
            </FormControlHelperText>
          </FormControlHelper>

          <VStack space="md" mt="$2">
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
          _onPress={() => setShowAdvanced(!showAdvanced)}
          onPress={() => navigate(`/admin/alerts/settings`)}
        >
          <ButtonText>Back</ButtonText>
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
