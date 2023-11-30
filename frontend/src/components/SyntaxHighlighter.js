import React from "react";
import { Highlight, themes } from "prism-react-renderer"
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
  const syntaxTheme = colorMode == 'light' ? themes.nightOwlLight : themes.nightOwlDark

  return (
    <Highlight
      theme={syntaxTheme}
      code={props.code}
      language="js"
    >
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre style={style}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  )
}

const HEXSyntax = ({ ...props }) => {
  const colorMode = useColorMode()
  const syntaxTheme = colorMode == 'light' ? themes.nightOwlLight : themes.nightOwlDark
  return (
    <Highlight
      theme={syntaxTheme}
      code={props.code}
      language="none"
    >
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre style={style}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  )
}

export default JSONSyntax

export { JSONSyntax, HEXSyntax }
