const MAX_ENTRIES = 50

let entries = []
let listeners = new Set()

const emit = () => listeners.forEach((fn) => fn(entries))

export const logNotification = (type, title, body) => {
  let text = null
  if (typeof body === 'string') {
    text = body
  } else if (body != null && !body.props) {
    text = String(body)
  }

  let last = entries[0]
  if (
    last &&
    last.type === type &&
    last.title === title &&
    last.body === text
  ) {
    entries = [
      { ...last, count: (last.count || 1) + 1, time: Date.now() },
      ...entries.slice(1)
    ]
  } else {
    entries = [
      { type, title, body: text, time: Date.now(), count: 1 },
      ...entries
    ].slice(0, MAX_ENTRIES)
  }
  emit()
}

export const getNotificationsLog = () => entries

export const clearNotificationsLog = () => {
  entries = []
  emit()
}

export const subscribeNotificationsLog = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
