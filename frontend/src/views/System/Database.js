import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { Icon } from 'FontAwesomeUtils'
import {
  faBoxArchive,
  faCirclePlus,
  faDatabase,
  faExchange,
  faInfoCircle,
  faPen,
  faPenFancy,
  faPencil,
  faPercent,
  faTrash
} from '@fortawesome/free-solid-svg-icons'
import {
  Badge,
  Button,
  Box,
  FormControl,
  Heading,
  HStack,
  Input,
  Text,
  Tooltip,
  VStack,
  useColorModeValue
} from 'native-base'
import { api, dbAPI } from 'api'
import { AlertContext } from 'AppContext'
import { render } from '@testing-library/react'
import { prettySize } from 'utils'

const AddTopicForm = ({ topics, renderTopic, onSubmit, ...props }) => {
  const [value, setValue] = useState('')
  const handleChangeText = (value) => setValue(value)
  const handleSubmit = () => onSubmit(value)

  return (
    <HStack space={2} px={4} py={8}>
      <VStack flex={1} space={2}>
        <Heading fontSize="md">Registered Events</Heading>
        <Text color="muted.400">Click event to add for storage</Text>

        <HStack space={2} mt={4} flexWrap={'wrap'}>
          {topics.map(renderTopic)}
        </HStack>
      </VStack>
      <FormControl flex={1} space={8}>
        <FormControl.Label>Or add a custom Event name</FormControl.Label>

        <Input
          size="lg"
          type="text"
          variant="underlined"
          w="100%"
          value={value}
          placeholder="service:event:name"
          autoFocus={true}
          onChangeText={handleChangeText}
          onSubmitEditing={handleSubmit}
        />
        <FormControl.HelperText flexDir={'row'} my={4}>
          <Text color="muted.400" italic bold>
            Note:
          </Text>{' '}
          <Text color="muted.400">using a prefix like</Text>{' '}
          <Text color="muted.400" italic>
            "www:"
          </Text>{' '}
          <Text color="muted.400">will store all events from www</Text>
        </FormControl.HelperText>
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
    <HStack space={20}>
      <FormControl flex={1} space={8}>
        <FormControl.Label>Max size for database file in MB</FormControl.Label>

        <Input
          size="lg"
          type="text"
          variant="underlined"
          value={size}
          placeholder="size in mb"
          autoFocus={true}
          onChangeText={handleChangeText}
          onSubmitEditing={handleSubmit}
        />
        <FormControl.HelperText flexDir={'row'} my={4}>
          Size in kB: {size * 1024}kB
        </FormControl.HelperText>
      </FormControl>
      <VStack flex={1} space={1}>
        <Heading fontSize="md" mb={4}>
          <Icon icon={faInfoCircle} color="muted.500" mr={2} />
          Notice about size
        </Heading>
        <Text>When the size limit is hit the db file will not shrink.</Text>
        <Text>
          Old entries will be removed to keep the file size around what is
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

  const apiError = (err) => context.error('db api error:', err)

  const syncStats = () => {
    dbAPI
      .stats()
      .then((stats) => {
        //console.log('got stats:', JSON.stringify(stats))
        if (stats.Topics.length) {
          setStats(stats)
          setAllEvents(stats.Topics)
        }
      })
      .catch(apiError)
  }

  useEffect(() => {
    dbAPI
      .config()
      .then((config) => {
        setConfig(config)
        setSaveEvents(config.SaveEvents)
      })
      .catch(apiError)
    syncStats()
  }, [])

  useEffect(() => {
    if (config && config.SaveEvents) {
      setSaveEvents(config.SaveEvents)
    }

    if (stats && stats.Topics && stats.Topics.length) {
      setAllEvents(stats.Topics)
    }

    if (config && stats) {
      setPercentSize(
        Math.min(Math.round((stats.Size / config.MaxSize) * 100), 100)
      )
    }
  }, [config, stats])

  const renderConfigRow = (key, value) => {
    return (
      <HStack
        space={2}
        p={4}
        borderBottomColor="borderColorCardLight"
        _dark={{ borderBottomColor: 'borderColorCardDark' }}
        borderBottomWidth={1}
        justifyContent="space-between"
      >
        <Text>{key}</Text>
        {value}
      </HStack>
    )
  }

  /*const getTopics = (type = null) => {
    return [...new Set([...saveEvents, ...allEvents])]
  }*/

  const isStored = (name) => saveEvents.includes(name)

  const renderTopic = (topic) => (
    <Button
      key={`topic:${topic}:${isStored(topic)}`}
      variant={isStored(topic) ? 'solid' : 'outline'}
      colorScheme={isStored(topic) ? 'blueGray' : 'blueGray'}
      onPress={() => handleAddRemove(topic)}
      rounded="xs"
      size="sm"
      py={1}
      mb={2}
    >
      {topic}
    </Button>
  )

  const updateConfig = (newConfig) => {
    return dbAPI
      .setConfig(newConfig)
      .then((config) => {
        setConfig(config)
      })
      .catch(apiError)
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
        topics={allEvents}
        renderTopic={renderTopic}
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

  return (
    <VStack space={2}>
      <HStack alignItems="center" justifyContent="space-between" p={4}>
        <VStack space={2}>
          <Heading fontSize="md">Database</Heading>
          <HStack space={2}>
            <Text color="muted.500">
              <Icon icon={faDatabase} color="muted.500" size="xs" />{' '}
              {stats && stats.Size ? prettySize(stats.Size) : null}
            </Text>
            <Text
              color={percentColor(percentSize)}
            >{`${percentSize}% allocated`}</Text>
          </HStack>
        </VStack>
        <Tooltip label={'Set max file size for database'}>
          <Button
            size="sm"
            ml="auto"
            variant="ghost"
            colorScheme={'blueGray'}
            leftIcon={<Icon icon={faPencil} />}
            onPress={handlePressEditSize}
          >
            Set file size limit
          </Button>
        </Tooltip>
      </HStack>

      {config && config.SaveEvents ? (
        <Box
          space={2}
          px={4}
          bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        >
          {renderConfigRow(
            'SaveEvents',

            <HStack space={2} alignItems={'center'} flexWrap={'wrap'}>
              {config['SaveEvents'].map((topic) => (
                <Button
                  key={`btn:${topic}`}
                  variant={'solid'}
                  colorScheme={'blueGray'}
                  rounded="xs"
                  size="sm"
                  py={1}
                  mb={2}
                  onPress={() => handleAddRemove(topic)}
                >
                  {topic}
                </Button>
              ))}
              <Button
                onPress={() => handlePressAdd()}
                variant="outline"
                colorScheme="blueGray"
                size="xs"
                py={1}
                mb={2}
                leftIcon={<Icon icon={faCirclePlus} />}
              >
                Add
              </Button>
            </HStack>
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
