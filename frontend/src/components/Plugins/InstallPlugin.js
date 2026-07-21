import React, { useContext, useEffect, useState } from 'react'

import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  Button,
  ButtonText,
  FormControl,
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
  useColorMode
} from '@gluestack-ui/themed'

import { AlertContext } from 'AppContext'
import { api } from 'api'

const InstallPlugin = ({ ...props }) => {
  const context = useContext(AlertContext)
  const [url, setUrl] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [pendingPlugin, setPendingPlugin] = useState(null)

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

  const handleInstallError = (err, pluginUrl) => {
    setIsRunning(false)
    if (err.response) {
      err.response.text().then((data) => {
        if (data.includes('Invalid JWT')) {
          sessionStorage.setItem(
            'pendingPluginInstall',
            JSON.stringify({ url: pluginUrl, timestamp: Date.now() })
          )
        } else {
          context.error(`Check Plugin URL: ${data}`)
        }
      })
    } else {
      context.error(`API Error`, err)
    }
  }

  const completeInstall = (plugin) => {
    setIsRunning(true)
    api
      .put('/plugin/complete_install', plugin)
      .then(() => {
        context.success('Plugin installed')
        setIsRunning(false)
        setUrl('')
        sessionStorage.removeItem('pendingPluginInstall')
      })
      .catch((err) => handleInstallError(err, plugin.GitURL))
  }

  const installPlugin = (pluginUrl) => {
    setIsRunning(true)
    api
      .put('/plugin/download_info', pluginUrl)
      .then((plugin) => {
        if (plugin.Runtime === 'kvm' && plugin.RuntimeReady === false) {
          setIsRunning(false)
          if (plugin.FallbackRuntime && plugin.FallbackComposeFilePath) {
            setPendingPlugin(plugin)
          } else {
            context.error(
              plugin.RuntimeUnavailableReason ||
                'This plugin requires KVM, but KVM plugin support is not ready on this system.'
            )
          }
          return
        }
        completeInstall(plugin)
      })
      .catch((err) => handleInstallError(err, pluginUrl))
  }

  const installWithoutKVM = () => {
    const plugin = {
      ...pendingPlugin,
      Runtime: pendingPlugin.FallbackRuntime,
      ComposeFilePath: pendingPlugin.FallbackComposeFilePath
    }
    setPendingPlugin(null)
    completeInstall(plugin)
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

      <AlertDialog
        isOpen={pendingPlugin !== null}
        onClose={() => setPendingPlugin(null)}
      >
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogHeader>
            <Heading size="md">KVM plugin support is not ready</Heading>
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text size="sm">
              {pendingPlugin?.RuntimeUnavailableReason ||
                'The spr-krun Docker runtime is not available on this system.'}
            </Text>
            <Text size="sm" mt="$2">
              Install this plugin with the standard Docker runtime instead?
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter>
            <HStack space="md">
              <Button
                size="sm"
                action="secondary"
                variant="outline"
                onPress={() => setPendingPlugin(null)}
              >
                <ButtonText>Cancel</ButtonText>
              </Button>
              <Button size="sm" action="primary" onPress={installWithoutKVM}>
                <ButtonText>Install without KVM</ButtonText>
              </Button>
            </HStack>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </VStack>
  )
}

export default InstallPlugin
