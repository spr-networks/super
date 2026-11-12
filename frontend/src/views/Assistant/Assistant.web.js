import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AlertIcon,
  AlertText,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  CloseIcon,
  Heading,
  HStack,
  Icon,
  InfoIcon,
  Pressable,
  Progress,
  ProgressFilledTrack,
  ScrollView,
  Spinner,
  Text,
  Textarea,
  TextareaInput,
  VStack,
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogCloseButton,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader
} from '@gluestack-ui/themed'
import {
  CheckIcon,
  CpuIcon,
  DownloadIcon,
  ExternalLinkIcon,
  MessageCircleIcon,
  RotateCcwIcon,
  SendIcon,
  Settings2Icon,
  ShieldCheckIcon,
  SquareTerminalIcon,
  XIcon
} from 'lucide-react-native'

import { useInRouterContext, useLocation, useNavigate } from 'react-router-dom'
import { setApiRequestObserver, setApiReadCache } from 'api/API'
import { getApiURL } from 'api'
import { AlertContext, AppContext } from 'AppContext'
import {
  applyProposal,
  executeReadTool,
  prepareProposal,
  proposalDiff
} from 'components/Assistant/assistantTools'
import { discardUIOperation } from 'components/Assistant/assistantOperations'
import TaskWorkflowPanel from 'components/Assistant/TaskWorkflowPanel'
import TerminalPane from 'components/Assistant/TerminalPane'
import { applyPipes, cliHistory, completeCli, describeOperation, helpFor, helpText, operationsText, PAGES, parseCli, runCliRead, setupPage } from 'components/Assistant/assistantCli'
import Alerts from 'views/Alerts'
import { taskReceipt, receiptForReview, receiptForApplied } from 'components/Assistant/taskRuntime'
import {
  runUIAssistantTurn,
  UI_CHAT_SYSTEM_PROMPT as CHAT_SYSTEM_PROMPT,
  UI_ASSISTANT_SYSTEM_PROMPT as SYSTEM_PROMPT
} from 'components/Assistant/assistantUiAgent'
import {
  contextLabel,
  DEFAULT_MODEL_KEY,
  getContextTokens,
  getModel,
  isWebLLMModelCached,
  loadWebLLM,
  MODEL_CATALOG
} from 'components/Assistant/webllmModels.web'

const INITIAL_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  includeInContext: false,
  content: 'Ask about devices, networking, DNS, firewall rules, monitoring, or system settings.'
}

const ACTION_PROMPT_STORAGE_KEY = 'spr-assistant/action-system-prompt-v3'
const CHAT_PROMPT_STORAGE_KEY = 'spr-assistant/chat-system-prompt-v3'
const MODEL_STORAGE_KEY = 'spr-assistant/model-v1'
const CONTEXT_STORAGE_KEY = 'spr-assistant/context-tokens-v1'
const TERMINAL_STORAGE_KEY = 'spr-assistant/terminal-v1'

const storedValue = (key, fallback) => {
  try {
    return window.localStorage.getItem(key) || fallback
  } catch (error) {
    return fallback
  }
}

const storedContextSizes = () => {
  try {
    return JSON.parse(window.localStorage.getItem(CONTEXT_STORAGE_KEY)) || {}
  } catch (error) {
    return {}
  }
}

const saveStoredValue = (key, value) => {
  try {
    window.localStorage.setItem(key, value)
  } catch (error) {
    // Prompt editing still works for this page when browser storage is blocked.
  }
}

const approximateTokens = (prompt) => Math.ceil(prompt.length / 4)

const messageId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const streamPreview = (stream) => ({
  thinking: String(stream?.reasoning || '').trim(),
  answer: String(stream?.text || '').replace(/<tool_call>[\s\S]*$/, '').trim()
})

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const referencedDevices = (devices, sources, texts, limit = 3) => {
  const all = Array.isArray(devices) ? devices : []
  const ids = new Set()
  const walk = (value, depth) => {
    if (!value || typeof value !== 'object' || depth > 5) return
    for (const key of ['MAC', 'WGPubKey', 'identity']) if (typeof value[key] === 'string' && value[key]) ids.add(value[key].toLowerCase())
    for (const entry of Array.isArray(value) ? value : Object.values(value)) walk(entry, depth + 1)
  }
  sources.forEach((source) => walk(source, 0))
  const idOf = (d) => [d.MAC, d.WGPubKey].filter((v) => typeof v === 'string' && v).map((v) => v.toLowerCase())
  let found = all.filter((d) => idOf(d).some((id) => ids.has(id)))
  if (!found.length) {
    const text = texts.filter(Boolean).join('\n')
    found = all.filter((d) => typeof d.Name === 'string' && d.Name.trim().length > 1 &&
      new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(d.Name.trim())}($|[^\\p{L}\\p{N}])`, 'iu').test(text))
  }
  return found.slice(0, limit).map((d) => ({ name: d.Name || d.MAC || 'Unnamed device', mac: d.MAC || '', wg: d.WGPubKey || '', ip: d.RecentIP || '',
    groups: d.Groups || [], policies: d.Policies || [], tags: d.DeviceTags || [] }))
}

const DeviceCards = ({ devices }) => {
  const navigate = useNavigate()
  return (
    <VStack space="xs" testID="assistant-device-cards">
      {devices.map((device) => (
        <Pressable
          key={device.mac || device.wg}
          accessibilityRole="link"
          accessibilityLabel={`Open device ${device.name}`}
          onPress={() => navigate(`/admin/devices/${device.mac || encodeURIComponent(device.wg)}`)}
        >
          <VStack
            space="xs"
            borderWidth={1}
            borderColor="$borderColorCardLight"
            bg="$backgroundContentLight"
            sx={{ _dark: { bg: '$backgroundContentDark', borderColor: '$borderColorCardDark' } }}
            rounded="$md"
            px="$3"
            py="$2"
          >
            <HStack space="sm" alignItems="center" justifyContent="space-between">
              <Text size="sm" bold>{device.name}</Text>
              <HStack space="xs" alignItems="center">
                <Text size="xs" color="$primary600" sx={{ _dark: { color: '$primary300' } }}>Open device</Text>
                <Icon as={ExternalLinkIcon} size="xs" color="$primary600" />
              </HStack>
            </HStack>
            <Text size="xs" color="$textLight600" sx={{ _dark: { color: '$textDark400' } }}>
              {[device.ip || 'no recent address', device.mac || 'VPN device'].join(' · ')}
            </Text>
            <Text size="xs" color="$textLight600" sx={{ _dark: { color: '$textDark400' } }}>
              {`Groups: ${device.groups.join(', ') || 'none'} · Policies: ${device.policies.join(', ') || 'none'}${device.tags.length ? ` · Tags: ${device.tags.join(', ')}` : ''}`}
            </Text>
          </VStack>
        </Pressable>
      ))}
    </VStack>
  )
}

const AlertsEmbed = () => {
  const [open, setOpen] = useState(true)
  return (
    <VStack space="xs" w="$full" testID="assistant-alerts-view">
      <Pressable onPress={() => setOpen((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text size="xs" color="$primary600" sx={{ _dark: { color: '$primary300' } }}>
          {open ? 'Hide' : 'Show'} alerts view
        </Text>
      </Pressable>
      {open ? (
        <Box h={640} w="$full" borderWidth={1} borderColor="$borderColorCardLight" sx={{ _dark: { borderColor: '$borderColorCardDark' } }} rounded="$lg" overflow="hidden">
          <Alerts embedded />
        </Box>
      ) : null}
    </VStack>
  )
}

export const ChatBubble = ({ message }) => {
  const isUser = message.role === 'user'
  const [showRaw, setShowRaw] = useState(false)
  const rawGenerations = message.rawGenerations || []
  const requests = message.requests || []

  return (
    <VStack
      alignSelf={isUser ? 'flex-end' : 'flex-start'}
      maxWidth={message.view ? '100%' : '88%'}
      w={message.view ? '$full' : undefined}
      space="xs"
    >
      {message.view && !message.note ? null : <Box
        alignSelf={isUser ? 'flex-end' : 'flex-start'}
        bg={isUser ? '$primary600' : '$backgroundCardLight'}
        sx={{
          _dark: {
            bg: isUser ? '$primary700' : '$backgroundCardDark',
            borderColor: '$borderColorCardDark'
          }
        }}
        borderWidth={isUser ? 0 : 1}
        borderColor="$borderColorCardLight"
        rounded="$lg"
        px="$4"
        py="$3"
      >
        <Text
          color={isUser ? '$textDark0' : '$textLight900'}
          sx={{
            _dark: {
              color: isUser ? '$textDark0' : '$textDark100'
            }
          }}
        >
          {message.view ? message.note : message.content}
        </Text>
      </Box>}

      {!isUser && message.view === 'alerts' ? <AlertsEmbed /> : null}
      {!isUser && message.devices?.length ? <DeviceCards devices={message.devices} /> : null}

      {!isUser && rawGenerations.length ? (
        <VStack space="xs">
          <Pressable
            onPress={() => setShowRaw((current) => !current)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showRaw }}
          >
            <Text
              size="xs"
              color="$primary600"
              sx={{ _dark: { color: '$primary300' } }}
            >
              {showRaw ? 'Hide' : 'Show'} raw generation
              {rawGenerations.length > 1
                ? `s (${rawGenerations.length})`
                : ''}
            </Text>
          </Pressable>
          {showRaw ? (
            <VStack
              space="sm"
              bg="$backgroundContentLight"
              sx={{
                _dark: {
                  bg: '$backgroundContentDark',
                  borderColor: '$borderColorCardDark'
                }
              }}
              borderWidth={1}
              borderColor="$borderColorCardLight"
              rounded="$md"
              p="$3"
            >
              {rawGenerations.map((generation, index) => (
                <VStack
                  key={`${generation.phase}-${index}`}
                  space="xs"
                >
                  <Text
                    size="xs"
                    bold
                    color="$textLight600"
                    sx={{ _dark: { color: '$textDark400' } }}
                  >
                    {generation.phase === 'action'
                      ? 'Action router'
                      : 'Natural-language response'}
                  </Text>
                  <Text
                    fontFamily="$mono"
                    size="xs"
                    color="$textLight900"
                    sx={{ _dark: { color: '$textDark100' } }}
                    selectable
                  >
                    {generation.content}
                  </Text>
                  {(generation.parsedToolCalls || []).map((call, callIndex) => (
                    <Text key={callIndex} fontFamily="$mono" size="xs" selectable>
                      {`Parsed call: ${call?.function?.name || '?'} ${typeof call?.function?.arguments === 'string' ? call.function.arguments : JSON.stringify(call?.function?.arguments ?? {})}`}
                    </Text>
                  ))}
                  {generation.error ? (
                    <Text size="xs" color="$red700" sx={{ _dark: { color: '$red300' } }} selectable>
                      {`Tool error: ${generation.error}`}
                    </Text>
                  ) : null}
                  {generation.offeredFunctions?.length ? (
                    <Text size="xs" color="$textLight600" sx={{ _dark: { color: '$textDark400' } }} selectable>
                      {`Tools offered (${generation.offeredFunctions.length}): ${generation.offeredFunctions.join(', ')}`}
                    </Text>
                  ) : null}
                </VStack>
              ))}
              <VStack space="xs">
                <Text size="xs" bold color="$textLight600" sx={{ _dark: { color: '$textDark400' } }}>
                  {`Router requests (${requests.length})`}
                </Text>
                {requests.length ? requests.map((request, requestIndex) => (
                  <Text key={requestIndex} fontFamily="$mono" size="xs" selectable>
                    {`${request.method} ${request.path} → ${request.error ? `failed: ${request.error}` : request.status} (${request.ms} ms)`}
                  </Text>
                )) : (
                  <Text size="xs" selectable>
                    No request reached the router during this turn.
                  </Text>
                )}
              </VStack>
            </VStack>
          ) : null}
        </VStack>
      ) : null}
    </VStack>
  )
}

const plainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)
const scalarList = (value) => Array.isArray(value) && value.every((v) => v === null || typeof v !== 'object')
export const changedFields = (before, after, path = '', depth = 0) => {
  if (JSON.stringify(before) === JSON.stringify(after)) return []
  const at = (key) => (path ? `${path}.${key}` : String(key))
  if (depth < 6 && plainObject(before) && plainObject(after))
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) => changedFields(before[key], after[key], at(key), depth + 1))
  if (depth < 6 && Array.isArray(before) && Array.isArray(after) && before.length === after.length && before.every(plainObject) && after.every(plainObject))
    return before.flatMap((row, index) => changedFields(row, after[index], at(row.Name || row.MAC || row.RuleName || index), depth + 1))
  if (scalarList(before ?? []) && scalarList(after ?? []) && (Array.isArray(before) || Array.isArray(after))) {
    const was = before ?? [], now = after ?? []
    return [{ path: path || 'value', added: now.filter((v) => !was.includes(v)), removed: was.filter((v) => !now.includes(v)), now }]
  }
  return [{ path: path || 'value', before, after }]
}
const show = (value) => value === undefined ? 'not set' : JSON.stringify(value)

const ChangeSummary = ({ before, after }) => {
  const [showFull, setShowFull] = useState(false)
  const rows = changedFields(before, after)
  const line = (key, color, dark, text) => (
    <Text key={key} fontFamily="$mono" size="xs" color={color} sx={{ _dark: { color: dark } }} selectable>{text}</Text>
  )
  return (
    <VStack space="sm" testID="assistant-change-summary">
      <VStack space="xs" borderWidth={1} borderColor="$borderColorCardLight" sx={{ _dark: { borderColor: '$borderColorCardDark' } }} rounded="$md" p="$3">
        <Text size="xs" bold>{`Changed fields (${rows.length})`}</Text>
        {rows.flatMap((row, index) => 'added' in row ? [
          ...row.removed.map((v, i) => line(`${index}r${i}`, '$red700', '$red300', `− ${row.path}: ${show(v)}`)),
          ...row.added.map((v, i) => line(`${index}a${i}`, '$green700', '$green300', `+ ${row.path}: ${show(v)}`)),
          line(`${index}n`, '$textLight600', '$textDark400', `  ${row.path} after: ${show(row.now)}`)
        ] : [
          line(`${index}b`, '$red700', '$red300', `− ${row.path}: ${show(row.before)}`),
          line(`${index}a`, '$green700', '$green300', `+ ${row.path}: ${show(row.after)}`)
        ])}
      </VStack>
      <Pressable onPress={() => setShowFull((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded: showFull }}>
        <Text size="xs" color="$primary600" sx={{ _dark: { color: '$primary300' } }}>
          {showFull ? 'Hide' : 'Show'} full before and after
        </Text>
      </Pressable>
      {showFull ? (
        <HStack space="md" flexWrap="wrap">
          <JsonChange prefix="−" title="Before" value={before} tone="remove" />
          <JsonChange prefix="+" title="After" value={after} tone="add" />
        </HStack>
      ) : null}
    </VStack>
  )
}

const JsonChange = ({ prefix, title, value, tone }) => {
  if (!value) return null
  const isRemove = tone === 'remove'
  return (
    <VStack flex={1} minWidth={260} space="xs">
      <Text
        size="xs"
        bold
        color={isRemove ? '$red700' : '$green700'}
        sx={{
          _dark: {
            color: isRemove ? '$red300' : '$green300'
          }
        }}
      >
        {prefix} {title}
      </Text>
      <Box
        bg={isRemove ? '$red50' : '$green50'}
        sx={{
          _dark: {
            bg: '$backgroundContentDark',
            borderColor: isRemove ? '$red800' : '$green800'
          }
        }}
        borderWidth={1}
        borderColor={isRemove ? '$red300' : '$green300'}
        rounded="$md"
        p="$3"
      >
        <Text
          fontFamily="$mono"
          size="xs"
          color="$textLight900"
          sx={{ _dark: { color: '$textDark100' } }}
          selectable
        >
          {JSON.stringify(value, null, 2)}
        </Text>
      </Box>
    </VStack>
  )
}

const ProposalReview = ({ proposal, isApplying, onAccept, onReject }) => {
  const diff = proposalDiff(proposal)
  return (
    <VStack
      space="md"
      borderWidth={1}
      borderColor="$amber400"
      bg="$amber50"
      sx={{
        _dark: {
          bg: '$backgroundCardDark',
          borderColor: '$amber700'
        }
      }}
      rounded="$lg"
      p="$4"
    >
      <HStack space="sm" alignItems="center">
        <Icon
          as={ShieldCheckIcon}
          color="$amber700"
          sx={{ _dark: { color: '$amber300' } }}
        />
        <VStack flex={1}>
          <Heading size="sm">Review change</Heading>
          <Text size="sm">
            {diff.operation.toUpperCase()} {diff.label}: {diff.reason}
          </Text>
        </VStack>
      </HStack>

      {diff.before && diff.after ? (
        <ChangeSummary before={diff.before} after={diff.after} />
      ) : (
        <HStack space="md" flexWrap="wrap">
          <JsonChange
            prefix="−"
            title="Before"
            value={diff.before}
            tone="remove"
          />
          <JsonChange prefix="+" title="After" value={diff.after} tone="add" />
        </HStack>
      )}

      <Alert action="warning" variant="outline">
        <AlertIcon as={InfoIcon} />
        <AlertText>
          No change has been applied. Accept sends the reviewed operation after
          checking that the relevant state has not changed.
        </AlertText>
      </Alert>

      <HStack space="sm" justifyContent="flex-end">
        <Button
          variant="outline"
          action="secondary"
          onPress={onReject}
          isDisabled={isApplying}
        >
          <ButtonIcon as={XIcon} />
          <ButtonText>Reject</ButtonText>
        </Button>
        <Button action="positive" onPress={onAccept} isDisabled={isApplying}>
          {isApplying ? (
            <Spinner color="$white" size="small" />
          ) : (
            <ButtonIcon as={CheckIcon} />
          )}
          <ButtonText>Accept and apply</ButtonText>
        </Button>
      </HStack>
    </VStack>
  )
}

const ModelCard = ({
  model,
  contextTokens,
  selected,
  onSelect,
  isDisabled,
  isCached,
  isLoaded
}) => (
  <Pressable
    onPress={onSelect}
    isDisabled={isDisabled}
    accessibilityRole="radio"
    accessibilityState={{ selected, disabled: isDisabled }}
  >
    <VStack
      space="xs"
      borderWidth={selected ? 2 : 1}
      borderColor={selected ? '$primary500' : '$borderColorCardLight'}
      bg={selected ? '$primary50' : '$backgroundCardLight'}
      sx={{
        _dark: {
          bg: selected ? '$primary950' : '$backgroundCardDark',
          borderColor: selected ? '$primary500' : '$borderColorCardDark'
        }
      }}
      rounded="$lg"
      p="$3"
      opacity={isDisabled ? 0.65 : 1}
    >
      <HStack alignItems="center" space="sm">
        <Icon
          as={CpuIcon}
          size="sm"
          color={selected ? '$primary600' : '$muted500'}
          sx={{
            _dark: {
              color: selected ? '$primary300' : '$muted400'
            }
          }}
        />
        <Text bold flex={1}>
          {model.name}
        </Text>
        <Text
          size="xs"
          color="$textLight500"
          sx={{ _dark: { color: '$textDark400' } }}
        >
          {model.size} · {contextLabel(contextTokens)}
        </Text>
      </HStack>
      {isLoaded || isCached ? (
        <Text
          size="xs"
          color={isLoaded ? '$green700' : '$primary600'}
          sx={{
            _dark: {
              color: isLoaded ? '$green300' : '$primary300'
            }
          }}
        >
          {isLoaded ? 'Active now' : 'Stored in this browser'}
        </Text>
      ) : null}
    </VStack>
  </Pressable>
)

const chatMemory = { origin: null, messages: null, pendingProposal: null, taskStatus: null, canContinueTask: false }
let lastAskKey = null
const AskHandoff = ({ onAsk }) => {
  const location = useLocation()
  useEffect(() => {
    const ask = location.state?.ask
    if (typeof ask !== 'string' || !ask.trim() || location.key === lastAskKey) return
    lastAskKey = location.key
    onAsk(ask.trim().slice(0, 2000))
  }, [location.key])
  return null
}
const Navigator = ({ target }) => {
  const navigate = useNavigate()
  useEffect(() => { target.current = navigate; return () => { target.current = null } }, [navigate])
  return null
}
const engineMemory = { engine: null, modelKey: null, contextTokens: null, pending: null, busy: false, page: null }
export const clearAssistantMemory = () => {
  Object.assign(chatMemory, { origin: null, messages: null, pendingProposal: null, taskStatus: null, canContinueTask: false })
  Object.assign(engineMemory, { engine: null, modelKey: null, contextTokens: null, pending: null, busy: false, page: null })
}
const remembered = () => {
  let origin = null
  try { origin = getApiURL() } catch (error) { origin = null }
  if (chatMemory.origin !== origin) { clearAssistantMemory(); chatMemory.origin = origin }
  return chatMemory
}

const Assistant = () => {
  const alertContext = React.useContext(AlertContext)
  const appContext = React.useContext(AppContext)
  const engineRef = useRef(engineMemory.engine)
  const stagedEngineRef = useRef(null)
  const isThinkingRef = useRef(engineMemory.busy)
  const autoLoadAttemptedRef = useRef(false)
  const scrollRef = useRef(null)
  const settingsScrollRef = useRef(null)
  const cancelRef = useRef(null)
  const promptCancelRef = useRef(null)

  const [preferredModelKey] = useState(
    () => getModel(storedValue(MODEL_STORAGE_KEY, DEFAULT_MODEL_KEY)).key
  )
  const [selectedModelKey, setSelectedModelKey] = useState(engineMemory.modelKey || preferredModelKey)
  const [loadedModelKey, setLoadedModelKey] = useState(engineMemory.engine ? engineMemory.modelKey : null)
  const [contextSizes, setContextSizes] = useState(storedContextSizes)
  const [loadedContextTokens, setLoadedContextTokens] = useState(engineMemory.engine ? engineMemory.contextTokens : null)
  const [showConsent, setShowConsent] = useState(false)
  const [loadState, setLoadState] = useState(engineMemory.engine ? 'ready' : 'idle')
  const [cacheState, setCacheState] = useState('checking')
  const [loadingModelKey, setLoadingModelKey] = useState(null)
  const [cachedModelKeys, setCachedModelKeys] = useState([])
  const [loadProgress, setLoadProgress] = useState({ progress: 0, text: '' })
  const [systemPrompt, setSystemPrompt] = useState(() =>
    storedValue(ACTION_PROMPT_STORAGE_KEY, SYSTEM_PROMPT)
  )
  const [chatSystemPrompt, setChatSystemPrompt] = useState(() =>
    storedValue(CHAT_PROMPT_STORAGE_KEY, CHAT_SYSTEM_PROMPT)
  )
  const [systemPromptDraft, setSystemPromptDraft] = useState(systemPrompt)
  const [chatSystemPromptDraft, setChatSystemPromptDraft] =
    useState(chatSystemPrompt)
  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [messages, setMessagesState] = useState(() => remembered().messages || [INITIAL_MESSAGE])
  const setMessages = (next) => {
    const memory = remembered()
    memory.messages = typeof next === 'function' ? next(memory.messages || [INITIAL_MESSAGE]) : next
    setMessagesState(memory.messages)
  }
  const inRouter = useInRouterContext()
  const [asked, setAsked] = useState('')
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(engineMemory.busy)
  const [terminalMode, setTerminalMode] = useState(() => storedValue(TERMINAL_STORAGE_KEY, '') !== 'off')
  const [commandBusy, setCommandBusy] = useState('')
  const navigateRef = useRef(null)
  const [cliNames, setCliNames] = useState({ devices: [], groups: [], tags: [] })
  useEffect(() => {
    if (!terminalMode) return
    let current = true
    Promise.resolve().then(() => appContext.getDevices()).then((devices) => {
      if (!current || !Array.isArray(devices)) return
      const unique = (values) => [...new Set(values.filter((value) => typeof value === 'string' && value))].sort()
      setCliNames({
        devices: unique(devices.map((device) => device.Name)),
        groups: unique(devices.flatMap((device) => device.Groups || [])),
        tags: unique(devices.flatMap((device) => device.DeviceTags || []))
      })
    }).catch(() => {})
    return () => { current = false }
  }, [terminalMode])
  const [activityText, setActivityText] = useState('')
  const [streamText, setStreamText] = useState(null)
  const through = (key, set) => (next) => {
    const memory = remembered()
    memory[key] = typeof next === 'function' ? next(memory[key]) : next
    set(memory[key])
  }
  const [pendingProposal, setPendingProposalState] = useState(() => remembered().pendingProposal)
  const setPendingProposal = through('pendingProposal', setPendingProposalState)
  const [workflow, setWorkflow] = useState(null)
  const [taskStatus, setTaskStatusState] = useState(() => remembered().taskStatus)
  const setTaskStatus = through('taskStatus', setTaskStatusState)
  const [lastAssistantError, setLastAssistantError] = useState(null)
  const [canContinueTask, setCanContinueTaskState] = useState(() => remembered().canContinueTask)
  const setCanContinueTask = through('canContinueTask', setCanContinueTaskState)
  useEffect(() => {
    const page = {
      idle: () => {
        const memory = remembered()
        isThinkingRef.current = false
        setIsThinking(false); setActivityText(''); setStreamText(null)
        setMessagesState(memory.messages || [INITIAL_MESSAGE])
        setPendingProposalState(memory.pendingProposal); setTaskStatusState(memory.taskStatus); setCanContinueTaskState(memory.canContinueTask)
      },
      adopt: () => {
        if (!engineMemory.engine) { setLoadingModelKey(null); setLoadState('idle'); return }
        engineRef.current = engineMemory.engine
        setLoadedModelKey(engineMemory.modelKey); setSelectedModelKey(engineMemory.modelKey)
        setLoadedContextTokens(engineMemory.contextTokens)
        setLoadingModelKey(null); setLoadState('ready'); setLoadProgress({ progress: 1, text: '' })
      }
    }
    engineMemory.page = page
    if (engineMemory.busy) setActivityText('Tokens-crunching...')
    if (!engineMemory.engine && engineMemory.pending) {
      autoLoadAttemptedRef.current = true
      setLoadState('loading'); setLoadingModelKey(engineMemory.pending.modelKey)
    }
    return () => { if (engineMemory.page === page) engineMemory.page = null }
  }, [])
  const [isApplying, setIsApplying] = useState(false)

  const selectedModel = useMemo(
    () => getModel(selectedModelKey),
    [selectedModelKey]
  )
  const loadedModel = loadedModelKey ? getModel(loadedModelKey) : null
  const loadingModel = loadingModelKey ? getModel(loadingModelKey) : null
  const isReady = Boolean(loadedModelKey && engineRef.current)
  const isModelTransitioning = ['loading', 'switching'].includes(loadState)
  const selectedModelIsCached = cachedModelKeys.includes(selectedModel.key)
  const contextTokensFor = (model) =>
    getContextTokens(model, contextSizes[model.key])
  const selectedContextTokens = contextTokensFor(selectedModel)
  const selectedModelIsLoaded = isReady && loadedModelKey === selectedModelKey
  const selectedModelIsCurrent =
    selectedModelIsLoaded && loadedContextTokens === selectedContextTokens
  const loadingModelIsCached =
    loadingModelKey && cachedModelKeys.includes(loadingModelKey)
  const loadPercent = Math.round((loadProgress.progress || 0) * 100)
  const loadingStatus = loadingModel
    ? `${loadingModelIsCached ? 'Loading' : 'Downloading'} ${loadingModel.name}${
        loadPercent ? ` · ${loadPercent}%` : ''
      }`
    : 'Preparing local model…'
  const promptContextTokens = loadedContextTokens || selectedContextTokens
  const promptTokenEstimate = approximateTokens(systemPromptDraft)
  const promptWindowPercent = Math.round(
    (promptTokenEstimate / promptContextTokens) * 100
  )

  useEffect(() => {
    let isCurrent = true
    Promise.all(
      MODEL_CATALOG.map(async (model) => ({
        key: model.key,
        cached: await isWebLLMModelCached(model).catch(() => false)
      }))
    )
      .then((results) => {
        if (!isCurrent) return
        setCachedModelKeys(
          results.filter(({ cached }) => cached).map(({ key }) => key)
        )
      })
      .finally(() => {
        if (isCurrent) setCacheState('checked')
      })
    return () => {
      isCurrent = false
    }
  }, [])

  const addMessage = (
    role,
    content,
    includeInContext = true,
    rawGenerations = [],
    requests = [],
    devices = [],
    view = null,
    note = '',
    tone = ''
  ) => {
    setMessages((current) => [
      ...current,
      {
        id: messageId(),
        role,
        content,
        includeInContext,
        rawGenerations,
        requests,
        devices,
        view,
        note,
        tone
      }
    ])
    setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 0)
  }

  const openPromptEditor = () => {
    setSystemPromptDraft(systemPrompt)
    setChatSystemPromptDraft(chatSystemPrompt)
    setShowPromptEditor(true)
  }

  const openModelSettings = () => {
    openPromptEditor()
    setTimeout(
      () => settingsScrollRef.current?.scrollTo?.({ y: 0, animated: true }),
      0
    )
  }

  const savePromptEditor = () => {
    const nextSystemPrompt = systemPromptDraft.trim()
    const nextChatSystemPrompt = chatSystemPromptDraft.trim()
    if (!nextSystemPrompt || !nextChatSystemPrompt) return
    setSystemPrompt(nextSystemPrompt)
    setChatSystemPrompt(nextChatSystemPrompt)
    saveStoredValue(ACTION_PROMPT_STORAGE_KEY, nextSystemPrompt)
    saveStoredValue(CHAT_PROMPT_STORAGE_KEY, nextChatSystemPrompt)
    setShowPromptEditor(false)
    addMessage(
      'assistant',
      'System prompts updated for future messages in this browser.',
      false
    )
  }

  const restoreDefaultPrompts = () => {
    setSystemPromptDraft(SYSTEM_PROMPT)
    setChatSystemPromptDraft(CHAT_SYSTEM_PROMPT)
  }

  const selectContextSize = (tokens) => {
    const next = { ...contextSizes, [selectedModelKey]: tokens }
    setContextSizes(next)
    saveStoredValue(CONTEXT_STORAGE_KEY, JSON.stringify(next))
  }

  const activateEngine = ({ engine, model, contextTokens }) => {
    const previousEngine = engineMemory.engine || engineRef.current
    engineRef.current = engine
    Object.assign(engineMemory, { engine, modelKey: model.key, contextTokens })
    setLoadedModelKey(model.key)
    setLoadedContextTokens(contextTokens)
    saveStoredValue(MODEL_STORAGE_KEY, model.key)
    setCachedModelKeys((current) => [...new Set([...current, model.key])])
    setLoadingModelKey(null)
    setLoadState('ready')
    setLoadProgress({ progress: 1, text: '' })
    if (previousEngine && previousEngine !== engine) {
      previousEngine.unload().catch(() => {})
    }
  }

  const loadModel = async (
    modelToLoad,
    contextTokens = contextTokensFor(modelToLoad)
  ) => {
    setShowConsent(false)
    setLoadState('loading')
    setLoadingModelKey(modelToLoad.key)
    setLoadProgress({
      progress: 0,
      text: cachedModelKeys.includes(modelToLoad.key)
        ? 'Reading model from browser storage…'
        : 'Checking WebGPU support…'
    })

    const pending = { modelKey: modelToLoad.key }
    engineMemory.pending = pending
    try {
      const engine = await loadWebLLM(
        modelToLoad,
        (report) => {
          setLoadProgress(report)
        },
        contextTokens
      )

      if (engineMemory.busy || isThinkingRef.current) {
        stagedEngineRef.current = { engine, model: modelToLoad, contextTokens }
        setLoadState('switching')
        setLoadProgress({
          progress: 1,
          text: `Download complete. Switching after the current ${loadedModel?.name || 'model'} response…`
        })
      } else {
        activateEngine({ engine, model: modelToLoad, contextTokens })
      }
    } catch (error) {
      setLastAssistantError(error?.message || String(error))
      setLoadingModelKey(null)
      setLoadState(engineRef.current ? 'ready' : 'error')
      alertContext.error(
        'Could not load local model',
        error?.message || String(error)
      )
    } finally {
      if (engineMemory.pending === pending) engineMemory.pending = null
      engineMemory.page?.adopt()
    }
  }

  const loadSelectedModel = () => loadModel(selectedModel)

  useEffect(() => {
    if (
      autoLoadAttemptedRef.current ||
      isReady ||
      isModelTransitioning ||
      !cachedModelKeys.includes(preferredModelKey)
    ) {
      return
    }

    autoLoadAttemptedRef.current = true
    setSelectedModelKey(preferredModelKey)
    loadModel(getModel(preferredModelKey))
  }, [cachedModelKeys])

  const sendMessage = async (textOverride, { note = '' } = {}) => {
    const userText = (typeof textOverride === 'string' ? textOverride : input).trim()
    if (!userText || !isReady || isThinking || engineMemory.busy || isApplying) return
    if (pendingProposal) {
      discardUIOperation(pendingProposal)
      setPendingProposal(null)
      setTaskStatus(taskReceipt('cancelled', 'Previous proposal discarded. No changes were made.', { applied: false }))
    }
    const modelUserText = loadedModel?.promptSuffix
      ? `${userText}\n${loadedModel.promptSuffix}`
      : userText

    const history = messages
      .filter((message) => message.includeInContext !== false)
      .map(({ role, content }) => ({ role, content }))
    setInput('')
    addMessage('user', userText)
    if (note) addMessage('assistant', note, false)
    isThinkingRef.current = true
    engineMemory.busy = true
    setIsThinking(true)
    setActivityText('Thinking locally…')
    setWorkflow(null)
    setCanContinueTask(false)

    const operationContext = {
      isPlusDisabled: appContext.isFeaturesInitialized ? appContext.isPlusDisabled : undefined,
      ui: { assistantState: () => ({ modelId: loadedModelKey, contextWindow: loadedContextTokens, loadStatus: loadState, lastError: lastAssistantError }) }
    }

    const streamingEngine = engineRef.current
    let lastStreamPaint = 0
    if (streamingEngine) {
      streamingEngine.onStream = (stream) => {
        const now = Date.now()
        if (now - lastStreamPaint < 60) return
        lastStreamPaint = now
        setStreamText(stream)
        scrollRef.current?.scrollToEnd?.({ animated: false })
      }
    }
    const requests = []
    setApiRequestObserver((request) => requests.push(request))
    setApiReadCache(true)
    const cardsFor = async (sources, texts) => {
      try { return referencedDevices(await appContext.getDevices(), sources, [userText]) } catch (error) { return [] }
    }
    try {
      const response = await runUIAssistantTurn({
        taskMode: true,
        engine: engineRef.current,
        history,
        userText: modelUserText,
        readLegacy: executeReadTool,
        context: operationContext,
        onActivity: setActivityText,
        systemPrompt,
        chatSystemPrompt
      })

      if (response.kind === 'proposal') {
        const preparedProposal = response.preparedProposal || await prepareProposal(response.proposal, operationContext)
        setPendingProposal(preparedProposal.noChange ? null : preparedProposal)
        setTaskStatus(receiptForReview(preparedProposal))
        if (preparedProposal.noChange) setCanContinueTask(true)
        addMessage(
          'assistant',
          preparedProposal.noChange ? preparedProposal.summary : 'I prepared a configuration change. Review the exact before/after values below.',
          true,
          response.rawGenerations,
          requests,
          await cardsFor([preparedProposal.before, preparedProposal.after], [])
        )
      } else if (response.kind === 'ui_workflow') {
        const page = setupPage(response.workflow.operation)
        if (page) {
          setWorkflow({ id: response.workflow.id, operation: response.workflow.operation, label: page.title, route: page.route })
          setTaskStatus(taskReceipt('awaiting_secure_input', `Finish this on the ${page.title} page. No configuration change has been sent.`, { applied: false }))
          addMessage('assistant', `This is set up on the ${page.title} page. ${page.hint}`, true, response.rawGenerations, requests)
        } else {
          setWorkflow(response.workflow)
          setTaskStatus(taskReceipt('awaiting_secure_input', 'Complete the setup form. No configuration change has been sent.', { applied: false }))
          addMessage('assistant', response.workflow.instructions, true, response.rawGenerations, requests)
        }
      } else {
        if (response.receipt) setTaskStatus(response.receipt)
        addMessage(
          'assistant',
          response.message,
          true,
          response.rawGenerations,
          requests,
          await cardsFor([response.observations?.facts?.device], [response.message]),
          response.observations?.facts?.view === 'alerts' ? 'alerts' : null,
          response.observations?.facts?.viewNote || ''
        )
      }
    } catch (error) {
      setLastAssistantError(error?.message || String(error))
      if (error.rawGenerations?.length) {
        addMessage(
          'assistant',
          error.assistantFailure === 'read_failed'
            ? 'I couldn’t read the information needed to answer this request. No configuration changes were sent. The error details are available below.'
            : 'I couldn’t complete this request with the available tools. No configuration changes were sent. The error details are available below.',
          false,
          error.rawGenerations,
          requests
        )
      } else {
        addMessage(
          'assistant',
          `The local model could not answer: ${error?.message || String(error)}`,
          false
        )
      }
      alertContext.error(
        'Ask SPR error',
        error?.message || String(error)
      )
    } finally {
      setApiRequestObserver(null)
      setApiReadCache(false)
      if (streamingEngine) streamingEngine.onStream = null
      setStreamText(null)
      isThinkingRef.current = false
      engineMemory.busy = false
      setIsThinking(false)
      setActivityText('')
      if (stagedEngineRef.current) {
        const staged = stagedEngineRef.current
        stagedEngineRef.current = null
        activateEngine(staged)
      }
      engineMemory.page?.idle()
    }
  }

  const commandContext = () => ({ isPlusDisabled: appContext.isFeaturesInitialized ? appContext.isPlusDisabled : undefined })
  const say = (text, tone = '', requests = [], cards = [], view = null, note = '') => addMessage('assistant', text, false, [], requests, cards, view, note, tone)
  const submitLine = async (line) => {
    if (isThinking || isApplying || commandBusy) return
    if (pendingProposal && /^(y|yes)$/i.test(line)) { addMessage('user', line, false); return acceptProposal() }
    if (pendingProposal && /^(n|no)$/i.test(line)) { addMessage('user', line, false); return rejectProposal() }
    const parsed = parseCli(line)
    if (parsed.kind === 'empty') return
    const askAgent = (text, note) => {
      if (isReady) return sendMessage(text, { note })
      addMessage('user', line, false)
      say('No model is loaded, so only commands work right now. Type help for the list, or load a model in Settings to ask questions and make changes.', 'error')
    }
    if (parsed.kind === 'ask') return askAgent(parsed.text)
    if (parsed.kind === 'session' && parsed.name === 'clear') return resetChat()
    if (parsed.kind === 'session' && parsed.name === 'chat') return toggleTerminal()
    const filtered = (text) => applyPipes(text, parsed.pipes)
    if (parsed.kind === 'help') { addMessage('user', line, false); return say(filtered(parsed.topic ? helpFor(parsed.topic) : helpText())) }
    if (parsed.kind === 'error') { addMessage('user', line, false); return say(parsed.message, 'error') }
    if (parsed.kind === 'session') {
      addMessage('user', line, false)
      if (parsed.name === 'history') return say(filtered(cliHistory.map((entry, index) => `${String(index + 1).padStart(4)}  ${entry}`).join('\n')))
      if (parsed.name === 'ops') return say(filtered(operationsText(parsed.args[0] || '')))
      if (parsed.name === 'describe') return say(describeOperation(parsed.args[0]) || `No read operation ${parsed.args[0]}. ops lists them.`, describeOperation(parsed.args[0]) ? '' : 'error')
      if (parsed.name === 'model') return say(filtered([
        `model     ${isReady ? loadedModel.name : 'none loaded'}`,
        `state     ${isReady ? 'ready' : isModelTransitioning ? loadingStatus : 'not loaded (commands still work)'}`,
        ...(isReady ? [`context   ${loadedContextTokens} tokens`] : []),
        `router    ${getApiURL()}`
      ].join('\n')))
      if (parsed.name === 'requests') {
        const last = [...messages].reverse().find((message) => message.requests?.length)
        return say(last ? filtered(last.requests.map((request) => `${request.method} ${request.path} → ${request.error ? `failed: ${request.error}` : request.status} (${request.ms} ms)`).join('\n')) : 'No router requests have been made yet.')
      }
      return
    }
    if (parsed.kind === 'open') {
      const page = PAGES[parsed.target.toLowerCase()]
      let route = page
      if (!route) {
        try {
          const found = referencedDevices(await appContext.getDevices(), [parsed.target], [])
          if (found.length === 1 && found[0].MAC) route = `/admin/devices/${found[0].MAC}`
        } catch (error) { route = null }
      }
      if (!route) return askAgent(line, `${parsed.target} is not a page or a device; asking in plain words instead.`)
      addMessage('user', line, false)
      if (!navigateRef.current) return say('Pages cannot be opened from here.', 'error')
      say(`Opening ${route}`)
      return navigateRef.current(route)
    }
    if (parsed.kind === 'setup') {
      addMessage('user', line, false)
      const page = setupPage(parsed.id)
      if (!page) return say('This step has no page to open.', 'error')
      if (!navigateRef.current) return say(`Open ${page.title} to do this. ${page.hint}`)
      say(`Opening ${page.title}. ${page.hint}${Object.keys(parsed.input).length ? ' Values typed here are not carried over; enter them on the page.' : ''}`)
      return navigateRef.current(page.route)
    }

    const requests = []
    setCommandBusy(parsed.command)
    setApiRequestObserver((request) => requests.push(request))
    setApiReadCache(true)
    let handOver = null
    try {
      if (parsed.kind === 'change') {
        if (pendingProposal) { discardUIOperation(pendingProposal); setPendingProposal(null) }
        setWorkflow(null); setCanContinueTask(false)
        const review = await prepareProposal({ proposalType: 'ui_operation', operationId: parsed.id, input: parsed.input, reason: 'Typed as a command' }, commandContext())
        addMessage('user', line, false)
        setPendingProposal(review.noChange ? null : review)
        setTaskStatus(receiptForReview(review))
        let cards = []
        try { cards = referencedDevices(await appContext.getDevices(), [review.before, review.after], [line]) } catch (error) { cards = [] }
        say(review.noChange ? review.summary : 'Prepared a change. Nothing has been applied.', '', requests, cards)
      } else if (parsed.kind === 'many') {
        addMessage('user', line, false)
        const parts = []
        for (const read of parsed.reads) {
          try { parts.push(`${read.title}\n${(await runCliRead({ kind: 'read', ...read }, commandContext())).message}`) }
          catch (error) { parts.push(`${read.title}\ncould not be read: ${error?.message || String(error)}`) }
        }
        say(filtered(parts.join('\n\n')), '', requests)
      } else {
        const { message, data } = await runCliRead(parsed, commandContext())
        addMessage('user', line, false)
        let cards = []
        try { cards = referencedDevices(await appContext.getDevices(), [data.facts?.device], [line]) } catch (error) { cards = [] }
        const view = !parsed.pipes?.length && data.facts?.view === 'alerts' ? 'alerts' : null
        say(filtered(message), '', requests, cards, view, view ? data.facts?.viewNote || '' : '')
      }
    } catch (error) {
      if (parsed.everyday && isReady) handOver = `${error?.message || String(error)} Asking in plain words instead.`
      else { addMessage('user', line, false); say(error?.message || String(error), 'error', requests) }
    } finally {
      setApiRequestObserver(null)
      setApiReadCache(false)
      setCommandBusy('')
    }
    if (handOver) return askAgent(line, handOver)
  }

  const toggleTerminal = () => {
    const next = !terminalMode
    setTerminalMode(next)
    saveStoredValue(TERMINAL_STORAGE_KEY, next ? 'on' : 'off')
  }

  useEffect(() => {
    if (!asked || !isReady || isThinking || isApplying || engineMemory.busy) return
    setAsked('')
    sendMessage(asked)
  }, [asked, isReady, isThinking, isApplying])

  const acceptProposal = async () => {
    if (!pendingProposal || isApplying) return
    setIsApplying(true)
    try {
      const applied = await applyProposal(pendingProposal, {
        isPlusDisabled: appContext.isFeaturesInitialized ? appContext.isPlusDisabled : undefined,
        ui: { assistantState: () => ({ modelId: loadedModelKey, contextWindow: loadedContextTokens, loadStatus: loadState, lastError: lastAssistantError }) }
      })
      setPendingProposal(null)
      const receipt = applied.proposalType === 'ui_operation' ? receiptForApplied(applied) : taskReceipt('outcome_unknown', 'The request was sent; its final effect has not been verified.', { applied: true })
      setTaskStatus(receipt)
      addMessage(
        'assistant',
        receipt.summary
      )
      setCanContinueTask(true)
      if (applied.verification?.verified === false) {
        alertContext.error('Verification did not confirm the change', applied.verification.summary)
      } else {
        alertContext.success(applied.proposalType === 'ui_operation' && applied.verification?.verified !== true ? 'Request accepted; verification remains incomplete' : 'Change applied and verified')
      }
    } catch (error) {
      discardUIOperation(pendingProposal)
      setPendingProposal(null)
      setCanContinueTask(true)
      setTaskStatus(taskReceipt(error.operationMayHaveApplied ? 'outcome_unknown' : 'needs_review', error.operationMayHaveApplied
        ? 'The operation outcome is uncertain. Read current state before retrying.' : 'The operation was not sent. Prepare a fresh review.', { applied: error.operationMayHaveApplied ? null : false }))
      addMessage('assistant', error.operationMayHaveApplied
        ? `The operation's outcome is uncertain: ${error?.message || String(error)}. Read current state before preparing another change.`
        : `The operation was not sent: ${error?.message || String(error)}. Prepare a fresh review before continuing.`)
      alertContext.error(
        error.operationMayHaveApplied ? 'Operation outcome is uncertain' : 'A fresh review is required',
        error?.message || String(error)
      )
    } finally {
      setIsApplying(false)
    }
  }

  const rejectProposal = () => {
    discardUIOperation(pendingProposal)
    setPendingProposal(null)
    setTaskStatus(taskReceipt('cancelled', 'No changes were made.', { applied: false }))
    addMessage('assistant', 'No changes were made.')
  }

  const resetChat = async () => {
    discardUIOperation(pendingProposal)
    setMessages([INITIAL_MESSAGE])
    setPendingProposal(null)
    setWorkflow(null)
    setTaskStatus(null)
    setCanContinueTask(false)
    setInput('')
    if (engineRef.current) {
      await engineRef.current.resetChat().catch(() => {})
    }
  }

  const turnExtras = (
    <>
              {pendingProposal ? (
                <ProposalReview
                  proposal={pendingProposal}
                  isApplying={isApplying}
                  onAccept={acceptProposal}
                  onReject={rejectProposal}
                />
              ) : null}
              {taskStatus && !(terminalMode && messages[messages.length - 1]?.content === taskStatus.summary) ? <VStack space="xs" p="$3" testID="assistant-task-status">
                <Text bold>Task status: {taskStatus.status.replaceAll('_', ' ')}</Text>
                <Text>{taskStatus.summary}</Text>
                {taskStatus.steps?.map((step, i) => <Text key={i}>{step.step}: {step.status.replaceAll('_', ' ')}</Text>)}
              </VStack> : null}
              {workflow?.managed ? <TaskWorkflowPanel key={workflow.id} workflow={workflow}
                context={{ isPlusDisabled: appContext.isFeaturesInitialized ? appContext.isPlusDisabled : undefined }}
                onReceipt={receipt => { setTaskStatus(receipt); addMessage('assistant', receipt.summary) }}
                onClose={() => setWorkflow(null)} /> : workflow ? (
                <Button
                  variant="outline"
                  onPress={() => workflow.route === '/admin/assistant'
                    ? openPromptEditor()
                    : window.open(workflow.route, '_blank', 'noopener,noreferrer')}
                  accessibilityLabel={`Open ${workflow.label}`}
                >
                  <ButtonIcon as={ExternalLinkIcon} />
                  <ButtonText>Open {workflow.label}</ButtonText>
                </Button>
              ) : null}
              {canContinueTask && !pendingProposal ? (
                <Button variant="outline" isDisabled={isThinking || !isReady}
                  onPress={() => sendMessage('Continue the original task from the reported result. If it is complete, summarize; otherwise inspect current state and prepare the next needed step.')}>
                  <ButtonText>Continue task</ButtonText>
                </Button>
              ) : null}
    </>
  )

  return (
    <ScrollView
      flex={1}
      bg="$backgroundContentLight"
      sx={{ _dark: { bg: '$backgroundContentDark' } }}
      contentContainerStyle={{ minHeight: '100%', paddingBottom: 48 }}
      testID="assistant-page"
    >
      {inRouter ? <AskHandoff onAsk={(text) => { setAsked(text); setInput(text) }} /> : null}
      {inRouter ? <Navigator target={navigateRef} /> : null}
      <VStack space="lg">
        <HStack
          alignItems="center"
          justifyContent="space-between"
          space="md"
          flexWrap="wrap"
        >
          <HStack alignItems="center" space="md">
            <Box
              bg="$primary100"
              sx={{ _dark: { bg: '$primary900' } }}
              rounded="$full"
              p="$3"
            >
              <Icon
                as={MessageCircleIcon}
                color="$primary700"
                sx={{ _dark: { color: '$primary200' } }}
                size="xl"
              />
            </Box>
            <VStack>
              <Heading size="xl">Ask SPR</Heading>
              <Text
                color="$textLight600"
                sx={{ _dark: { color: '$textDark400' } }}
              >
                Browser-local chat
              </Text>
            </VStack>
          </HStack>
          <HStack space="md">
            <Button
              variant="outline"
              action="secondary"
              onPress={toggleTerminal}
              px="$5"
              accessibilityLabel={terminalMode ? 'Switch to chat view' : 'Switch to terminal view'}
            >
              <ButtonText>{terminalMode ? 'Chat' : 'Terminal'}</ButtonText>
              <ButtonIcon as={terminalMode ? MessageCircleIcon : SquareTerminalIcon} ml="$3" />
            </Button>
            <Button
              variant="outline"
              action="secondary"
              onPress={openPromptEditor}
              px="$5"
            >
              <ButtonText>Settings</ButtonText>
              <ButtonIcon as={Settings2Icon} ml="$3" />
            </Button>
            <Button
              variant="outline"
              action="secondary"
              onPress={resetChat}
              px="$5"
            >
              <ButtonText>New chat</ButtonText>
              <ButtonIcon as={RotateCcwIcon} ml="$3" />
            </Button>
          </HStack>
        </HStack>

        <HStack
          alignItems="stretch"
          flexDirection="column"
        >
          {terminalMode ? (
            <TerminalPane
              messages={messages}
              status={{
                state: isReady ? 'ready' : isModelTransitioning || cacheState === 'checking' ? 'loading' : 'none',
                text: isReady ? `${loadedModel.name} ready` : isModelTransitioning ? loadingStatus : cacheState === 'checking' ? 'checking for a stored model' : 'no model: commands only'
              }}
              headerAction={!isReady && !isModelTransitioning && cacheState !== 'checking' ? {
                label: selectedModelIsCached ? 'load stored model' : 'download a model',
                onPress: () => setShowConsent(true)
              } : null}
              busyText={isThinking ? activityText || 'Thinking locally…' : commandBusy}
              stream={isThinking ? streamPreview(streamText) : null}
              hint={pendingProposal ? 'Review the change above. Type y to apply, n to discard, or a correction to replace it.' : ''}
              disabled={isThinking || isApplying || Boolean(commandBusy)}
              onSubmit={submitLine}
              complete={(text) => completeCli(text, cliNames)}
              banner={'Type a command, or just ask in plain words. Type help for a command list'}
              renderExtras={(message) => (
                <>
                  {message.view === 'alerts' ? <AlertsEmbed /> : null}
                  {message.devices?.length ? <DeviceCards devices={message.devices} /> : null}
                </>
              )}
            >
              {turnExtras}
            </TerminalPane>
          ) : (
          <VStack
            flex={1}
            minHeight={560}
            borderWidth={1}
            borderColor="$borderColorCardLight"
            sx={{
              _dark: {
                bg: '$backgroundCardDark',
                borderColor: '$borderColorCardDark'
              }
            }}
            rounded="$xl"
            overflow="hidden"
            bg="$backgroundCardLight"
          >
            <HStack
              px="$4"
              py="$3"
              borderBottomWidth={1}
              borderColor="$borderColorCardLight"
              sx={{ _dark: { borderColor: '$borderColorCardDark' } }}
              alignItems="center"
              space="sm"
            >
              <Icon
                as={isReady ? CheckIcon : CpuIcon}
                color={isReady ? '$green600' : '$muted500'}
                size="sm"
              />
              {isReady ? (
                <Text bold flex={1}>
                  {loadedModel.name} ready
                </Text>
              ) : isModelTransitioning ? (
                <HStack flex={1} space="sm" alignItems="center">
                  <Spinner size="small" />
                  <Text bold>{loadingStatus}</Text>
                </HStack>
              ) : cacheState === 'checking' ? (
                <HStack flex={1} space="sm" alignItems="center">
                  <Spinner size="small" />
                  <Text bold>Checking for a stored model…</Text>
                </HStack>
              ) : (
                <Pressable
                  flex={1}
                  onPress={openModelSettings}
                  accessibilityRole="link"
                  accessibilityLabel="Load a model to begin"
                >
                  <Text
                    bold
                    color="$primary600"
                    sx={{ _dark: { color: '$primary300' } }}
                    underline
                  >
                    Load a model to begin
                  </Text>
                </Pressable>
              )}
              {isReady && isModelTransitioning ? (
                <HStack space="xs" alignItems="center">
                  <Spinner size="small" />
                  <Text
                    size="xs"
                    color="$textLight500"
                    sx={{ _dark: { color: '$textDark400' } }}
                  >
                    {loadingStatus}
                  </Text>
                </HStack>
              ) : isThinking ? (
                <HStack space="xs" alignItems="center">
                  <Spinner size="small" />
                  <Text
                    size="xs"
                    color="$textLight500"
                    sx={{ _dark: { color: '$textDark400' } }}
                  >
                    {activityText || 'Thinking locally…'}
                  </Text>
                </HStack>
              ) : null}
            </HStack>

            <ScrollView
              ref={scrollRef}
              flex={1}
              p="$4"
              contentContainerStyle={{ gap: 12 }}
            >
              {messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
              {isThinking && (streamPreview(streamText).thinking || streamPreview(streamText).answer) ? (
                <VStack alignSelf="flex-start" maxWidth="88%" space="xs" testID="assistant-stream">
                  {streamPreview(streamText).thinking ? (
                    <Text size="xs" italic color="$textLight500" sx={{ _dark: { color: '$textDark400' } }}>
                      {streamPreview(streamText).thinking}
                    </Text>
                  ) : null}
                  {streamPreview(streamText).answer ? (
                    <Text size="sm" color="$textLight900" sx={{ _dark: { color: '$textDark100' } }}>
                      {streamPreview(streamText).answer}
                    </Text>
                  ) : null}
                </VStack>
              ) : null}
              {turnExtras}
            </ScrollView>

            <VStack
              p="$4"
              space="sm"
              borderTopWidth={1}
              borderColor="$borderColorCardLight"
              sx={{ _dark: { borderColor: '$borderColorCardDark' } }}
            >
              {pendingProposal ? (
                <Text
                  size="xs"
                  color="$amber700"
                  sx={{ _dark: { color: '$amber300' } }}
                >
                  Review this change, or send a correction to replace it.
                </Text>
              ) : null}
              <HStack alignItems="flex-end" space="sm">
                <Textarea
                  flex={1}
                  minHeight={72}
                  isDisabled={!isReady || isThinking || isApplying}
                  bg="$backgroundContentLight"
                  borderColor="$borderColorCardLight"
                  sx={{
                    _dark: {
                      bg: '$backgroundContentDark',
                      borderColor: '$borderColorCardDark'
                    }
                  }}
                >
                  <TextareaInput
                    value={input}
                    onChangeText={setInput}
                    onKeyPress={(event) => {
                      const native = event.nativeEvent || event
                      if (native.key !== 'Enter' || native.shiftKey || native.isComposing) return
                      event.preventDefault?.()
                      sendMessage()
                    }}
                    placeholder={
                      isReady
                        ? 'Ask about your SPR network or settings…'
                        : 'Load a local model first'
                    }
                    aria-label="Message Ask SPR"
                  />
                </Textarea>
                <Button
                  onPress={sendMessage}
                  isDisabled={
                    !input.trim() || !isReady || isThinking || isApplying
                  }
                  h={72}
                  px="$4"
                >
                  <ButtonIcon as={SendIcon} />
                  <ButtonText
                    sx={{
                      '@base': { display: 'none' },
                      '@md': { display: 'flex' }
                    }}
                  >
                    Send
                  </ButtonText>
                </Button>
              </HStack>
            </VStack>
          </VStack>
          )}
        </HStack>
      </VStack>

      <AlertDialog
        isOpen={showConsent}
        onClose={() => setShowConsent(false)}
        leastDestructiveRef={cancelRef}
      >
        <AlertDialogBackdrop />
        <AlertDialogContent
          bg="$backgroundCardLight"
          borderColor="$borderColorCardLight"
          sx={{
            _dark: {
              bg: '$backgroundCardDark',
              borderColor: '$borderColorCardDark'
            }
          }}
        >
          <AlertDialogHeader>
            <Heading size="lg">
              {selectedModelIsCached
                ? `Load stored ${selectedModel.name}?`
                : `Load ${selectedModel.name}?`}
            </Heading>
            <AlertDialogCloseButton aria-label="Close model download dialog">
              <Icon as={CloseIcon} />
            </AlertDialogCloseButton>
          </AlertDialogHeader>
          <AlertDialogBody>
            <VStack space="md">
              {selectedModelIsCached ? (
                <Text>
                  {selectedModel.name} is already stored in this browser.
                  Loading initializes it for WebGPU inference; the model
                  weights should not be downloaded again.
                </Text>
              ) : (
                <Text>
                  This downloads {selectedModel.size} from Hugging Face into
                  this browser&apos;s persistent storage. The model is not
                  downloaded to or stored in the SPR repository.
                </Text>
              )}
              <Text size="sm">
                Browser storage may keep the model for later sessions until you
                clear this site&apos;s data.
              </Text>
              {loadedModel && loadedModel.key !== selectedModel.key ? (
                <Text size="sm">
                  You can keep chatting with {loadedModel.name} during the
                  download. Ask SPR switches to {selectedModel.name} only
                  after it is ready and the current response, if any, finishes.
                </Text>
              ) : null}
            </VStack>
          </AlertDialogBody>
          <AlertDialogFooter>
            <HStack space="sm">
              <Button
                ref={cancelRef}
                variant="outline"
                action="secondary"
                onPress={() => setShowConsent(false)}
              >
                <ButtonText>Cancel</ButtonText>
              </Button>
              <Button onPress={loadSelectedModel}>
                <ButtonIcon as={DownloadIcon} />
                <ButtonText>
                  {selectedModelIsCached
                    ? 'Load from browser storage'
                    : loadedModel
                      ? 'Download in background'
                      : 'Download and load'}
                </ButtonText>
              </Button>
            </HStack>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        isOpen={showPromptEditor}
        onClose={() => setShowPromptEditor(false)}
        leastDestructiveRef={promptCancelRef}
      >
        <AlertDialogBackdrop />
        <AlertDialogContent
          maxWidth={760}
          width="92%"
          bg="$backgroundCardLight"
          borderColor="$borderColorCardLight"
          sx={{
            _dark: {
              bg: '$backgroundCardDark',
              borderColor: '$borderColorCardDark'
            }
          }}
        >
          <AlertDialogHeader>
            <Heading size="lg">Ask SPR settings</Heading>
            <AlertDialogCloseButton aria-label="Close system prompt editor">
              <Icon as={CloseIcon} />
            </AlertDialogCloseButton>
          </AlertDialogHeader>
          <AlertDialogBody>
            <ScrollView ref={settingsScrollRef} maxHeight={640}>
              <VStack space="lg" pr="$2">
                <VStack
                  space="md"
                  nativeID="assistant-model-settings"
                  testID="assistant-model-settings"
                >
                  <Heading size="md">Select model</Heading>

                  {MODEL_CATALOG.map((model) => (
                    <ModelCard
                      key={model.key}
                      model={model}
                      contextTokens={contextTokensFor(model)}
                      selected={selectedModelKey === model.key}
                      onSelect={() => setSelectedModelKey(model.key)}
                      isDisabled={isModelTransitioning}
                      isCached={cachedModelKeys.includes(model.key)}
                      isLoaded={loadedModelKey === model.key}
                    />
                  ))}

                  <Pressable
                    onPress={() =>
                      window.open(
                        selectedModel.sourceURL,
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                  >
                    <HStack space="xs" alignItems="center">
                      <Text
                        size="xs"
                        color="$primary600"
                        sx={{ _dark: { color: '$primary300' } }}
                        underline
                      >
                        View model artifact
                      </Text>
                      <Icon
                        as={ExternalLinkIcon}
                        size="xs"
                        color="$primary600"
                        sx={{ _dark: { color: '$primary300' } }}
                      />
                    </HStack>
                  </Pressable>

                  <VStack space="xs">
                    <Text size="sm" bold>
                      Context size
                    </Text>
                    <HStack space="sm" flexWrap="wrap">
                      {selectedModel.contextSizes.map((tokens) => {
                        const isSelected = tokens === selectedContextTokens
                        return (
                          <Button
                            key={tokens}
                            size="xs"
                            variant={isSelected ? 'solid' : 'outline'}
                            action={isSelected ? 'primary' : 'secondary'}
                            onPress={() => selectContextSize(tokens)}
                            isDisabled={isModelTransitioning}
                            role="radio"
                            accessibilityState={{ selected: isSelected }}
                            accessibilityLabel={contextLabel(tokens)}
                          >
                            <ButtonText>{`${tokens / 1024}K`}</ButtonText>
                          </Button>
                        )
                      })}
                    </HStack>
                  </VStack>

                  {isModelTransitioning ? (
                    <VStack space="xs">
                      <Progress
                        value={Math.round(
                          (loadProgress.progress || 0) * 100
                        )}
                        size="sm"
                      >
                        <ProgressFilledTrack />
                      </Progress>
                      <Text
                        size="xs"
                        color="$textLight600"
                        sx={{ _dark: { color: '$textDark400' } }}
                      >
                        {loadProgress.text || 'Loading model…'}
                      </Text>
                      {loadedModel && loadingModel ? (
                        <Text
                          size="xs"
                          color="$green700"
                          sx={{ _dark: { color: '$green300' } }}
                        >
                          Chat remains available with {loadedModel.name} while{' '}
                          {loadingModel.name}{' '}
                          {cachedModelKeys.includes(loadingModel.key)
                            ? 'loads from browser storage.'
                            : 'downloads.'}
                        </Text>
                      ) : null}
                    </VStack>
                  ) : null}

                  <Button
                    onPress={() => {
                      setShowPromptEditor(false)
                      setShowConsent(true)
                    }}
                    isDisabled={isModelTransitioning || selectedModelIsCurrent}
                  >
                    <ButtonText>
                      {selectedModelIsCurrent
                        ? 'Model loaded'
                        : selectedModelIsLoaded
                          ? 'Reload with new context size'
                          : selectedModelIsCached
                            ? 'Load stored model'
                            : loadedModel
                              ? 'Review model switch'
                              : 'Review download'}
                    </ButtonText>
                    <ButtonIcon as={DownloadIcon} ml="$2" />
                  </Button>

                  {loadedModel ? (
                    <HStack space="xs" alignItems="center">
                      <Icon as={CheckIcon} size="xs" color="$green600" />
                      <Text
                        size="xs"
                        color="$green700"
                        sx={{ _dark: { color: '$green300' } }}
                      >
                        Chat is using {loadedModel.name} with{' '}
                        {contextLabel(loadedContextTokens)}
                      </Text>
                    </HStack>
                  ) : null}
                </VStack>

              <VStack space="xs">
                <HStack justifyContent="space-between" flexWrap="wrap">
                  <Text size="sm" bold>
                    Action and API prompt
                  </Text>
                  <Text
                    size="xs"
                    color="$textLight600"
                    sx={{ _dark: { color: '$textDark400' } }}
                  >
                    ~{promptTokenEstimate} tokens · ~{promptWindowPercent}% of{' '}
                    {promptContextTokens.toLocaleString()}
                  </Text>
                </HStack>
                <Textarea
                  minHeight={280}
                  bg="$backgroundContentLight"
                  borderColor="$borderColorCardLight"
                  sx={{
                    _dark: {
                      bg: '$backgroundContentDark',
                      borderColor: '$borderColorCardDark'
                    }
                  }}
                >
                  <TextareaInput
                    value={systemPromptDraft}
                    onChangeText={setSystemPromptDraft}
                    aria-label="Action and API system prompt"
                  />
                </Textarea>
              </VStack>

              <VStack space="xs">
                <Text size="sm" bold>
                  Natural-language response prompt
                </Text>
                <Text
                  size="xs"
                  color="$textLight600"
                  sx={{ _dark: { color: '$textDark400' } }}
                >
                  Used when Ask SPR answers normally or explains an API
                  result.
                </Text>
                <Textarea
                  minHeight={220}
                  bg="$backgroundContentLight"
                  borderColor="$borderColorCardLight"
                  sx={{
                    _dark: {
                      bg: '$backgroundContentDark',
                      borderColor: '$borderColorCardDark'
                    }
                  }}
                >
                  <TextareaInput
                    value={chatSystemPromptDraft}
                    onChangeText={setChatSystemPromptDraft}
                    aria-label="Natural-language response system prompt"
                  />
                </Textarea>
              </VStack>
              </VStack>
            </ScrollView>
          </AlertDialogBody>
          <AlertDialogFooter>
            <HStack space="sm" flexWrap="wrap" justifyContent="flex-end">
              <Button
                variant="outline"
                action="secondary"
                onPress={restoreDefaultPrompts}
              >
                <ButtonText>Restore defaults</ButtonText>
              </Button>
              <Button
                ref={promptCancelRef}
                variant="outline"
                action="secondary"
                onPress={() => setShowPromptEditor(false)}
              >
                <ButtonText>Cancel</ButtonText>
              </Button>
              <Button
                onPress={savePromptEditor}
                isDisabled={
                  !systemPromptDraft.trim() || !chatSystemPromptDraft.trim()
                }
              >
                <ButtonText>Save prompts</ButtonText>
              </Button>
            </HStack>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollView>
  )
}

export default Assistant
