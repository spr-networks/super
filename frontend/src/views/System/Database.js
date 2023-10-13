import React, { useContext, useEffect, useState } from 'react'
import { Icon } from 'FontAwesomeUtils'
import {
  faDatabase,
  faInfoCircle,
  faPencil
} from '@fortawesome/free-solid-svg-icons'
import {
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
  Input,
  InputField,
  Text,
  Tooltip,
  VStack,
  useColorMode,
  ButtonGroup,
  TooltipContent,
  TooltipText
} from '@gluestack-ui/themed'

import { dbAPI } from 'api'
import { AlertContext } from 'AppContext'
import { prettySize } from 'utils'
import { PlusIcon, Settings2Icon } from 'lucide-react-native'

const AddTopicForm = ({ allEvents, isStored, handleAddRemove, onSubmit }) => {
  const [value, setValue] = useState('')
  const handleChangeText = (value) => setValue(value)
  const handleSubmit = () => onSubmit(value)

  const renderTopic = (topic) => (
    <Button
      key={`topic:${topic}:${isStored(topic)}`}
      variant={isStored(topic) ? 'solid' : 'outline'}
      colorScheme={isStored(topic) ? 'blueGray' : 'blueGray'}
      onPress={() => handleAddRemove(topic)}
      rounded="xs"
      size="sm"
      py={'$1'}
      mb={'$2'}
    >
      <ButtonText>{topic}</ButtonText>
    </Button>
  )

  return (
    <HStack space="md" px="$4" py="$8">
      <VStack flex={1} space={'md'}>
        <Heading size="md">Registered Events</Heading>
        <Text color="$muted500">Click event to add or remove for storage</Text>

        <HStack space={'md'} mt={'$4'} flexWrap={'wrap'}>
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
          <Text color="$muted500" italic bold>
            Note:
          </Text>{' '}
          <Text color="$muted500">using a prefix like</Text>{' '}
          <Text color="$muted500" italic>
            "www:"
          </Text>{' '}
          <Text color="$muted500">will store all events from www</Text>
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
    <HStack space="xl">
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
        <Heading size="md" mb="$4">
          <Icon icon={faInfoCircle} color="$muted500" mr="$2" />
          Notice about size
        </Heading>
        <Text>
          Older entries will be removed to keep the file size to around what is
          specified.
        </Text>
      </VStack>
    </HStack>
  )
}

const Database = ({ showModal, closeModal, ...props }) => {
  const context = useContext(AlertContext)
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

    // NOTE state mess up props to get on/off in modal - close for now
    closeModal()

    return updateConfig(newConfig)
  }

  //onsubmit call handleAddRemove
  const handlePressAdd = () => {
    syncStats()

    let title = 'Add event topic for storage'

    const onSubmit = (value) => {
      handleAddRemove(value)
      closeModal()
    }

    showModal(
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
    closeModal()
  }

  const handlePressEditSize = () => {
    showModal(
      'Change database size limit',
      <EditSizeForm config={config} onSubmit={handleSubmitSize} />
    )
  }

  const percentColor = (percent) => {
    let color = 'muted.700' //'success.500' 'warning.700'

    if (percent > 95) {
      color = 'warning.700'
    } else if (percent > 75) {
      color = 'warning.700'
    } else if (percent > 50) {
      color = 'muted.700'
    }
    return color
  }

  const colorMode = useColorMode()

  return (
    <VStack space="md">
      <HStack alignItems="center" justifyContent="space-between" p={'$4'}>
        <VStack space="md">
          <Heading fontSize="md">Database</Heading>
          <HStack space="md" alignItems="center">
            <Icon icon={faDatabase} color="$muted500" size="xs" />
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
          placement="bottomx"
          trigger={() => {
            return (
              <Button
                size="xs"
                ml="auto"
                action="secondary"
                variant="solid"
                leftIcon={<Icon icon={faPencil} />}
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
              <ButtonGroup>
                {config['SaveEvents'].map((topic) => (
                  <Button
                    key={`btn:${topic}`}
                    action="secondary"
                    variant="outline"
                    size="xs"
                    onPress={() => handleAddRemove(topic)}
                  >
                    <ButtonText>{topic}</ButtonText>
                  </Button>
                ))}
                <Button
                  action="primary"
                  variant="outline"
                  size="xs"
                  onPress={() => handlePressAdd()}
                >
                  <ButtonIcon as={PlusIcon} />
                  <ButtonText>Add</ButtonText>
                </Button>
              </ButtonGroup>
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
