import React, { useContext, useEffect, useState, useRef } from 'react'
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

  const installPlugin = (pluginUrl) => {
    setIsRunning(true)
    
    api
      .put('/plugin/install_user_url', pluginUrl)
      .then((res) => {
        context.success(`Plugin installing...`)
        setIsRunning(false)
        // Clear the URL on success
        setUrl('')
        // Clear any pending installation
        sessionStorage.removeItem('pendingPluginInstall')
      })
      .catch((err) => {
        setIsRunning(false)
        if (err.response) {
          err.response.text().then((data) => {
            if (data.includes('Invalid JWT')) {
              // Store the URL for retry after OTP validation
              sessionStorage.setItem('pendingPluginInstall', JSON.stringify({
                url: pluginUrl,
                timestamp: Date.now()
              }))
              // The OTP modal will be shown by the error handler in Admin.js
            } else {
              context.error(`Check Plugin URL: ${data}`)
            }
          })
        } else {
          context.error(`API Error`, err)
        }
      })
  }

  const handleSubmit = () => {
    if (!validUrl(url)) {
      context.error(
        `Invalid url, only github repositories for now. Example: https://github.com/spr-networks/spr-mitmproxy.git`
      )
      return
    }

    installPlugin(url)
  }

  // Check for pending plugin installation from sessionStorage
  const checkAndRetryPendingInstall = () => {
    const pendingPlugin = sessionStorage.getItem('pendingPluginInstall')
    if (pendingPlugin) {
      const { url: pendingUrl, timestamp } = JSON.parse(pendingPlugin)
      // Check if the pending installation is less than 5 minutes old
      if (Date.now() - timestamp < 5 * 60 * 1000) {
        setUrl(pendingUrl)
        sessionStorage.removeItem('pendingPluginInstall')
        // Auto-submit after a short delay
        setTimeout(() => {
          context.info('Retrying plugin installation...')
          installPlugin(pendingUrl)
        }, 500)
      } else {
        // Clear stale pending installation
        sessionStorage.removeItem('pendingPluginInstall')
      }
    }
  }

  // Check on component mount
  useEffect(() => {
    checkAndRetryPendingInstall()
  }, [])

  // Listen for OTP validation success
  useEffect(() => {
    const handleOTPValidated = () => {
      // Give a small delay for the JWT token to be set
      setTimeout(() => {
        checkAndRetryPendingInstall()
      }, 100)
    }

    window.addEventListener('otp-validated', handleOTPValidated)
    
    return () => {
      window.removeEventListener('otp-validated', handleOTPValidated)
    }
  }, [])

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
