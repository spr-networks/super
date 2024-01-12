import React, { useContext, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

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
import { api, API } from 'api'

const getPluginHTML = async (name) => {
  // fetch html from api using auth
  let Authorization = await api.getAuthHeaders()
  let headers = {
    Authorization
  }

  let pathname = `/plugins/${name}`

  let u = new URL(api.getApiURL())
  u.pathname = pathname

  let url = u.toString()
  let res = await fetch(url, { headers })
  let html = await res.text()

  return html
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

const PluginFrame = ({ name, ...props }) => {
  const [srcDoc, setSrcDoc] = useState(null)
  const fetchHTML = async () => {
    try {
      let html = await getPluginHTML(name)
      setSrcDoc(html)
    } catch (err) {
      context.error(`Failed to fetch html: ${err}`)
    }
  }

  useEffect(() => {
    //TODO verify plugin exists and is running - fetch from plugin api
    fetchHTML()
  }, [name])

  return <CustomPlugin srcDoc={srcDoc} />
}

const CustomPluginForm = () => {
  const context = useContext(AlertContext)

  const colorMode = useColorMode()

  const [isConnected, setIsConnected] = useState(false)
  const [src, setSrc] = useState('http://localhost:8080')
  const [srcDoc, setSrcDoc] = useState(null)

  let linkSx = {
    _text: {
      textDecorationLine: 'none',
      color:
        colorMode == 'light' ? '$navbarTextColorLight' : '$navbarTextColorDark'
    }
  }

  const handlePress = async () => {
    if (!isConnected) {
      // if srcDoc type (defined plugin), setup
      if (false && src.match(/^\//)) {
        /*
        //NOTE This is only for testing
        try {
          let html = await getPluginHTML(src)
          setSrcDoc(html)
          setIsConnected(!isConnected)
        } catch (err) {
          context.error(`Failed to fetch html: ${err}`)
        }
        */
      } else {
        if (!validSrc(src)) {
          context.error(
            'Invalid url specifed, support http://localhost or http://spr.local for now'
          )
          return
        }

        setIsConnected(!isConnected)
      }
    } else {
      setIsConnected(!isConnected)
    }
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
              <Input size="md">
                <InputField
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
                  {isConnected ? 'Disconnect' : 'Test Render from URL'}
                </ButtonText>
              </Button>
            </FormControl>
          </HStack>
          <HStack space="sm" alignItems="flex-end">
            <Button size="sm" action="secondary" variant="outline">
              <Link
                isExternal
                href="https://github.com/spr-networks/spr-sample-plugin"
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

      {isConnected ? <CustomPlugin src={src} srcdoc={srcDoc} /> : null}
    </>
  )
}

const CustomPluginView = ({ ...props }) => {
  const [name, setName] = useState(null)
  const params = useParams()

  useEffect(() => {
    let { name } = params
    //default=:name
    if (name !== ':name') {
      setName(name)
    }
  }, [])

  return (
    <VStack space="md" h="$full">
      {name ? (
        <VStack space="md" p="$4" h="$full">
          <Heading size="md">{name}</Heading>
          <PluginFrame name={name} />
        </VStack>
      ) : (
        <>
          <InstallPlugin />
          <CustomPluginForm />
        </>
      )}
    </VStack>
  )
}

export default CustomPluginView
