import React, { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import CustomPlugin from 'components/Plugins/CustomPlugin'
import InstallPlugin from 'components/Plugins/InstallPlugin'

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

import { AlertContext, AppContext } from 'AppContext'
import { api, API } from 'api'
import { themes } from 'Themes'

const pluginThemePayload = (ctx) => {
  let theme = ctx?.theme || 'default'
  let customThemes = ctx?.customThemes || {}
  let colorMode = ctx?.viewSettings?.colorMode || 'light'
  let activeCustom = customThemes[theme]
  let effectiveColorMode = activeCustom
    ? activeCustom.colorMode
    : themes[theme]?.colorMode || colorMode
  let colors = customThemes[theme]?.colors || themes[theme]?.colors || {}
  return { colorMode: effectiveColorMode, theme, colors }
}

const PLUGIN_UI_AUTH_PROTOCOL_VERSION = 1
const PLUGIN_UI_AUTH_REFRESH_LEAD_MS = 60 * 1000

const inlineJSON = (value) => JSON.stringify(value).replace(/</g, '\\u003c')

const pluginAuthBridge = () => `
(function () {
  var protocolVersion = ${PLUGIN_UI_AUTH_PROTOCOL_VERSION};
  var currentToken = window.SPR_API_TOKEN;
  var pendingRefresh = null;
  var apiBase = new URL(window.SPR_API_URL, document.baseURI);
  var pluginBase = new URL('plugins/' + window.SPR_PLUGIN.URI + '/', apiBase);
  var pluginPath = pluginBase.pathname.replace(/\\/$/, '');
  var originalFetch = window.fetch.bind(window);

  function parseMessage(event) {
    if (event.source !== window.parent) return null;
    var data = event.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (err) { return null; }
    }
    return data && typeof data === 'object' ? data : null;
  }

  window.addEventListener('message', function (event) {
    var data = parseMessage(event);
    if (!data || data.type !== 'spr:auth' ||
        data.protocolVersion !== protocolVersion || !data.token) return;
    currentToken = data.token;
    window.SPR_API_TOKEN = data.token;
    window.SPR_API_TOKEN_EXPIRES_AT = data.expiresAt;
    if (pendingRefresh && data.requestId === pendingRefresh.requestId) {
      pendingRefresh.finish(true);
    }
  }, false);

  function requestRekey() {
    if (pendingRefresh) return pendingRefresh.promise;
    var requestId = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : Date.now() + '-' + Math.random().toString(36).slice(2);
    var resolvePromise;
    var promise = new Promise(function (resolve) { resolvePromise = resolve; });
    var timeout = setTimeout(function () { finish(false); }, 10000);
    function finish(refreshed) {
      clearTimeout(timeout);
      if (pendingRefresh && pendingRefresh.requestId === requestId) {
        pendingRefresh = null;
      }
      resolvePromise(refreshed);
    }
    pendingRefresh = { requestId: requestId, promise: promise, finish: finish };
    window.parent.postMessage(JSON.stringify({
      type: 'spr:auth-required',
      protocolVersion: protocolVersion,
      requestId: requestId
    }), '*');
    return promise;
  }

  function isPluginAPIRequest(request) {
    var target = new URL(request.url, document.baseURI);
    return target.origin === pluginBase.origin &&
      (target.pathname === pluginPath || target.pathname.indexOf(pluginPath + '/') === 0);
  }

  function withCurrentToken(request) {
    var headers = new Headers(request.headers);
    headers.set('Authorization', 'Bearer ' + currentToken);
    return new Request(request, { headers: headers });
  }

  window.fetch = async function (input, init) {
    var normalizedInput = (typeof input === 'string' || input instanceof URL)
      ? new URL(input, document.baseURI).toString()
      : input;
    var request = new Request(normalizedInput, init);
    if (!currentToken || !isPluginAPIRequest(request)) {
      return originalFetch(request);
    }

    request = withCurrentToken(request);
    var retryRequest = request.clone();
    var response = await originalFetch(request);
    if (response.status === 401 &&
        response.headers.get('X-SPR-Auth-Error') === 'invalid_token' &&
        await requestRekey()) {
      return originalFetch(withCurrentToken(retryRequest));
    }
    return response;
  };
})();`

const mintPluginUISession = async (pluginURI, replaceSessionId = null) => {
  const session = await api.put('/plugin/ui_session', {
    pluginURI,
    protocolVersion: PLUGIN_UI_AUTH_PROTOCOL_VERSION,
    replaceSessionId
  })
  if (
    session?.protocolVersion !== PLUGIN_UI_AUTH_PROTOCOL_VERSION ||
    session?.pluginURI !== pluginURI ||
    !session?.token ||
    !session?.sessionId ||
    !Number.isFinite(session?.expiresAt)
  ) {
    throw new Error('Plugin UI authentication protocol mismatch')
  }
  return session
}

const getPluginHTML = async (plugin, theme, pluginAuth = null) => {
  // fetch html from api using auth
  let Authorization = await api.getAuthHeaders()
  let headers = {
    Authorization
  }

  let pathname = `plugins/${plugin.URI}/`

  let api_url = api.getApiURL()
  let u = new URL(api_url)
  u.pathname += pathname

  let url = u.toString()
  let res = await fetch(url, { headers })
  if (!res.ok) {
    throw new Error(`Plugin HTML request failed with HTTP ${res.status}`)
  }
  let html = await res.text()

  const pluginInfo = Object.keys(plugin)
    .filter((key) => ['Name', 'URI', 'GitURL'].includes(key))
    .reduce((obj, key) => {
      obj[key] = plugin[key]
      return obj
    }, {})

  let authBootstrap = pluginAuth
    ? ` window.SPR_API_TOKEN = ${inlineJSON(
        pluginAuth.token
      )}; window.SPR_API_TOKEN_EXPIRES_AT = ${inlineJSON(
        pluginAuth.expiresAt
      )}; window.SPR_PLUGIN_UI_AUTH_VERSION = ${PLUGIN_UI_AUTH_PROTOCOL_VERSION}; ${pluginAuthBridge()}`
    : ''
  let scriptTag = `<script>window.SPR_API_URL = ${inlineJSON(
    api_url
  )}; window.SPR_PLUGIN = ${inlineJSON(
    pluginInfo
  )}; window.SPR_THEME = ${inlineJSON(theme || {})};${authBootstrap}</script>`
  html = html.replace('</head>', `${scriptTag}</head>`)

  // srcdoc documents inherit the parent page's base URL, so relative asset
  // paths in the plugin html (./static/js/...) would resolve against the SPR
  // frontend instead of the plugin. Pin the base to the api's plugin static
  // route (/admin/custom_plugin/<URI>/static/... -> plugin socket /static/...)
  let baseHref = new URL(
    `admin/custom_plugin/${encodeURIComponent(plugin.URI)}/`,
    api_url
  ).toString()
  html = html.replace('<head>', `<head><base href="${baseHref}"/>`)

  return html
}

const PluginFrame = ({ name }) => {
  const context = useContext(AlertContext)
  const appContext = useContext(AppContext)
  const navigate = useNavigate()

  const [srcDoc, setSrcDoc] = useState(null)
  const [isSandboxed, setIsSandboxed] = useState(true)
  const [pluginAuth, setPluginAuth] = useState(null)
  const [pendingLegacyPlugin, setPendingLegacyPlugin] = useState(null)
  const [approvedLegacyPlugin, setApprovedLegacyPlugin] = useState(null)
  const pluginRef = useRef(null)
  const pluginAuthRef = useRef(null)
  const refreshTimerRef = useRef(null)
  const refreshInFlightRef = useRef(null)
  const refreshSessionRef = useRef(null)

  const refreshSession = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current
    }

    const plugin = pluginRef.current
    if (!plugin || plugin.SandboxedUI === false) {
      return null
    }

    const pluginURI = plugin.URI
    const previousSessionId = pluginAuthRef.current?.sessionId || null
    const refresh = mintPluginUISession(pluginURI, previousSessionId)
      .then((session) => {
        if (pluginRef.current?.URI !== pluginURI) {
          return null
        }
        pluginAuthRef.current = session
        setPluginAuth(session)

        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current)
        }
        const delay = Math.max(
          1000,
          session.expiresAt - Date.now() - PLUGIN_UI_AUTH_REFRESH_LEAD_MS
        )
        refreshTimerRef.current = setTimeout(() => {
          refreshSessionRef.current?.().catch((err) => {
            context.error('Failed to renew plugin UI authentication:', err)
          })
        }, delay)
        return session
      })
      .finally(() => {
        refreshInFlightRef.current = null
      })

    refreshInFlightRef.current = refresh
    return refresh
  }, [context])
  refreshSessionRef.current = refreshSession

  const handleAuthRequired = useCallback(() => refreshSession(), [refreshSession])

  useEffect(() => {
    let cancelled = false
    if (approvedLegacyPlugin && approvedLegacyPlugin !== name) {
      setApprovedLegacyPlugin(null)
    }
    setSrcDoc(null)
    setIsSandboxed(true)
    setPluginAuth(null)
    setPendingLegacyPlugin(null)
    pluginRef.current = null
    pluginAuthRef.current = null
    api
      .get('/plugins')
      .then(async (plugins) => {
        let plugin = plugins.find((p) => p.URI == name)
        if (!plugin) {
          throw new Error(`Failed to find plugin: ${name}`)
        }

        const sandboxed = plugin.SandboxedUI !== false
        pluginRef.current = plugin
        setIsSandboxed(sandboxed)
        if (!sandboxed && approvedLegacyPlugin !== plugin.URI) {
          setPendingLegacyPlugin(plugin)
          return
        }
        const session = sandboxed ? await refreshSession() : null
        const html = await getPluginHTML(
          plugin,
          pluginThemePayload(appContext),
          session
        )
        if (!cancelled && pluginRef.current?.URI === plugin.URI) {
          setSrcDoc(html)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message =
            err?.status === 409
              ? 'Plugin UI authentication is incompatible with this API version. Reload after the API and frontend are updated.'
              : 'Failed to load plugin UI:'
          context.error(message, err)
        }
      })

    return () => {
      cancelled = true
      pluginRef.current = null
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      const sessionID = pluginAuthRef.current?.sessionId
      pluginAuthRef.current = null
      if (sessionID) {
        api.delete(`/plugin/ui_session/${encodeURIComponent(sessionID)}`).catch(() => {})
      }
    }
  }, [name, approvedLegacyPlugin])

  return (
    <>
      <CustomPlugin
        srcDoc={srcDoc}
        isSandboxed={isSandboxed}
        pluginAuth={isSandboxed ? pluginAuth : null}
        onAuthRequired={isSandboxed ? handleAuthRequired : null}
      />
      <AlertDialog
        isOpen={pendingLegacyPlugin !== null}
        onClose={() => navigate('/admin/home')}
      >
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogHeader>
            <Heading size="md">Plugin UI has full API access</Heading>
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text size="sm">
              {pendingLegacyPlugin?.Name || pendingLegacyPlugin?.URI} has disabled
              UI sandboxing. Its code runs with the SPR admin page&apos;s access
              and can make API requests with your privileges.
            </Text>
            <Text size="sm" mt="$2">
              Continue only if you trust this plugin and its UI code.
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter>
            <HStack space="md">
              <Button
                size="sm"
                action="secondary"
                variant="outline"
                onPress={() => navigate('/admin/home')}
              >
                <ButtonText>Leave plugin</ButtonText>
              </Button>
              <Button
                size="sm"
                action="negative"
                onPress={() => {
                  setApprovedLegacyPlugin(pendingLegacyPlugin?.URI || null)
                  setPendingLegacyPlugin(null)
                }}
              >
                <ButtonText>Continue with API access</ButtonText>
              </Button>
            </HStack>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
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

      {isConnected ? <CustomPlugin src={src} isSandboxed={false} /> : null}
    </>
  )
}

const CustomPluginView = () => {
  const params = useParams()
  //default=:name
  const name = params.name !== ':name' ? params.name : null

  let page = null
  if (name == null) {
    page = <InstallPlugin />
  } else if (name == ':dev') {
    page = <CustomPluginForm />
  } else {
    page = (
      <VStack space="md" p="$4" h="$full">
        {/*<Heading size="md">{name}</Heading>*/}
        <PluginFrame name={name} />
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
