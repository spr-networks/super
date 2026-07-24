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
  XIcon
} from 'lucide-react-native'

import { AlertContext } from 'AppContext'
import {
  applyProposal,
  executeReadTool,
  prepareProposal,
  proposalDiff
} from 'components/Assistant/assistantTools'
import { runAssistantTurn } from 'components/Assistant/assistantAgent'
import {
  CHAT_SYSTEM_PROMPT,
  SYSTEM_PROMPT
} from 'components/Assistant/assistantPrompt'
import {
  getModel,
  isWebLLMModelCached,
  loadWebLLM,
  MODEL_CATALOG
} from 'components/Assistant/webllmModels.web'

const INITIAL_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  includeInContext: false,
  content: 'Ask about devices or firewall rules.'
}

const ACTION_PROMPT_STORAGE_KEY = 'spr-assistant/action-system-prompt-v2'
const CHAT_PROMPT_STORAGE_KEY = 'spr-assistant/chat-system-prompt-v2'

const storedPrompt = (key, fallback) => {
  try {
    return window.localStorage.getItem(key) || fallback
  } catch (error) {
    return fallback
  }
}

const saveStoredPrompt = (key, value) => {
  try {
    window.localStorage.setItem(key, value)
  } catch (error) {
    // Prompt editing still works for this page when browser storage is blocked.
  }
}

const approximateTokens = (prompt) => Math.ceil(prompt.length / 4)

const messageId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const ChatBubble = ({ message }) => {
  const isUser = message.role === 'user'
  const [showRaw, setShowRaw] = useState(false)
  const rawGenerations = message.rawGenerations || []

  return (
    <VStack
      alignSelf={isUser ? 'flex-end' : 'flex-start'}
      maxWidth="88%"
      space="xs"
    >
      <Box
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
          {message.content}
        </Text>
      </Box>

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
                </VStack>
              ))}
            </VStack>
          ) : null}
        </VStack>
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
            bg: isRemove ? '$red950' : '$green950',
            borderColor: isRemove ? '$red800' : '$green800'
          }
        }}
        borderWidth={1}
        borderColor={isRemove ? '$red300' : '$green300'}
        rounded="$md"
        p="$3"
      >
        <Text fontFamily="$mono" size="xs" selectable>
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
          bg: '$amber950',
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

      <HStack space="md" flexWrap="wrap">
        <JsonChange
          prefix="−"
          title="Before"
          value={diff.before}
          tone="remove"
        />
        <JsonChange prefix="+" title="After" value={diff.after} tone="add" />
      </HStack>

      <Alert action="warning" variant="outline">
        <AlertIcon as={InfoIcon} />
        <AlertText>
          Nothing has been sent to the SPR API. Accept applies exactly the JSON
          shown above.
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
          {model.size} · {model.context}
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

const Assistant = () => {
  const alertContext = React.useContext(AlertContext)
  const engineRef = useRef(null)
  const stagedEngineRef = useRef(null)
  const isThinkingRef = useRef(false)
  const autoLoadAttemptedRef = useRef(false)
  const scrollRef = useRef(null)
  const settingsScrollRef = useRef(null)
  const cancelRef = useRef(null)
  const promptCancelRef = useRef(null)

  const [selectedModelKey, setSelectedModelKey] = useState('qwen3-1.7b')
  const [loadedModelKey, setLoadedModelKey] = useState(null)
  const [showConsent, setShowConsent] = useState(false)
  const [loadState, setLoadState] = useState('idle')
  const [cacheState, setCacheState] = useState('checking')
  const [loadingModelKey, setLoadingModelKey] = useState(null)
  const [cachedModelKeys, setCachedModelKeys] = useState([])
  const [loadProgress, setLoadProgress] = useState({ progress: 0, text: '' })
  const [systemPrompt, setSystemPrompt] = useState(() =>
    storedPrompt(ACTION_PROMPT_STORAGE_KEY, SYSTEM_PROMPT)
  )
  const [chatSystemPrompt, setChatSystemPrompt] = useState(() =>
    storedPrompt(CHAT_PROMPT_STORAGE_KEY, CHAT_SYSTEM_PROMPT)
  )
  const [systemPromptDraft, setSystemPromptDraft] = useState(systemPrompt)
  const [chatSystemPromptDraft, setChatSystemPromptDraft] =
    useState(chatSystemPrompt)
  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [messages, setMessages] = useState([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [activityText, setActivityText] = useState('')
  const [pendingProposal, setPendingProposal] = useState(null)
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
  const loadingModelIsCached =
    loadingModelKey && cachedModelKeys.includes(loadingModelKey)
  const loadPercent = Math.round((loadProgress.progress || 0) * 100)
  const loadingStatus = loadingModel
    ? `${loadingModelIsCached ? 'Loading' : 'Downloading'} ${loadingModel.name}${
        loadPercent ? ` · ${loadPercent}%` : ''
      }`
    : 'Preparing local model…'
  const promptContextTokens =
    loadedModel?.contextTokens || selectedModel.contextTokens
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
    rawGenerations = []
  ) => {
    setMessages((current) => [
      ...current,
      {
        id: messageId(),
        role,
        content,
        includeInContext,
        rawGenerations
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
    saveStoredPrompt(ACTION_PROMPT_STORAGE_KEY, nextSystemPrompt)
    saveStoredPrompt(CHAT_PROMPT_STORAGE_KEY, nextChatSystemPrompt)
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

  const activateEngine = ({ engine, model }) => {
    const previousEngine = engineRef.current
    engineRef.current = engine
    setLoadedModelKey(model.key)
    setCachedModelKeys((current) => [...new Set([...current, model.key])])
    setLoadingModelKey(null)
    setLoadState('ready')
    setLoadProgress({ progress: 1, text: '' })
    if (previousEngine && previousEngine !== engine) {
      previousEngine.unload().catch(() => {})
    }
  }

  const loadModel = async (modelToLoad) => {
    setShowConsent(false)
    setLoadState('loading')
    setLoadingModelKey(modelToLoad.key)
    setLoadProgress({
      progress: 0,
      text: cachedModelKeys.includes(modelToLoad.key)
        ? 'Reading model from browser storage…'
        : 'Checking WebGPU support…'
    })

    try {
      const engine = await loadWebLLM(modelToLoad, (report) => {
        setLoadProgress(report)
      })

      if (isThinkingRef.current) {
        stagedEngineRef.current = { engine, model: modelToLoad }
        setLoadState('switching')
        setLoadProgress({
          progress: 1,
          text: `Download complete. Switching after the current ${loadedModel?.name || 'model'} response…`
        })
      } else {
        activateEngine({ engine, model: modelToLoad })
      }
    } catch (error) {
      setLoadingModelKey(null)
      setLoadState(engineRef.current ? 'ready' : 'error')
      alertContext.error(
        'Could not load local model',
        error?.message || String(error)
      )
    }
  }

  const loadSelectedModel = () => loadModel(selectedModel)

  useEffect(() => {
    if (
      autoLoadAttemptedRef.current ||
      isReady ||
      isModelTransitioning ||
      !cachedModelKeys.includes('qwen3-1.7b')
    ) {
      return
    }

    autoLoadAttemptedRef.current = true
    setSelectedModelKey('qwen3-1.7b')
    loadModel(getModel('qwen3-1.7b'))
  }, [cachedModelKeys])

  const sendMessage = async () => {
    const userText = input.trim()
    if (!userText || !isReady || isThinking || pendingProposal) return
    const modelUserText = loadedModel?.promptSuffix
      ? `${userText}\n${loadedModel.promptSuffix}`
      : userText

    const history = messages
      .filter((message) => message.includeInContext !== false)
      .map(({ role, content }) => ({ role, content }))
    setInput('')
    addMessage('user', userText)
    isThinkingRef.current = true
    setIsThinking(true)
    setActivityText('Thinking locally…')

    try {
      const response = await runAssistantTurn({
        engine: engineRef.current,
        history,
        userText: modelUserText,
        executeReadTool,
        onActivity: setActivityText,
        systemPrompt,
        chatSystemPrompt
      })

      if (response.kind === 'proposal') {
        const preparedProposal = await prepareProposal(response.proposal)
        setPendingProposal(preparedProposal)
        addMessage(
          'assistant',
          'I prepared a configuration change. Review the exact before/after values below.',
          true,
          response.rawGenerations
        )
      } else {
        addMessage(
          'assistant',
          response.message,
          true,
          response.rawGenerations
        )
      }
    } catch (error) {
      if (error.rawGenerations?.length) {
        addMessage(
          'assistant',
          'The local generation could not be parsed. Expand the raw generation below for debugging.',
          false,
          error.rawGenerations
        )
      }
      alertContext.error(
        'Local assistant error',
        error?.message || String(error)
      )
    } finally {
      isThinkingRef.current = false
      setIsThinking(false)
      setActivityText('')
      if (stagedEngineRef.current) {
        const staged = stagedEngineRef.current
        stagedEngineRef.current = null
        activateEngine(staged)
      }
    }
  }

  const acceptProposal = async () => {
    if (!pendingProposal || isApplying) return
    setIsApplying(true)
    try {
      const applied = await applyProposal(pendingProposal)
      setPendingProposal(null)
      addMessage(
        'assistant',
        `Applied the ${applied.operation} for the ${applied.label}.`
      )
      alertContext.success('Change applied')
    } catch (error) {
      alertContext.error(
        'SPR API rejected the change',
        error?.message || String(error)
      )
    } finally {
      setIsApplying(false)
    }
  }

  const rejectProposal = () => {
    setPendingProposal(null)
    addMessage('assistant', 'No changes were made.')
  }

  const resetChat = async () => {
    setMessages([INITIAL_MESSAGE])
    setPendingProposal(null)
    setInput('')
    if (engineRef.current) {
      await engineRef.current.resetChat().catch(() => {})
    }
  }

  return (
    <ScrollView
      flex={1}
      bg="$backgroundContentLight"
      sx={{ _dark: { bg: '$backgroundContentDark' } }}
      contentContainerStyle={{ minHeight: '100%', paddingBottom: 48 }}
      testID="assistant-page"
    >
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
              <Heading size="xl">Assistant</Heading>
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
              {pendingProposal ? (
                <ProposalReview
                  proposal={pendingProposal}
                  isApplying={isApplying}
                  onAccept={acceptProposal}
                  onReject={rejectProposal}
                />
              ) : null}
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
                  Accept or reject the pending change before continuing.
                </Text>
              ) : null}
              <HStack alignItems="flex-end" space="sm">
                <Textarea
                  flex={1}
                  minHeight={72}
                  isDisabled={!isReady || isThinking || !!pendingProposal}
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
                    placeholder={
                      isReady
                        ? 'Ask about devices or firewall rules…'
                        : 'Load a local model first'
                    }
                    aria-label="Message Assistant"
                  />
                </Textarea>
                <Button
                  onPress={sendMessage}
                  isDisabled={
                    !input.trim() || !isReady || isThinking || !!pendingProposal
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
                  download. The assistant switches to {selectedModel.name} only
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
            <VStack>
              <Heading size="lg">Assistant settings</Heading>
              <Text
                size="xs"
                color="$textLight600"
                sx={{ _dark: { color: '$textDark400' } }}
              >
                Browser-local and editable. The approval gate remains enforced
                by application code.
              </Text>
            </VStack>
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
                    isDisabled={
                      isModelTransitioning ||
                      (isReady && loadedModelKey === selectedModelKey)
                    }
                  >
                    <ButtonText>
                      {isReady && loadedModelKey === selectedModelKey
                        ? 'Model loaded'
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
                        Chat is using {loadedModel.name}
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
                <Text
                  size="xs"
                  color="$textLight600"
                  sx={{ _dark: { color: '$textDark400' } }}
                >
                  Defines SPR, selects read tools, and prepares reviewed rule
                  proposals.
                </Text>
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
                  Used when the assistant answers normally or explains an API
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
