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
import { api, pluginAPI } from 'api'

const InstallPlugin = ({ ...props }) => {
  const context = useContext(AlertContext)
  const [url, setUrl] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  //should be https://github.com/spr-networks/spr-mitmproxy.git
  const validUrl = (url) => {
    try {
      let u = new URL(url)
      if (u.protocol !== 'https:' || u.hostname !== 'github.com') {
        return false
      }

      if (u.pathname.split('/').length !== 3) {
        return false
      }

      /*if (!u.pathname.endsWith('.git')) {
        return false
      }*/
    } catch (err) {
      return false
    }

    return true
  }

  const handleSubmit = () => {
    if (!validUrl(url)) {
      context.error(
        `Invalid url, only github repositories for now. Example: https://github.com/spr-networks/spr-mitmproxy.git`
      )
      return
    }

    setIsRunning(true)
    //TODO fetch github repo, show notification:
    // * plugin.json is parsed successfully
    // * plugin build done and installed & running

    api
      .put('/plugin/install_user_url', url)
      .then((res) => {
        context.success(`Plugin installing...`)
        setIsRunning(false)
      })
      .catch((err) => {
        if (err.response) {
          err.response.text().then((data) => {
            if (data.includes('Invalid JWT')) {
              //context.error(`One Time Passcode Authentication Required, failure: ${data}`)
              //NOTE this is catched outside of here and will show the OTP modal
            } else {
              context.error(`Check Plugin URL: ${data}`)
            }
          })
        } else {
          context.error(`API Error`, err)
        }
      })

    //context.success(`TODO, Plugin parsed... build it`)
    setTimeout(() => {
      setIsRunning(false)
    }, 1500)
  }

  const colorMode = useColorMode()

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
        sx={{ '@md': { maxWidth: '$2/3' } }}
        alignItems="flex-end"
      >
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Github URL</FormControlLabelText>
          </FormControlLabel>
          <Input>
            <InputField
              placeholder="https://github.com/spr-networks/spr-sample-plugin.git"
              value={url}
              onChangeText={(value) => setUrl(value)}
              autoFocus
            />
          </Input>
        </FormControl>
        <FormControl>
          <Button
            action="primary"
            onPress={handleSubmit}
            isDisabled={isRunning}
          >
            <ButtonText>Add Plugin</ButtonText>
            <ButtonSpinner ml="$2" display={isRunning ? 'flex' : 'none'} />
          </Button>
        </FormControl>
        <FormControl>
          <Button
            sx={{
              '@base': { display: 'none' },
              '@md': { display: 'flex' }
            }}
            size="md"
            action="secondary"
            variant="outline"
          >
            <Link
              href="/admin/custom_plugin/:dev"
              sx={{
                _text: {
                  textDecorationLine: 'none',
                  color:
                    colorMode == 'light'
                      ? '$navbarTextColorLight'
                      : '$navbarTextColorDark'
                }
              }}
            >
              <LinkText size="sm">Dev Mode</LinkText>
            </Link>
          </Button>
        </FormControl>
      </HStack>
    </VStack>
  )
}

export default InstallPlugin
