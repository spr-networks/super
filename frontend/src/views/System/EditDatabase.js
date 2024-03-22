import React, { useContext, useEffect, useState } from 'react'

import {
  Badge,
  BadgeText,
  Button,
  ButtonIcon,
  ButtonText,
  Box,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  FormControlHelperText,
  Heading,
  HStack,
  Icon,
  Input,
  InputField,
  Text,
  VStack,
  InfoIcon,
  Pressable,
  ScrollView
} from '@gluestack-ui/themed'

import { Tooltip } from 'components/Tooltip'

import { dbAPI } from 'api'
import { ModalContext } from 'AppContext'

const TopicItem = ({ topic, onPress, isDisabled, ...props }) => (
  <Pressable onPress={onPress}>
    <Badge
      variant="outline"
      action={isDisabled ? 'muted' : 'success'}
      size="xs"
    >
      <BadgeText>{topic}</BadgeText>
    </Badge>
  </Pressable>
)

const EditSizeForm = ({ config, onSubmit, ...props }) => {
  const [size, setSize] = useState(0)
  const handleChangeText = (value) => {
    setSize(value)
  }

  useEffect(() => {
    setSize(config?.MaxSize / 1024 / 1024)
  }, [config])

  const handleSubmit = () => onSubmit(parseInt(size * 1024 * 1024))

  return (
    <VStack space="sm">
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>
            Max size for database file in MB
          </FormControlLabelText>
          <Tooltip label="Older entries will be removed to keep the file size to around what is specified">
            <InfoIcon color="$muted500" ml="$1" />
          </Tooltip>
        </FormControlLabel>

        <Input size="lg" variant="underlined">
          <InputField
            type="text"
            value={'' + size}
            placeholder="size in mb"
            autoFocus={true}
            onChangeText={handleChangeText}
            onSubmitEditing={handleSubmit}
          />
        </Input>
        <FormControlHelperText>
          Size in kB: {size * 1024}kB
        </FormControlHelperText>
      </FormControl>
    </VStack>
  )
}

const AddTopicForm = ({ allEvents, saveEvents, handleAddRemove, onSubmit }) => {
  const [value, setValue] = useState('')
  const handleChangeText = (value) => setValue(value)
  const handleSubmit = () => onSubmit(value)

  return (
    <VStack space="sm" pb="$4">
      <VStack flex={2} space="sm">
        <Heading size="md">Registered Events</Heading>
        <Text size="sm" color="$muted500">
          Click event to add or remove for storage
        </Text>
        <ScrollView maxHeight="$48">
          <HStack space="sm" flexWrap="wrap" mb="$1">
            {allEvents?.map((topic) => (
              <TopicItem
                key={topic}
                topic={topic}
                onPress={() => handleAddRemove(topic)}
                isDisabled={!saveEvents.includes(topic)}
              />
            ))}
          </HStack>
        </ScrollView>
      </VStack>
      <FormControl flex={1}>
        <FormControlLabel>
          <FormControlLabelText>
            Or add a custom Event name
          </FormControlLabelText>
          <Tooltip
            label={'Using a prefix like "www:" will store all events from www'}
          >
            <InfoIcon color="$muted500" ml="$1" />
          </Tooltip>
        </FormControlLabel>

        <Input size="lg" variant="underlined" w="100%">
          <InputField
            type="text"
            placeholder="service:event:name"
            autoFocus={true}
            value={value}
            onChangeText={handleChangeText}
            onSubmitEditing={handleSubmit}
          />
        </Input>
      </FormControl>
    </VStack>
  )
}

const toggleSaveTopic = (topic, config) => {
  let newConfig = { ...config }
  let isRemove = topic && config.SaveEvents.includes(topic)

  // click badge, solid = remove
  if (topic && isRemove) {
    newConfig.SaveEvents = newConfig.SaveEvents.filter((t) => t != topic)
  }

  // click badge, outline = add
  if (topic && !isRemove) {
    newConfig.SaveEvents = [...new Set([...newConfig.SaveEvents, topic])]
  }

  return newConfig
}

const EditDatabase = ({ onSubmit, ...props }) => {
  const modalContext = useContext(ModalContext)
  const [config, setConfig] = useState(null)
  const [stats, setStats] = useState(null)

  //this one is to make sure defaultTopics is also included
  const [allEvents, setAllEvents] = useState([])
  const defaultTopics = [
    'nft:drop:',
    'wifi:',
    'dhcp:',
    'dns:serve',
    'auth:failure',
    'plugin:'
  ]
  const apiError = (err) => context.error('db api error:', err)

  useEffect(() => {
    //support both
    if (props.config && props.stats) {
      setConfig(props.config)
      setStats(props.stats)

      return
    }

    dbAPI
      .config()
      .then((config) => {
        setConfig(config)
      })
      .catch(apiError)

    dbAPI
      .stats()
      .then((stats) => {
        if (stats?.Topics?.length) {
          setStats(stats)
        }
      })
      .catch(apiError)
  }, [])

  const updateConfig = (newConfig) => {
    return dbAPI
      .setConfig(newConfig)
      .then((config) => {
        setConfig(config)

        if (onSubmit) {
          onSubmit(config)
        }
      })
      .catch(apiError)
  }

  useEffect(() => {
    if (!config || !stats) {
      return
    }

    let topics = config.SaveEvents || []
    if (stats && stats.Topics) {
      topics = [...new Set([...topics, ...stats.Topics, ...defaultTopics])]
    }

    setAllEvents([...topics])
  }, [config, stats])

  const handleSubmitSize = (value) => {
    updateConfig({ ...config, MaxSize: value })
  }

  const handleAddRemove = (topic = null) => {
    let newConfig = toggleSaveTopic(topic, config)
    setConfig(newConfig) //update ui
    return updateConfig(newConfig)
  }

  return (
    <VStack space="lg">
      <EditSizeForm config={config} onSubmit={handleSubmitSize} />
      <AddTopicForm
        allEvents={allEvents}
        saveEvents={config?.SaveEvents}
        handleAddRemove={handleAddRemove}
        onSubmit={handleAddRemove}
      />
      <Button
        variant="solid"
        action="secondary"
        onPress={() => modalContext.setShowModal(false)}
      >
        <ButtonText>Close</ButtonText>
      </Button>
    </VStack>
  )
}

export default EditDatabase
export { EditDatabase, TopicItem, toggleSaveTopic }
