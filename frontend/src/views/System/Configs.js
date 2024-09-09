import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  HStack,
  Text,
  DownloadIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import { BoxIcon } from 'lucide-react-native'

import { api } from 'api'
import { AlertContext } from 'AppContext'
import { prettyDate } from 'utils'
import { ListHeader, ListItem } from 'components/List'

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
      .get(url)
      .then((blob) => {
        var url = window.URL.createObjectURL(blob)
        var a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
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
      <ListHeader title="Backups">
        <Button
          size="sm"
          action="secondary"
          variant="solid"
          onPress={doConfigsBackup}
        >
          <ButtonText>Backup configs</ButtonText>
          <ButtonIcon as={BoxIcon} ml="$1" />
        </Button>
      </ListHeader>

      <Box>
        <FlatList
          data={backups}
          keyExtractor={(item) => item.Timestamp}
          renderItem={({ item }) => (
            <ListItem>
              <Badge action="muted" variant="outline">
                <BadgeText>{prettyDate(item.Timestamp)}</BadgeText>
              </Badge>
              <HStack
                space="md"
                sx={{
                  '@base': { display: 'none', '@md': { display: 'flex' } }
                }}
              >
                <Text color="$muted500">{item.Name}</Text>
              </HStack>
              <HStack space={'xl'}>
                <Button
                  size="sm"
                  action="secondary"
                  variant="link"
                  onPress={() => downloadBackup(item.Name)}
                  sx={{
                    '@base': { display: showDownloadBackups ? 'flex' : 'none' }
                  }}
                >
                  <ButtonIcon as={DownloadIcon} />
                </Button>

                <Button
                  size="sm"
                  variant="link"
                  onPress={() => deleteBackup(item.Name)}
                >
                  <ButtonIcon as={CloseIcon} color="$red700" />
                </Button>
              </HStack>
            </ListItem>
          )}
        />
        {!backups.length ? (
          <Text color="$muted500">No backups available</Text>
        ) : null}
      </Box>
    </>
  )
}

export default ConfigsBackup
