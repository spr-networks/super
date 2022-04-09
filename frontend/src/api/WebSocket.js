import { apiURL } from './API'

export function ConnectWebsocket(messageCallback) {
  let userData = JSON.parse(localStorage.getItem('user'))

  let host = new URL(apiURL()).host

  let ws = new WebSocket(`ws://${host}/ws`)

  ws.addEventListener('open', (event) => {
    ws.send(userData['username'] + ':' + userData['password'])
  })

  ws.addEventListener('message', (event) => {
    messageCallback(event)
  })

  return ws
}
