#!/usr/bin/env node

import http from 'node:http'

const PORT = 8099

let started = false
let contacted = false
let done = false
const results = []

const readBody = (req) =>
  new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'))
      } catch (e) {
        resolve({})
      }
    })
  })

const crashesOf = (pane) =>
  (pane.crashes || []).filter((c) => c.severity !== 'warning')

const warningsOf = (pane) =>
  (pane.crashes || []).filter((c) => c.severity === 'warning')

const summarize = () => {
  const failed = results.filter((r) => crashesOf(r).length)

  console.log('\n' + '='.repeat(60))
  console.log(`walked ${results.length} panes on iOS`)
  console.log('='.repeat(60))

  const warned = new Map()
  for (const pane of results) {
    for (const w of warningsOf(pane)) {
      const key = w.message.split('\n')[0].slice(0, 100)
      warned.set(key, (warned.get(key) || 0) + 1)
    }
  }
  if (warned.size) {
    console.log('\nwarnings (not crashes):')
    for (const [message, count] of warned) {
      console.log(`  ${count}x  ${message}`)
    }
  }

  if (!failed.length) {
    console.log('\nno crashes')
    return 0
  }

  for (const pane of failed) {
    console.log(`\nCRASH  ${pane.name}  (${pane.url})`)
    for (const crash of crashesOf(pane)) {
      console.log(`  [${crash.source}] ${crash.message}`)
      if (crash.stack) {
        console.log(
          crash.stack
            .split('\n')
            .slice(0, 6)
            .map((line) => '    ' + line.trim())
            .join('\n')
        )
      }
      if (crash.componentStack) {
        console.log(
          '    in:' +
            crash.componentStack.split('\n').slice(0, 4).join('\n    ')
        )
      }
    }
  }

  console.log(`\n${failed.length} of ${results.length} panes crashed`)
  return 1
}

const server = http.createServer(async (req, res) => {
  const send = (body) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  if (req.url === '/plan') {
    if (!started) console.log('app asked for a plan, starting walk')
    contacted = true
    send({ go: !started })
    return
  }

  if (req.url === '/start') {
    const body = await readBody(req)
    started = true
    console.log(`app connected, walking ${body.total} routes plus their tabs...\n`)
    send({ ok: true })
    return
  }

  if (req.url === '/result') {
    const body = await readBody(req)
    results.push(body)
    const crashes = crashesOf(body)
    const status = crashes.length ? 'CRASH' : 'ok   '
    console.log(
      `  ${status}  ${body.name}${crashes.length ? '  <- ' + crashes[0].message.split('\n')[0] : ''}`
    )
    send({ ok: true })
    return
  }

  if (req.url === '/done') {
    done = true
    send({ ok: true })
    const code = summarize()
    server.close(() => process.exit(code))
    return
  }

  send({ ok: true })
})

server.listen(PORT, () => {
  console.log(`pane-walk collector listening on http://localhost:${PORT}`)
  console.log('launch the app in the simulator now\n')
})

setTimeout(() => {
  if (!contacted) {
    console.log('no app connected after 300s - is the app running in the sim?')
    process.exit(2)
  }
}, 300000)

process.on('SIGINT', () => {
  if (!done) summarize()
  process.exit(results.some((r) => crashesOf(r).length) ? 1 : 0)
})
