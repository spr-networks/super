import React, { useContext, useEffect, useRef, useState } from 'react'
import { format as timeAgo } from 'timeago.js'
import { useNavigate } from 'react-router-dom'

import {
  AddIcon,
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  HStack,
  Text,
  View,
  VStack,
  CloseIcon
} from '@gluestack-ui/themed'

//import { FlashList } from '@shopify/flash-list'

import { ListHeader, ListItem } from 'components/List'

import { authAPI, setJWTOTPHeader, setAuthReturn } from 'api'
import { AlertContext } from 'AppContext'
import ModalForm from 'components/ModalForm'
import AddAuthToken from 'components/Auth/AddAuthToken'
import TokenItem from 'components/TokenItem'

const AuthTokenList = (props) => {
  const context = useContext(AlertContext)
  const [status, setStatus] = useState('not configured')
  const [tokens, setTokens] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)

  const refModal = useRef(null)
  const navigate = useNavigate()

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
      .statusOTP()
      .then((s) => {
        setStatus(s.State)

        //dont refresh tokens if OTP token is not registered and set
        if (!(s.State == 'registered') || !s.Confirmed) {
          return
        }

        authAPI
          .tokens()
          .then((tokens) => {
            setTokens(tokens)
          })
          .catch((err) => {
            err.response
              .text()
              .then((data) => {
                if (data.includes('Invalid JWT')) {
                  //re-log OTP
                  setJWTOTPHeader('')
                  if (s.State == 'registered') {
                    setAuthReturn('/admin/auth')
                    navigate('/auth/validate')
                  }
                }
              })
              .catch(() => {
                context.error('Auth Token API ' + JSON.stringify(err), err)
              })
          })
      })
      .catch((e) => {
        setStatus('unknown')
        context.error('failed to get status', e)
      })
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

  return (
    <>
      <ListHeader title="API Tokens">
        <ModalForm
          title="Create new Auth Token"
          triggerText="Add Auth Token"
          modalRef={refModal}
        >
          <AddAuthToken notifyChange={notifyChange} />
        </ModalForm>
      </ListHeader>

      {tokens?.length === 0 ? (
        <VStack p="$4">
          {status == 'registered' ? (
            <Text>There are no API tokens added yet</Text>
          ) : (
            <Text>{status} Register an OTP Code to view and add tokens</Text>
          )}
        </VStack>
      ) : null}

      <FlatList
        data={tokens}
        estimatedItemSize={100}
        renderItem={({ item, index }) => (
          <ListItem>
            <VStack
              sx={{
                '@md': { flexDirection: 'row', alignItems: 'center' }
              }}
              flex={1}
              space="md"
              justifyContent={'space-between'}
            >
              <Text>{item.Name || `Token#${index}`}</Text>
              <HStack space="sm" alignItems="center" justifyItems="flex-end">
                <TokenItem token={item.Token} />

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
    </>
  )
}

export default AuthTokenList
