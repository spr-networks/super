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

const AddTopicForm = ({ allEvents, isStored, handleAddRemove, onSubmit }) => {
  const [value, setValue] = useState('')
  const handleChangeText = (value) => setValue(value)
  const handleSubmit = () => onSubmit(value)

  const renderTopic = (topic) => (
    <TopicItem
      key={`topic:${topic}:${isStored(topic)}`}
      topic={topic}
      onPress={() => handleAddRemove(topic)}
      isDisabled={!isStored(topic)}
    />
  )

  return (
    <HStack space="md" flexDirection="column" pb="$4">
      <VStack flex={2} space="sm">
        <Heading size="md">Registered Events</Heading>
        <Text color="$muted500">Click event to add or remove for storage</Text>

        <HStack space="sm" flexWrap="wrap">
          {allEvents && allEvents.length ? allEvents.map(renderTopic) : null}
        </HStack>
      </VStack>
      <FormControl flex={1} space={'$8'}>
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
        <FormControlHelperText flexDir={'row'} my={'$4'}>
          <HStack space="sm">
            <Text color="$muted500" italic bold>
              Note:
            </Text>
            <Text color="$muted500">using a prefix like</Text>
            <Text color="$muted500" italic>
              "www:"
            </Text>
            <Text color="$muted500">will store all events from www</Text>
          </HStack>
        </FormControlHelperText>
      </FormControl>
    </HStack>
  )
}

const EditSizeForm = ({ config, onSubmit, ...props }) => {
  const [size, setSize] = useState(0)
  const handleChangeText = (value) => {
    setSize(value)
  }

  useEffect(() => {
    setSize(config.MaxSize / 1024 / 1024)
  }, [config])

  const handleSubmit = () => onSubmit(parseInt(size * 1024 * 1024))

  return (
    <VStack space="xl">
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
        <FormControlHelperText flexDir={'row'} my="$4">
          Size in kB: {size * 1024}kB
        </FormControlHelperText>
      </FormControl>
      <VStack flex={1} space="sm">
        <HStack space="sm">
          <InfoIcon color="$muted500" />
          <Heading size="xs" mb="$4">
            Notice about size
          </Heading>
        </HStack>
        <Text size="sm">
          Older entries will be removed to keep the file size to around what is
          specified.
        </Text>
      </VStack>
    </VStack>
  )
}

const Database = ({ ...props }) => {
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)
  const [config, setConfig] = useState(null)
  const [stats, setStats] = useState(null)

  const [saveEvents, setSaveEvents] = useState([])
  const [allEvents, setAllEvents] = useState([])
  const [percentSize, setPercentSize] = useState(0)

  const defaultTopics = ['nft:', 'wifi:', 'dhcp:', 'dns:']

  const apiError = (err) => context.error('db api error:', err)

  const syncStats = () => {
    dbAPI
      .stats()
      .then((stats) => {
        if (stats.Topics.length) {
          setStats(stats)
          //setAllEvents(stats.Topics)
        }
      })
      .catch(apiError)
  }

  useEffect(() => {
    dbAPI
      .config()
      .then((config) => {
        setConfig(config)
        //setSaveEvents(config.SaveEvents)
      })
      .catch(apiError)
    syncStats()
  }, [])

  useEffect(() => {
    if (!config || !stats) {
      return
    }

    setPercentSize(
      Math.min(Math.round((stats.Size / config.MaxSize) * 100), 100)
    )

    setSaveEvents([...config.SaveEvents])

    let topics = config.SaveEvents || []
    if (stats && stats.Topics) {
      topics = [...new Set([...topics, ...stats.Topics, ...defaultTopics])]
    }

    setAllEvents(topics)
  }, [config, stats])

  const renderConfigRow = (key, value) => {
    return (
      <HStack
        space="md"
        p="$4"
        borderBottomColor={
          colorMode == 'light'
            ? '$borderColorCardLight'
            : '$borderColorCardDark'
        }
        borderBottomWidth={1}
        justifyContent="space-between"
      >
        <Text size="sm">{key}</Text>
        {value}
      </HStack>
    )
  }

  /*const getTopics = (type = null) => {
    return [...new Set([...saveEvents, ...allEvents])]
  }*/

  const isStored = (name) => saveEvents.includes(name)

  const updateConfig = (newConfig) => {
    return dbAPI.setConfig(newConfig).then(setConfig).catch(apiError)
  }

  const handleAddRemove = (topic = null) => {
    let isRemove = topic && saveEvents.includes(topic)
    let newConfig = { ...config }

    // click badge, solid = remove
    if (topic && isRemove) {
      newConfig.SaveEvents = newConfig.SaveEvents.filter((t) => t != topic)
    }

    // click badge, outline = add
    if (topic && !isRemove) {
      newConfig.SaveEvents = [...new Set([...newConfig.SaveEvents, topic])]
    }

    if (!isRemove) {
      modalContext.setShowModal(false)
    }

    return updateConfig(newConfig)
  }

  //onsubmit call handleAddRemove
  const handlePressAdd = () => {
    syncStats()

    let title = 'Add event topic for storage'

    const onSubmit = (value) => {
      handleAddRemove(value)
    }

    modalContext.modal(
      title,
      <AddTopicForm
        allEvents={allEvents}
        saveEvents={saveEvents}
        isStored={isStored}
        handleAddRemove={handleAddRemove}
        onSubmit={onSubmit}
      />
    )

    return
  }

  const handleSubmitSize = (value) => {
    updateConfig({ ...config, MaxSize: value })
    modalContext.setShowModal(false)
  }

  const handlePressEditSize = () => {
    modalContext.modal(
      'Change database size limit',
      <EditSizeForm config={config} onSubmit={handleSubmitSize} />
    )
  }

  const percentColor = (percent) => {
    let color = '$muted700' //'success500' 'warning700'

    if (percent > 95) {
      color = '$warning700'
    } else if (percent > 75) {
      color = '$warning700'
    } else if (percent > 50) {
      color = '$muted700'
    }
    return color
  }

  const colorMode = useColorMode()

  return (
    <VStack space="md">
      <HStack alignItems="center" justifyContent="space-between" p="$4">
        <VStack space="md">
          <Heading size="md">Database</Heading>
          <HStack space="md" alignItems="center">
            <Icon as={DatabaseIcon} color="$muted500" size="xs" />
            <Text color="$muted500" size="sm">
              {stats && stats.Size ? prettySize(stats.Size) : null}
            </Text>
            <Text
              color={percentColor(percentSize)}
              size="sm"
            >{`${percentSize}% allocated`}</Text>
          </HStack>
        </VStack>
        <Tooltip
          h={undefined}
          trigger={() => {
            return (
              <Button
                size="xs"
                ml="auto"
                action="secondary"
                variant="solid"
                onPress={handlePressEditSize}
              >
                <ButtonText>Set file size limit</ButtonText>
                <ButtonIcon as={Settings2Icon} ml="$1" />
              </Button>
            )
          }}
        >
          <TooltipContent>
            <TooltipText>Set max file size for database</TooltipText>
          </TooltipContent>
        </Tooltip>
      </HStack>

      {config && config.SaveEvents ? (
        <Box
          px="$4"
          bg={
            colorMode == 'light'
              ? '$backgroundCardLight'
              : '$backgroundCardDark'
          }
        >
          {renderConfigRow(
            'SaveEvents',

            <Box
              sx={{
                '@base': { flexDirection: 'column', gap: 3 },
                '@md': { flexDirection: 'row', gap: 3 }
              }}
              alignItems={{ base: 'flex-start', md: 'center' }}
              flexWrap={'wrap'}
            >
              <HStack space="sm" alignItems="center">
                {config['SaveEvents'].map((topic) => (
                  <TopicItem
                    topic={topic}
                    onPress={() => handleAddRemove(topic)}
                  />
                ))}
                <Button
                  action="primary"
                  variant="outline"
                  size="xs"
                  onPress={handlePressAdd}
                >
                  <ButtonIcon as={PlusIcon} />
                  <ButtonText>Add</ButtonText>
                </Button>
              </HStack>
            </Box>
          )}
          {renderConfigRow(
            'MaxSize',
            <Text>{prettySize(config['MaxSize'])}</Text>
          )}
        </Box>
      ) : null}
    </VStack>
  )
}

export default Database
