import React, { useContext, useEffect, useState } from 'react'

import {
  Button,
  ButtonIcon,
  ButtonText,
  Box,
  Heading,
  HStack,
  Icon,
  Text,
  VStack,
  useColorMode
} from '@gluestack-ui/themed'

import { dbAPI } from 'api'
import { AlertContext, ModalContext } from 'AppContext'
import { prettySize } from 'utils'
import { DatabaseIcon, Settings2Icon } from 'lucide-react-native'

import { EditDatabase, TopicItem, toggleSaveTopic } from './EditDatabase'
import { Tooltip } from 'components/Tooltip'

const Database = ({ ...props }) => {
  const context = useContext(AlertContext)
  const modalContext = useContext(ModalContext)
  const [config, setConfig] = useState(null)
  const [stats, setStats] = useState(null)

  const [percentSize, setPercentSize] = useState(0)

  const apiError = (err) => context.error('db api error:', err)

  const syncStats = () => {
    dbAPI
      .stats()
      .then((stats) => {
        if (stats.Topics.length) {
          setStats(stats)
        }
      })
      .catch(apiError)
  }

  useEffect(() => {
    dbAPI
      .config()
      .then((config) => {
        setConfig(config)
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

  const updateConfig = (newConfig) => {
    return dbAPI.setConfig(newConfig).then(setConfig).catch(apiError)
  }

  const handleAddRemove = (topic = null) => {
    let newConfig = toggleSaveTopic(topic, config)
    return updateConfig(newConfig)
  }

  const handlePressEdit = () => {
    modalContext.modal(
      'Change database size limit',
      <EditDatabase config={config} stats={stats} onSubmit={setConfig} />
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
        <Tooltip label="Edit max file size and topics">
          <Button
            size="sm"
            ml="auto"
            action="primary"
            variant="solid"
            onPress={handlePressEdit}
          >
            <ButtonText>Edit</ButtonText>
            <ButtonIcon as={Settings2Icon} ml="$1" />
          </Button>
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

            <VStack
              sx={{
                '@base': { flexDirection: 'column', gap: 3 },
                '@md': { flexDirection: 'row', gap: 3 }
              }}
              flexWrap="wrap"
              flex={1}
            >
              <HStack space="sm" alignItems="center" flexWrap="wrap">
                {config['SaveEvents'].map((topic) => (
                  <TopicItem
                    key={topic}
                    topic={topic}
                    onPress={() => handleAddRemove(topic)}
                  />
                ))}
              </HStack>
            </VStack>
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
