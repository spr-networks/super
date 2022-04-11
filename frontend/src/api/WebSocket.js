import { apiURL } from './API'

export function ConnectWebsocket(messageCallback) {
  let userData = JSON.parse(localStorage.getItem('user')),
    ws = null

  try {
    let host = new URL(apiURL()).host
    ws = new WebSocket(`ws://${host}/ws`)
  } catch (err) {
    // mock error
    return
  }

  ws.addEventListener('open', (event) => {
    ws.send(userData['username'] + ':' + userData['password'])
  })

  ws.addEventListener('message', (event) => {
    messageCallback(event)
  })

  return ws
}
