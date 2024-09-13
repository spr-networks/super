import React, { useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNavigate } from 'react-router-native'

import {
  Box,
  HStack,
  Icon,
  Link,
  Text,
  useColorMode,
  VStack,
  Pressable,
  Button,
  ButtonText,
  ButtonIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import {
  LaptopIcon,
  BanIcon,
  PlusIcon,
  Settings2Icon,
  WifiIcon
} from 'lucide-react-native'

const IntroWidget = ({
  title,
  text,

  ...props
}) => {
  const [showAlert, setShowAlert] = useState(true)
  const navigate = useNavigate()

  const onPressClose = () => {
    AsyncStorage.setItem('intro-done', 'true')
    setShowAlert(false)
  }

  return (
    <Box
      minHeight={150}
      bg={
        useColorMode() == 'light'
          ? '$backgroundCardLight'
          : '$backgroundCardDark'
      }
      borderRadius={10}
      display={showAlert ? 'flex' : 'none'}
      {...props}
    >
      <HStack space="md" w="$full" py="$2">
        <VStack
          flex={1}
          p="$4"
          justifyContent="space-between"
          alignItems="center"
        >
          <VStack space="md" alignItems="center" mb="$4">
            <Text
              size="xl"
              color="$muted800"
              sx={{ _dark: { color: '$muted400' } }}
            >
              Welcome to SPR!
            </Text>
            <Text
              size="sm"
              fontWeight={300}
              color="$muted800"
              sx={{ _dark: { color: '$muted400' } }}
              textAlign="center"
            >
              Setup what services and ports to allow, or add a new device
            </Text>
          </VStack>
          <VStack space="md" sx={{ '@md': { flexDirection: 'row', gap: 16 } }}>
            <Button
              size="xs"
              action="primary"
              variant="outline"
              rounded="$lg"
              onPress={() => navigate('/admin/firewallSettings')}
            >
              <ButtonIcon mr="$2" as={Settings2Icon} />
              <ButtonText>Setup Services</ButtonText>
            </Button>
            <Button
              size="xs"
              action="primary"
              variant="outline"
              rounded="$lg"
              onPress={() => navigate('/admin/add_device')}
            >
              <ButtonIcon mr="$2" as={LaptopIcon} />
              <ButtonText>Add Device</ButtonText>
            </Button>
            <Button
              size="xs"
              action="primary"
              variant="outline"
              rounded="$lg"
              onPress={() => navigate('/admin/dnsBlock')}
            >
              <ButtonIcon mr="$2" as={BanIcon} />
              <ButtonText>DNS Ad Blocking</ButtonText>
            </Button>
            <Button
              size="xs"
              action="primary"
              variant="outline"
              rounded="$lg"
              onPress={() => navigate('/admin/uplink')}
            >
              <ButtonIcon mr="$2" as={WifiIcon} />
              <ButtonText>Wifi Uplink</ButtonText>
            </Button>
            <Link isExternal href="https://www.supernetworks.org/plus.html">
              <Button
                size="xs"
                action="primary"
                variant="outline"
                rounded="$lg"
              >
                <ButtonIcon mr="$2" as={PlusIcon} />
                <ButtonText>Get PLUS</ButtonText>
              </Button>
            </Link>
          </VStack>
        </VStack>
        <Pressable ml="auto" mr="$2" onPress={onPressClose}>
          <Icon as={CloseIcon} color="$muted500" />
        </Pressable>
      </HStack>
    </Box>
  )
}

export default IntroWidget
