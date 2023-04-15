import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { Icon } from 'FontAwesomeUtils'
import {
  faBoxArchive,
  faDownload,
  faTrash
} from '@fortawesome/free-solid-svg-icons'
import {
  Badge,
  Box,
  Button,
  Heading,
  IconButton,
  HStack,
  Stack,
  Text,
  useColorModeValue
} from 'native-base'
import { api } from 'api'
import { AlertContext } from 'AppContext'
import { prettyDate } from 'utils'

import { FlashList } from '@shopify/flash-list'

const ConfigsBackup = (props) => {
  const context = useContext(AlertContext)

  const [backups, setBackups] = useState([])

  const doConfigsBackup = () => {
    api
      .put('/backup')
      .then((filename) => {
        context.success('configs saved', filename)
        setBackups([
          ...backups.filter((b) => b.Name !== filename),
          { Name: filename, Timestamp: new Date() }
        ])
      })
      .catch((err) => {
        context.error('backup error', err)
      })
  }

  // NOTE only if web
  const downloadBackup = async (filename) => {
    let url = `/backup/${filename}`

    api
      .fetch(url)
      .then((res) => {
        res.blob().then((blob) => {
          var url = window.URL.createObjectURL(blob)
          var a = document.createElement('a')
          a.href = url
          a.download = filename
          document.body.appendChild(a)
          a.click()
          a.remove()
        })
      })
      .catch((err) => {
        context.error('Failed to download backup', err)
      })
  }

  const deleteBackup = (filename) => {
    api
      .delete(`/backup/${filename}`)
      .then((res) => {
        setBackups(backups.filter((b) => b.Name !== filename))
      })
      .catch((err) => context.error('Failed to remove backup', err))
  }

  useEffect(() => {
    api.get('/backup').then(setBackups).catch(context.error)
  }, [])

  const showDownloadBackups = Platform.OS == 'web'

  return (
    <>
      <HStack alignItems="center" justifyContent="space-between" p={4}>
        <Heading fontSize="md">Backups</Heading>
        <Button
          size="sm"
          variant="ghost"
          colorScheme="blueGray"
          leftIcon={<Icon icon={faBoxArchive} />}
          onPress={doConfigsBackup}
        >
          Backup configs
        </Button>
      </HStack>

      <Box
        space={2}
        p={4}
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
      >
        <FlashList
          data={backups}
          keyExtractor={(item, index) => item.Timestamp}
          renderItem={({ item }) => (
            <Stack
              direction="row"
              space={{ base: 2, md: 4 }}
              py={4}
              borderBottomColor="borderColorCardLight"
              _dark={{ borderBottomColor: 'borderColorCardDark' }}
              borderBottomWidth={1}
              alignItems="center"
            >
              <Badge variant="outline">{prettyDate(item.Timestamp)}</Badge>
              <HStack space={2} display={{ base: 'none', md: 'flex' }}>
                {/*<Text>Filename</Text>*/}
                <Text color="muted.500">{item.Name}</Text>
              </HStack>
              <IconButton
                size="sm"
                onPress={() => downloadBackup(item.Name)}
                icon={<Icon icon={faDownload} />}
                display={showDownloadBackups ? 'flex' : 'none'}
              />
              <IconButton
                size="sm"
                colorScheme="danger"
                onPress={() => deleteBackup(item.Name)}
                icon={<Icon icon={faTrash} />}
              />
            </Stack>
          )}
        />
        {!backups.length ? (
          <Text color="muted.500">No backups available</Text>
        ) : null}
      </Box>
    </>
  )
}

export default ConfigsBackup
