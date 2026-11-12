import React, { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { Box, HStack, Input, InputField, Pressable, ScrollView, Text } from '@gluestack-ui/themed'
import { themeFontFacesCss } from 'Themes'
import { cliHistory, expandHistory, rememberLine } from './assistantCli'

const TONES = Object.freeze({
  text: ['$textLight900', '$textDark100'], muted: ['$textLight500', '$textDark400'], accent: ['$primary600', '$primary300'],
  error: ['$red600', '$red400'], warn: ['$amber700', '$amber300']
})
const FONT = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
const mono = Platform.OS === 'web' ? { fontFamily: FONT, fontSize: 13, lineHeight: 20 } : { fontSize: 13, lineHeight: 20 }
const FONT_CSS = `#root [data-spr-terminal] * { font-family: ${FONT} !important; letter-spacing: 0 !important; }`
const FRAME = Platform.OS === 'web' ? { height: 'calc(100vh - 190px)' } : { height: 560 }
const historyMemory = cliHistory

const Line = ({ tone = 'text', children, ...rest }) => (
  <Text style={mono} color={TONES[tone][0]} sx={{ _dark: { color: TONES[tone][1] } }} {...rest}>{children}</Text>
)
const Prompt = ({ dim }) => <Line tone={dim ? 'muted' : 'accent'} bold>{'> '}</Line>

const Entry = ({ message, renderExtras }) => {
  if (message.role === 'user') {
    return <HStack alignItems="flex-start"><Prompt /><Line flex={1}>{message.content}</Line></HStack>
  }
  const text = message.view ? message.note : message.content
  return (
    <Box gap={6}>
      {text ? <Line tone={message.tone === 'error' ? 'error' : 'text'}>{text}</Line> : null}
      {renderExtras ? renderExtras(message) : null}
    </Box>
  )
}

const TerminalPane = ({
  messages, status = { state: 'none', text: '' }, busyText = '', stream = null, hint = '', disabled = false,
  onSubmit, complete = () => [], renderExtras, children, minHeight = 360, banner = '', headerAction = null
}) => {
  const [line, setLine] = useState('')
  const [candidates, setCandidates] = useState([])
  const cursor = useRef(null)
  const draft = useRef('')
  const scroll = useRef(null)
  const input = useRef(null)

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById('spr-terminal-font')) return
    const style = document.createElement('style')
    style.id = 'spr-terminal-font'
    style.textContent = `${themeFontFacesCss('jetbrains') || ''}\n${FONT_CSS}`
    document.head.appendChild(style)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd?.({ animated: false }), 0)
    return () => clearTimeout(timer)
  }, [messages.length, busyText, stream?.answer, stream?.thinking, candidates.length])

  const submit = () => {
    const text = expandHistory(line.trim())
    if (!text || disabled) return
    rememberLine(text)
    cursor.current = null; draft.current = ''
    setLine(''); setCandidates([])
    onSubmit(text)
  }

  const recall = (step) => {
    if (!historyMemory.length) return
    if (cursor.current === null) { if (step > 0) return; draft.current = line; cursor.current = historyMemory.length }
    const next = cursor.current + step
    if (next >= historyMemory.length) { cursor.current = null; setLine(draft.current); return }
    cursor.current = Math.max(0, next)
    setLine(historyMemory[cursor.current])
  }

  const tab = () => {
    const found = complete(line)
    if (found.length === 1) { setLine(`${found[0]} `); setCandidates([]); return }
    if (!found.length) { setCandidates([]); return }
    let prefix = found[0]
    for (const item of found) while (!item.startsWith(prefix)) prefix = prefix.slice(0, -1)
    if (prefix.length > line.length) setLine(prefix)
    setCandidates(found)
  }

  const onKeyPress = (event) => {
    const native = event.nativeEvent || event
    if (native.isComposing) return
    const stop = () => event.preventDefault?.()
    if (native.key === 'Enter') { stop(); submit() }
    else if (native.key === 'ArrowUp') { stop(); recall(-1) }
    else if (native.key === 'ArrowDown') { stop(); recall(1) }
    else if (native.key === 'Tab') { stop(); tab() }
    else if (native.ctrlKey && (native.key === 'c' || native.key === 'u')) { stop(); setLine(''); setCandidates([]); cursor.current = null }
    else if (native.ctrlKey && native.key === 'l') { stop(); onSubmit('clear') }
  }

  const dot = status.state === 'ready' ? '$green600' : status.state === 'loading' ? '$amber500' : '$muted500'
  const card = { bg: '$backgroundCardLight', borderColor: '$borderColorCardLight', sx: { _dark: { bg: '$backgroundCardDark', borderColor: '$borderColorCardDark' } } }
  return (
    <Box testID="assistant-terminal" dataSet={{ sprTerminal: 'on' }} style={FRAME} minHeight={minHeight} borderWidth={1} rounded="$xl" overflow="hidden" {...card}>
      <HStack alignItems="center" justifyContent="space-between" h={38} px="$3" borderBottomWidth={1}
        bg="$backgroundContentLight" borderColor="$borderColorCardLight" sx={{ _dark: { bg: '$backgroundContentDark', borderColor: '$borderColorCardDark' } }}>
        <HStack alignItems="center" space="md">
          <HStack><Line bold>Ask </Line><Line tone="accent" bold>SPR</Line></HStack>
          {headerAction ? (
            <Pressable onPress={headerAction.onPress} accessibilityRole="link" accessibilityLabel={headerAction.label}
              testID="assistant-terminal-header-action">
              <Line tone="accent" underline>{headerAction.label}</Line>
            </Pressable>
          ) : null}
        </HStack>
        <HStack alignItems="center" space="xs">
          <Box w={7} h={7} rounded="$full" bg={dot} />
          <Line tone="muted" testID="assistant-terminal-status">{busyText || status.text}</Line>
        </HStack>
      </HStack>

      <Pressable flex={1} onPress={() => input.current?.focus?.()} accessible={false}>
        <ScrollView ref={scroll} flex={1} contentContainerStyle={{ padding: 14, gap: 8 }}
          onContentSizeChange={() => scroll.current?.scrollToEnd?.({ animated: false })}>
          {banner ? <Line tone="muted">{banner}</Line> : null}
          {messages.map((message) => <Entry key={message.id} message={message} renderExtras={renderExtras} />)}
          {stream?.thinking ? <Line tone="muted">{stream.thinking}</Line> : null}
          {stream?.answer ? <Line>{stream.answer}</Line> : null}
          {children}
          {busyText ? <Line tone="muted" testID="assistant-terminal-busy">… {busyText}</Line> : null}
          {candidates.length ? <Line tone="muted">{candidates.join('   ')}</Line> : null}
          {hint ? <Line tone="warn">{hint}</Line> : null}
          <HStack alignItems="center">
            <Prompt dim={disabled} />
            <Input flex={1} borderWidth={0} h={22} isDisabled={disabled} sx={{ ':focus': { borderWidth: 0 }, _web: { outlineWidth: 0 } }}>
              <InputField
                ref={input}
                value={line}
                onChangeText={(text) => { setLine(text); if (candidates.length) setCandidates([]) }}
                onKeyPress={onKeyPress}
                onSubmitEditing={Platform.OS === 'web' ? undefined : submit}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                placeholder={disabled ? '' : 'command or question'}
                aria-label="Assistant command line"
                p={0}
                style={mono}
                color="$textLight900"
                sx={{ _dark: { color: '$textDark100' }, _web: { outlineWidth: 0 } }}
              />
            </Input>
          </HStack>
        </ScrollView>
      </Pressable>
    </Box>
  )
}

export default TerminalPane
