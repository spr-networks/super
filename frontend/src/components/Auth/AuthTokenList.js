import { useContext, useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'

import {
  Box,
  Button,
  Heading,
  HStack,
  Icon,
  IconButton,
  Text,
  View,
  Fab,
  FlatList,
  useColorModeValue
} from 'native-base'

import { authAPI } from 'api'
import { AlertContext } from 'AppContext'
import ModalConfirm from 'components/ModalConfirm'

const AuthTokenList = (props) => {
  const [status, setStatus] = useState('not configured')
  const [tokens, setTokens] = useState([])

  const context = useContext(AlertContext)

  useEffect(() => {
    authAPI
      .tokens()
      .then((tokens) => {
        setTokens(tokens)
      })
      .catch((err) => context.error(err))
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
      .catch((err) => context.error(err))
  }

  const handleAddToken = () => {}

  const handleSubmit = (expire) => {
    console.log('new token:', expire)
    authAPI
      .putToken(parseInt(expire))
      .then((token) => {
        setTokens(tokens.concat(token))
      })
      .catch((err) => context.error(err))
  }

  return (
    <View mt={4}>
      <Box
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        rounded="md"
        width="100%"
        p={4}
      >
        <HStack space="1" mb="2">
          <Heading fontSize="lg">API Tokens</Heading>

          <ModalConfirm
            type="Expire"
            defaultValue="0"
            handleSubmit={handleSubmit}
            trigger={(triggerProps) => {
              return (
                <Button {...triggerProps} marginLeft="auto">
                  {'Add Token'}
                </Button>
              )
            }}
          />
        </HStack>
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
                justifyContent="stretch"
              >
                <Text flex={1}>{item.Token}</Text>
                <HStack flex={1} space={1}>
                  <Text color="muted.500">Expire</Text>
                  <Text>{item.Expire}</Text>
                </HStack>

                <IconButton
                  alignSelf="center"
                  size="sm"
                  variant="ghost"
                  colorScheme="secondary"
                  icon={<Icon as={FontAwesomeIcon} icon={faXmark} />}
                  onPress={() => deleteListItem(item)}
                />
              </HStack>
            </Box>
          )}
          keyExtractor={(item) => item.Token}
        />
      </Box>
    </View>
  )
}

export default AuthTokenList
