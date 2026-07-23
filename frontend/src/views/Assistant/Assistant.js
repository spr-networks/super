import React from 'react'
import { Center, Heading, Text, VStack } from '@gluestack-ui/themed'

const Assistant = () => (
  <Center flex={1} p="$6">
    <VStack space="md" maxWidth={520}>
      <Heading>SPR Assistant</Heading>
      <Text>
        The local WebLLM assistant is available in the web interface on a
        WebGPU-capable browser.
      </Text>
    </VStack>
  </Center>
)

export default Assistant
