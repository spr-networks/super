import { useContext, useEffect, useState } from 'react'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'
import { format as timeAgo } from 'timeago.js'

import {
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  Text,
  View,
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

  const handleSubmit = (exp) => {
    let expires = {
      Never: 0,
      '30 days': 30 * 24 * 3600,
      '90 days': 90 * 24 * 3600,
      '1 year': 365 * 24 * 3600
    }

    expires.Never = 20

    let ts = parseInt(new Date().getTime() / 1e3)
    let expire = exp ? ts + expires[exp] : 0

    authAPI
      .putToken(parseInt(expire))
      .then((token) => {
        setTokens(tokens.concat(token))
      })
      .catch((err) => context.error('' + err))
  }

  const tokenExpired = (expire) => {
    return expire > 0 && expire < parseInt(new Date().getTime() / 1e3)
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
            options={['Never', '30 days', '90 days', '1 year']}
            defaultValue="Never"
            onSubmit={handleSubmit}
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
                <Text flex={1}>{item.Name}</Text>
                <Text flex={1}>{item.Token}</Text>
                <HStack flex={1} space={1}>
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
        {tokens !== null && tokens.length === 0 ? (
          <Text py={4}>There are no API tokens added yet</Text>
        ) : null}
      </Box>
    </View>
  )
}

export default AuthTokenList
