import React, { useContext, useState } from 'react'
import CustomPlugin from 'components/Plugins/CustomPlugin'
import InstallPlugin from 'components/Plugins/InstallPlugin'
import {
  Button,
  ButtonText,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Heading,
  HStack,
  Input,
  InputField,
  Link,
  LinkText,
  Text,
  VStack,
  View,
  useColorMode
} from '@gluestack-ui/themed'

import { AlertContext } from 'AppContext'

const CustomPluginForm = () => {
  const context = useContext(AlertContext)

  const colorMode = useColorMode()

  const [isConnected, setIsConnected] = useState(false)
  const [src, setSrc] = useState('http://localhost:8080')

  let linkSx = {
    _text: {
      textDecorationLine: 'none',
      color:
        colorMode == 'light' ? '$navbarTextColorLight' : '$navbarTextColorDark'
    }
  }

  const validSrc = (value) => {
    try {
      let url = new URL(value)
      if (!url.protocol.match(/^https?:$/)) {
        return false
      }

      if (!url.hostname.match(/^localhost|spr.local$/)) {
        return false
      }
    } catch (err) {
      console.error(err)
      return false
    }

    return true
  }

  const handlePress = () => {
    if (!validSrc(src)) {
      context.error(
        'Invalid url specifed, support http://localhost or http://spr.local for now'
      )
      return
    }
    setIsConnected(!isConnected)
  }

  return (
    <>
      <VStack
        p="$4"
        space="md"
        bg="$backgroundCardLight"
        sx={{ _dark: { bg: '$backgroundCardDark' } }}
      >
        <HStack>
          <Heading size="sm">Plugin Dev Mode</Heading>
        </HStack>
        <VStack space="md" w="$full" sx={{ '@md': { flexDirection: 'row' } }}>
          <HStack
            space="md"
            alignItems="flex-end"
            sx={{ '@md': { maxWidth: '$1/2' } }}
            flex={1}
          >
            <FormControl flex={1}>
              <FormControlLabel>
                <FormControlLabelText>Iframe Source URL</FormControlLabelText>
              </FormControlLabel>
              <Input size="md" _isDisabled>
                <InputField
                  autoFocus
                  value={src}
                  onChangeText={(value) => setSrc(value)}
                  onSubmitEditing={(value) => setSrc(value)}
                />
              </Input>
            </FormControl>
            <FormControl>
              <Button
                size="sm"
                onPress={handlePress}
                variant="solid"
                action={isConnected ? 'negative' : 'positive'}
              >
                <ButtonText>
                  {isConnected ? 'Disconnect' : 'Start dev mode'}
                </ButtonText>
              </Button>
            </FormControl>
          </HStack>
          <HStack space="sm" alignItems="flex-end">
            <Button size="sm" action="secondary" variant="outline">
              <Link
                isExternal
                href="https://github.com/spr-networks/super"
                sx={linkSx}
              >
                <LinkText size="sm">Example Code</LinkText>
              </Link>
            </Button>
            <Button size="sm" action="secondary" variant="outline">
              <Link
                isExternal
                href="https://www.supernetworks.org/pages/api/0"
                sx={linkSx}
              >
                <LinkText size="sm">API Docs</LinkText>
              </Link>
            </Button>
          </HStack>
        </VStack>
      </VStack>
      {isConnected ? <CustomPlugin src={src} /> : null}
    </>
  )
}

const CustomPluginView = ({ ...props }) => {
  return (
    <VStack space="md" h="$full">
      <InstallPlugin />
      <CustomPluginForm />
    </VStack>
  )
}

export default CustomPluginView
