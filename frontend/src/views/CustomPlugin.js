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

const getPluginHTML = async (plugin) => {
  // fetch html from api using auth
  let Authorization = await api.getAuthHeaders()
  let headers = {
    Authorization
  }

  let pathname = `/plugins/${plugin.URI}`

  let api_url = api.getApiURL()
  let u = new URL(api_url)
  u.pathname = pathname

  let url = u.toString()
  let res = await fetch(url, { headers })
  let html = await res.text()

  const pluginInfo = Object.keys(plugin)
    .filter((key) => ['Name', 'URI', 'GitURL'].includes(key))
    .reduce((obj, key) => {
      obj[key] = plugin[key]
      return obj
    }, {})

  let scriptTag = `<script>window.SPR_API_URL = ${JSON.stringify(
    api_url
  )}; window.SPR_PLUGIN = ${JSON.stringify(pluginInfo)};</script>`
  html = html.replace('</head>', `${scriptTag}</head>`)

  return html
}

const PluginFrame = ({ name, ...props }) => {
  const context = useContext(AlertContext)

  const [srcDoc, setSrcDoc] = useState(null)
  const fetchHTML = async (plugin) => {
    try {
      let html = await getPluginHTML(plugin)
      setSrcDoc(html)
    } catch (err) {
      context.error(`Failed to fetch html:`, err)
    }
  }

  useEffect(() => {
    api
      .get('/plugins')
      .then((plugins) => {
        let plugin = plugins.find((p) => p.URI == name)
        if (!plugin) {
          throw new Error(`Failed to find plugin: ${name}`)
        }

        fetchHTML(plugin)
      })
      .catch((err) => {
        context.error(err)
      })
  }, [name])

  return <CustomPlugin srcDoc={srcDoc} isSandboxed={props.isSandboxed} />
}

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
    } catch (err) {
      return false
    }

    return true
  }

  const handlePress = async () => {
    if (!validSrc(src)) {
      context.error(
        'Invalid protocol for URL specified. Example: http://localhost:8080'
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

      {isConnected ? <CustomPlugin src={src} /> : null}
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

  let page = null
  if (name == null) {
    page = <InstallPlugin />
  } else if (name == ':dev') {
    page = <CustomPluginForm />
  } else {
    page = (
      <VStack space="md" p="$4" h="$full">
        {/*<Heading size="md">{name}</Heading>*/}
        <PluginFrame name={name} isSandboxed={props.isSandboxed} />
      </VStack>
    )
  }

  return (
    <VStack space="md" h="$full">
      {page}
    </VStack>
  )
}

export default CustomPluginView
