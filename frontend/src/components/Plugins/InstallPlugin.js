import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import {
  Button,
  ButtonText,
  FormControl,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  ButtonSpinner,
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

const InstallPlugin = ({ ...props }) => {
  const context = useContext(AlertContext)
  const [url, setUrl] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const handleSubmit = () => {
    setIsRunning(true)
    //TODO fetch github repo, show notification:
    // * plugin.json is parsed successfully
    // * plugin build done and installed & running
    context.success(`TODO, Plugin parsed... build it`)
    setTimeout(() => {
      setIsRunning(false)
    }, 1500)
  }
  return (
    <VStack
      p="$4"
      space="md"
      bg="$backgroundCardLight"
      sx={{ _dark: { bg: '$backgroundCardDark' } }}
    >
      <Heading size="sm">Install Custom Plugin from Github URL</Heading>

      <HStack
        space="md"
        sx={{ '@md': { maxWidth: '$1/2' } }}
        alignItems="flex-end"
      >
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Github URL</FormControlLabelText>
          </FormControlLabel>
          <Input>
            <InputField
              placeholder="https://github.com/spr-networks/spr-sample-plugin-ui"
              value={url}
              onChangeText={(value) => setUrl(value)}
              autoFocus
            />
          </Input>
        </FormControl>
        <FormControl>
          {/*TODO spinner*/}
          <Button
            action="primary"
            onPress={handleSubmit}
            isDisabled={isRunning}
          >
            <ButtonText>Add Plugin</ButtonText>
            <ButtonSpinner ml="$2" display={isRunning ? 'flex' : 'none'} />
          </Button>
        </FormControl>
      </HStack>
    </VStack>
  )
}

export default InstallPlugin
