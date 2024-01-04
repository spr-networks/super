import React, { useState } from 'react'
import PluginList from 'components/Plugins/PluginList'
import CustomPlugin from 'components/Plugins/CustomPlugin'
import {
  Button,
  ButtonText,
  Heading,
  HStack,
  Input,
  InputField,
  Link,
  LinkText,
  Text,
  VStack,
  useColorMode
} from '@gluestack-ui/themed'

const CustomView = () => {
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

  return (
    <VStack space="md" h="$full">
      <VStack
        p="$4"
        space="md"
        bg="$backgroundCardLight"
        sx={{ _dark: { bg: '$backgroundCardDark' } }}
      >
        <Heading size="sm">Plugin Dev Mode</Heading>
        <HStack space="md" alignItems="center">
          <Text size="sm" bold>
            IFrame Src
          </Text>
          <Input size="md" isDisabled>
            <InputField
              autoFocus
              value={src}
              onChangeText={(value) => setSrc(value)}
              onSubmitEditing={(value) => setSrc(value)}
            />
          </Input>
          <Button
            size="sm"
            onPress={() => setIsConnected(!isConnected)}
            variant="solid"
            action={isConnected ? 'negative' : 'positive'}
          >
            <ButtonText>{isConnected ? 'Disconnect' : 'Start dev!'}</ButtonText>
          </Button>
          <HStack marginLeft="auto" space="2xl" alignItems="center">
            <Link
              isExternal
              href="https://github.com/spr-networks/super"
              sx={linkSx}
            >
              <LinkText size="sm">Example Code</LinkText>
            </Link>
            <Link
              isExternal
              href="https://www.supernetworks.org/pages/api/0"
              sx={linkSx}
            >
              <LinkText size="sm">API Docs</LinkText>
            </Link>
          </HStack>
        </HStack>
      </VStack>
      {isConnected ? <CustomPlugin src={src} /> : null}
    </VStack>
  )
}

const Plugins = (props) => {
  //TODO split up component & have plus as separate list
  return (
    <>
      <CustomView />
      {/*<PluginList />*/}
    </>
  )
}

export default Plugins
