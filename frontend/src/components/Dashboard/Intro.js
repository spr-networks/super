import React from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNavigate } from 'react-router-native'

import {
  Divider,
  Box,
  HStack,
  Icon,
  Text,
  useColorMode,
  VStack,
  Pressable,
  Button,
  ButtonText,
  ButtonIcon
} from '@gluestack-ui/themed'

import { Flame, FlameIcon, Settings2Icon } from 'lucide-react-native'

const IntroWidget = ({
  title,
  text,

  ...props
}) => {
  const navigate = useNavigate()

  const onPress = () => {
    AsyncStorage.setItem('intro-done', 'true')
    navigate('/admin/firewallSettings')
  }

  return (
    <Pressable onPress={onPress}>
      <Box
        minHeight={150}
        bg={
          useColorMode() == 'light'
            ? '$backgroundCardLight'
            : '$backgroundCardDark'
        }
        borderRadius={10}
        {...props}
      >
        <HStack
          p="$4"
          justifyContent="space-between"
          alignItems="center"
          flexDirection="column"
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
              Click here to setup what services and ports to allow
            </Text>
          </VStack>
          <VStack>
            <Button
              size="xs"
              action="primary"
              variant="outline"
              rounded="$lg"
              onPress={onPress}
            >
              <ButtonIcon mr="$2" as={Settings2Icon} />
              <ButtonText>Setup services</ButtonText>
            </Button>
          </VStack>
        </HStack>
      </Box>
    </Pressable>
  )
}

export default IntroWidget
