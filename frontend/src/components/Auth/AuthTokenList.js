import React, { useContext, useEffect, useRef, useState } from 'react'
import { copy } from 'utils'
import { format as timeAgo } from 'timeago.js'

import {
  AddIcon,
  Button,
  ButtonIcon,
  ButtonText,
  HStack,
  Text,
  /*Tooltip,
  TooltipContent,
  TooltipText,*/
  View,
  VStack,
  CloseIcon,
  CopyIcon
} from '@gluestack-ui/themed'

import { Tooltip } from 'native-base' //TODONB

import { FlashList } from '@shopify/flash-list'

import { ListHeader, ListItem } from 'components/List'

import { authAPI } from 'api'
import { AlertContext } from 'AppContext'
import ModalForm from 'components/ModalForm'
import AddAuthToken from 'components/Auth/AddAuthToken'

const AuthTokenList = (props) => {
  const context = useContext(AlertContext)
  const [status, setStatus] = useState('not configured')
  const [tokens, setTokens] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)

  const refModal = useRef(null)

  useEffect(() => {
    refreshList()
  }, [])

  const deleteListItem = (row) => {
    authAPI
      .deleteToken(row.Token)
      .then((done) => {
        const newData = [...tokens]
        const prevIndex = tokens.findIndex((t) => t.Token === row.Token)
        newData.splice(prevIndex, 1)
        setTokens(newData)
      })
      .catch((err) => context.error('Auth Token API', err))
  }

  const handleAddToken = () => {}

  const tokenExpired = (expire) => {
    return expire > 0 && expire < parseInt(new Date().getTime() / 1e3)
  }

  const refreshList = () => {
    authAPI
      .tokens()
      .then((tokens) => {
        setTokens(tokens)
      })
      .catch((err) => context.error('Auth Token API', err))
  }

  const notifyChange = () => {
    refModal.current()
    refreshList()
  }

  const triggerAdd = (triggerProps) => {
    return (
      <Button
        {...triggerProps}
        marginLeft="auto"
        variant="link"
        action="primary"
      >
        <ButtonText>Add Token</ButtonText>
        <ButtonIcon as={AddIcon} ml="$1" />
      </Button>
    )
  }

  const showClipboard = true //Platform.OS !== 'web' || navigator.clipboard

  return (
    <View h={'100%'}>
      <ListHeader title="API Tokens">
        <ModalForm
          title="Create new Auth Token"
          triggerText="Add Auth Token"
          modalRef={refModal}
        >
          <AddAuthToken notifyChange={notifyChange} />
        </ModalForm>
      </ListHeader>

      <FlashList
        data={tokens}
        estimatedItemSize={100}
        renderItem={({ item, index }) => (
          <ListItem>
            <VStack
              sx={{
                '@md': { flexDirection: 'row', alignItems: 'center' }
              }}
              flex="1"
              space="md"
              justifyContent={'space-between'}
            >
              <Text>{item.Name || `Token#${index}`}</Text>
              <HStack space="sm" alignItems="center" justifyItems="flex-end">
                <Tooltip label={item.Token} onPress={alert}>
                  <Button
                    size="sm"
                    action="secondary"
                    variant="link"
                    display={showClipboard ? 'flex' : 'none'}
                    onPress={() => copy(item.Token)}
                  >
                    <ButtonText>Copy Token</ButtonText>
                    <ButtonIcon as={CopyIcon} ml="$1" />
                  </Button>
                </Tooltip>
                {item.ScopedPaths != null && item.ScopedPaths.length > 0 ? (
                  <Text isTruncated>{JSON.stringify(item.ScopedPaths)}</Text>
                ) : (
                  <Text isTruncated></Text>
                )}
              </HStack>
            </VStack>

            <HStack
              sx={{
                '@base': { w: '$3/6' },
                '@md': { w: '$2/6' }
              }}
              space="sm"
              justifyContent="flex-end"
            >
              <Text size="sm" color="$muted500">
                Expire
              </Text>
              <Text
                size="sm"
                color={tokenExpired(item.Expire) ? '$warning400' : '$muted500'}
              >
                {item.Expire ? timeAgo(new Date(item.Expire * 1e3)) : 'Never'}
              </Text>
            </HStack>

            <Button
              alignSelf="center"
              variant="link"
              onPress={() => deleteListItem(item)}
              ml="$8"
            >
              <ButtonIcon as={CloseIcon} color="$red700" />
            </Button>
          </ListItem>
        )}
        keyExtractor={(item) => item.Token}
      />

      <VStack>
        {tokens !== null && tokens.length === 0 ? (
          <Text alignSelf="center">There are no API tokens added yet</Text>
        ) : null}
      </VStack>
    </View>
  )
}

export default AuthTokenList
