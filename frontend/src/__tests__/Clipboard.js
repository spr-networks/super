import { copyOnWeb } from 'utils'

const makeLegacyBrowser = ({ isSecureContext = true, writeText } = {}) => {
  const copyElement = {
    style: {}
  }
  const range = { selectNodeContents: jest.fn() }
  const selection = {
    addRange: jest.fn(),
    removeAllRanges: jest.fn()
  }
  const activeElement = { focus: jest.fn() }
  const document = {
    activeElement,
    body: {
      appendChild: jest.fn(),
      removeChild: jest.fn()
    },
    createElement: jest.fn(() => copyElement),
    createRange: jest.fn(() => range),
    execCommand: jest.fn(() => true)
  }

  return {
    browser: {
      document,
      getSelection: jest.fn(() => selection),
      isSecureContext,
      navigator: { clipboard: writeText ? { writeText } : undefined }
    },
    copyElement,
    document,
    range,
    selection
  }
}

describe('copyOnWeb', () => {
  test('uses the Clipboard API when it succeeds', async () => {
    const writeText = jest.fn(() => Promise.resolve())
    const { browser, document } = makeLegacyBrowser({ writeText })

    await expect(copyOnWeb('peer config', browser)).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('peer config')
    expect(document.execCommand).not.toHaveBeenCalled()
  })

  test('falls back when Chrome rejects the Clipboard API', async () => {
    const writeText = jest.fn(() => Promise.reject(new Error('NotAllowedError')))
    const { browser, copyElement, document, range, selection } =
      makeLegacyBrowser({ writeText })

    await expect(copyOnWeb('peer config', browser)).resolves.toBe(true)
    expect(copyElement.textContent).toBe('peer config')
    expect(range.selectNodeContents).toHaveBeenCalledWith(copyElement)
    expect(selection.addRange).toHaveBeenCalledWith(range)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(document.body.removeChild).toHaveBeenCalledWith(copyElement)
  })

  test('uses the fallback immediately in an insecure context', async () => {
    const writeText = jest.fn(() => Promise.resolve())
    const { browser, document } = makeLegacyBrowser({
      isSecureContext: false,
      writeText
    })

    await expect(copyOnWeb('peer config', browser)).resolves.toBe(true)
    expect(writeText).not.toHaveBeenCalled()
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  test('reports failure when neither clipboard path is available', async () => {
    await expect(
      copyOnWeb('peer config', {
        document: {},
        isSecureContext: false,
        navigator: {}
      })
    ).resolves.toBe(false)
  })
})
