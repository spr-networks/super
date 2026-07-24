import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const evalDirectory = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(evalDirectory, '..')
const buildDirectory = join(tmpdir(), 'spr-assistant-webllm-eval-build')
const profileDirectory = join(tmpdir(), 'spr-assistant-webllm-eval-profile')
const webpackCLI = require.resolve('webpack-cli/bin/cli.js')
const webpackConfig = join(
  evalDirectory,
  'assistant.webllm.eval.config.js'
)
const assertScores = process.argv.includes('--assert')
const showRaw = process.argv.includes('--verbose')
const evalPort = Number(process.env.ASSISTANT_EVAL_PORT || 9321)

const build = spawnSync(
  process.execPath,
  [webpackCLI, '--config', webpackConfig],
  {
    cwd: frontendRoot,
    env: {
      ...process.env,
      SPR_ASSISTANT_EVAL_BUILD_DIR: buildDirectory
    },
    stdio: 'inherit'
  }
)
if (build.status !== 0) {
  process.exit(build.status || 1)
}

const chromeCandidates = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean)
const chromeBinary = chromeCandidates.find(existsSync)
if (!chromeBinary) {
  throw new Error(
    'Chrome or Chromium was not found. Set CHROME_BIN to its executable.'
  )
}

const mimeType = (path) =>
  ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  })[extname(path)] || 'application/octet-stream'

let finishResult
let finishError
const resultPromise = new Promise((resolveResult, rejectResult) => {
  finishResult = resolveResult
  finishError = rejectResult
})

const server = createServer((request, response) => {
  if (
    request.method === 'POST' &&
    request.url === '/__assistant_eval_progress__'
  ) {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      try {
        const progress = JSON.parse(body)
        console.log(`[eval] ${progress.message}`)
      } catch (error) {
        // Progress is informational; malformed progress must not stop the run.
      }
      response.writeHead(204)
      response.end()
    })
    return
  }

  if (
    request.method === 'POST' &&
    request.url === '/__assistant_eval_result__'
  ) {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      try {
        finishResult(JSON.parse(body))
        response.writeHead(204)
        response.end()
      } catch (error) {
        finishError(error)
        response.writeHead(400)
        response.end()
      }
    })
    return
  }

  const requestedPath = request.url === '/' ? '/index.html' : request.url
  const filePath = join(buildDirectory, requestedPath.replace(/^\/+/, ''))
  try {
    const file = readFileSync(filePath)
    response.writeHead(200, {
      'Content-Type': mimeType(filePath),
      'Cache-Control': 'no-store'
    })
    response.end(file)
  } catch (error) {
    response.writeHead(404)
    response.end('Not found')
  }
})

await new Promise((resolveListen) =>
  server.listen(evalPort, '127.0.0.1', resolveListen)
)
const address = server.address()
const evalURL = `http://127.0.0.1:${address.port}/`
console.log(
  `[eval] Opening a dedicated WebGPU runner. Model cache: ${profileDirectory}`
)

const chromeArguments = [
  '--headless=new',
  '--enable-unsafe-webgpu',
  '--disable-gpu-sandbox',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profileDirectory}`,
  evalURL
]
if (process.env.ASSISTANT_EVAL_HEADED === '1') {
  chromeArguments.shift()
}

const chrome = spawn(chromeBinary, chromeArguments, {
  stdio: ['ignore', 'ignore', 'pipe']
})
let chromeErrors = ''
chrome.stderr.on('data', (chunk) => {
  chromeErrors = `${chromeErrors}${chunk}`.slice(-8000)
})
chrome.on('exit', (code) => {
  if (code && code !== 0) {
    finishError(
      new Error(`Chrome exited with status ${code}\n${chromeErrors}`)
    )
  }
})

const timeout = setTimeout(() => {
  finishError(new Error('The Qwen evaluation timed out after 15 minutes.'))
}, 15 * 60 * 1000)

let report
try {
  report = await resultPromise
} finally {
  clearTimeout(timeout)
  chrome.kill('SIGTERM')
  server.close()
}

if (report.error) {
  console.error(`[eval] ${report.error}`)
  process.exit(1)
}

console.log('')
console.log(
  `Qwen raw score: ${report.rawPassed}/${report.rawTotal} ` +
    `(${Math.round((report.rawPassed / report.rawTotal) * 100)}%)`
)
console.log(
  `Guarded pipeline: ${report.appPassed}/${report.appTotal} ` +
    `(${Math.round((report.appPassed / report.appTotal) * 100)}%)`
)
console.log(`App-routed requests: ${report.appRouted}`)
console.log('')
report.results.forEach((result, index) => {
  const raw =
    result.source === 'app'
      ? 'APP'
      : result.rawPassed
        ? 'RAW PASS'
        : 'RAW FAIL'
  const guarded = result.skipped
    ? 'SKIP'
    : result.appPassed
      ? 'GUARDED PASS'
      : 'GUARDED FAIL'
  console.log(`${index + 1}. [${raw}] [${guarded}] ${result.name}`)
  if (result.error) console.log(`   ${result.error}`)
  if (
    showRaw &&
    result.source !== 'app' &&
    (!result.rawPassed || !result.appPassed)
  ) {
    console.log(`   Raw: ${result.raw || '(empty generation)'}`)
  }
})

if (
  assertScores &&
  (report.rawPassed < report.rawTotal ||
    report.appPassed < report.appTotal)
) {
  process.exit(1)
}
