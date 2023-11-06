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
  Tooltip,
  VStack,
  useColorMode,
  TooltipContent,
  TooltipText,
  InfoIcon,
  Pressable
} from '@gluestack-ui/themed'

import { dbAPI } from 'api'
import { AlertContext, ModalContext } from 'AppContext'
import { prettySize } from 'utils'
import { DatabaseIcon, PlusIcon, Settings2Icon } from 'lucide-react-native'

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

        <HStack space="sm" flexWrap="wrap">
          {allEvents?.map((topic) => (
            <TopicItem
              key={topic}
              topic={topic}
              onPress={() => handleAddRemove(topic)}
              isDisabled={!saveEvents.includes(topic)}
            />
          ))}
        </HStack>
      </VStack>
      <FormControl flex={1}>
        <FormControlLabel>
          <FormControlLabelText>
            Or add a custom Event name
          </FormControlLabelText>
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
        <FormControlHelperText flexDir="row" my="$2">
          <HStack space="sm">
            <Text size="sm" color="$muted500" italic bold>
              Note:
            </Text>
            <Text size="sm" color="$muted500">
              using a prefix like
            </Text>
            <Text size="sm" color="$muted500" italic>
              "www:"
            </Text>
            <Text size="sm" color="$muted500">
              will store all events from www
            </Text>
          </HStack>
        </FormControlHelperText>
      </FormControl>
    </VStack>
  )
}

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
        </FormControlLabel>

        <Input size="lg" variant="underlined">
          <InputField
            type="text"
            value={size}
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
      <HStack space="sm">
        <InfoIcon color="$muted500" />
        <Text size="xs">
          Older entries will be removed to keep the file size to around what is
          specified.
        </Text>
      </HStack>
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

  const [saveEvents, setSaveEvents] = useState([])
  const [allEvents, setAllEvents] = useState([])

  const defaultTopics = ['nft:', 'wifi:', 'dhcp:', 'dns:serve']
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

    setSaveEvents([...config.SaveEvents])

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
    return updateConfig(newConfig)
  }

  return (
    <VStack space="md">
      <EditSizeForm config={config} onSubmit={handleSubmitSize} />
      <AddTopicForm
        allEvents={allEvents}
        saveEvents={saveEvents}
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
