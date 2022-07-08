import React, { useContext, useEffect, useRef, useState } from 'react'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faCirclePlus,
  faPlus,
  faXmark
} from '@fortawesome/free-solid-svg-icons'
import { format as timeAgo } from 'timeago.js'

import {
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  Text,
  View,
  VStack,
  FlatList,
  useColorModeValue
} from 'native-base'

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
    authAPI
      .tokens()
      .then((tokens) => {
        setTokens(tokens)
      })
      .catch((err) => context.error('' + err))
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
      .catch((err) => context.error('' + err))
  }

  const handleAddToken = () => {}

  const tokenExpired = (expire) => {
    return expire > 0 && expire < parseInt(new Date().getTime() / 1e3)
  }

  const refreshList = (next) => {
    authAPI
      .tokens()
      .then((tokens) => {
        setTokens(tokens)
      })
      .catch((err) => context.error('failed to fetch tokens'))
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
        variant="ghost"
        colorScheme="blueGray"
      >
        Add Token
      </Button>
    )
  }

  return (
    <View mt={4}>
      <HStack space={1} alignItems="center">
        <Heading fontSize="md">API Tokens</Heading>

        <Box alignSelf="center">
          <ModalForm
            title="Create new Auth Token"
            triggerText="Add Auth Token"
            modalRef={refModal}
          >
            <AddAuthToken notifyChange={notifyChange} />
          </ModalForm>
        </Box>

      </HStack>
      <Box
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        rounded="md"
        width="100%"
        p={4}
        my={4}
      >
        <FlatList
          data={tokens}
          renderItem={({ item }) => (
            <Box
              borderBottomWidth={1}
              borderColor="muted.200"
              _dark={{ borderColor: 'muted.600' }}
              py={2}
            >
              <HStack
                w="100%"
                space={3}
                alignItems="center"
                __justifyContent="stretch"
              >
                <Text flex={1}>{item.Name}</Text>
                <Text flex={1} w="3/6">
                  {item.Token}
                </Text>
                <HStack w="2/6" space={1} justifyContent="flex-end">
                  <Text color="muted.500">Expire</Text>
                  <Text
                    color={
                      tokenExpired(item.Expire) ? 'warning.400' : 'muted.500'
                    }
                  >
                    {item.Expire
                      ? timeAgo(new Date(item.Expire * 1e3))
                      : 'Never'}
                  </Text>
                </HStack>

                <IconButton
                  alignSelf="center"
                  size="sm"
                  variant="ghost"
                  colorScheme="secondary"
                  icon={<Icon icon={faXmark} />}
                  onPress={() => deleteListItem(item)}
                />
              </HStack>
            </Box>
          )}
          keyExtractor={(item) => item.Token}
        />

        <VStack>
          {tokens !== null && tokens.length === 0 ? (
            <Text alignSelf="center">There are no API tokens added yet</Text>
          ) : null}
          <Button
            display={{ base: 'flex', md: tokens.length ? 'none' : 'flex' }}
            variant={useColorModeValue('subtle', 'solid')}
            colorScheme="muted"
            leftIcon={<Icon icon={faCirclePlus} />}
            onPress={() => setIsModalOpen(true)}
            mt={4}
          >
            Add token
          </Button>
        </VStack>
      </Box>
    </View>
  )
}

export default AuthTokenList
