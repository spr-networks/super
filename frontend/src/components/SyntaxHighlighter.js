import { default as RNSyntaxHighlighter } from 'react-native-syntax-highlighter'
import { github, ocean } from 'react-syntax-highlighter/styles/hljs'
import { useColorMode } from '@gluestack-ui/themed'

//skip some properties
const dumpJSON = (item, clean = false) => {
  let { time, bucket, ...rest } = item
  if (clean) {
    return JSON.stringify(rest, null, 2)
  }

  return JSON.stringify(rest)
}

const JSONSyntax = ({ language, ...props }) => {
  const colorMode = useColorMode()
  const syntaxTheme = colorMode == 'light' ? github : ocean

  return (
    <RNSyntaxHighlighter
      highlighter="hljs"
      language="json"
      style={syntaxTheme}
      wrapLongLines={true}
      lineProps={{ style: { flexWrap: 'wrap', lineHeight: 1.5 } }} // Adjusted line height
      customStyle={{
        backgroundColor: 'transparent'
      }}
    >
      {props.children}
    </RNSyntaxHighlighter>
  )
}

const HEXSyntax = () => {
  const colorMode = useColorMode()
  const syntaxTheme = colorMode == 'light' ? github : ocean

  return (
    <RNSyntaxHighlighter
      language="brainfuck"
      style={syntaxTheme}
      customStyle={{
        backgroundColor: 'transparent'
      }}
    >
      {props.children}
    </RNSyntaxHighlighter>
  )
}

export default JSONSyntax

export { JSONSyntax, HEXSyntax }
