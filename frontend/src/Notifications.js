export const init = (...props) => {
  //Notification.requestPermission() ...
}

export function notification(title, body) {
  let msg = `${title}, ${body}`
  if (!('Notification' in window)) {
    return
  }

  if (Notification.permission === 'denied') {
    return
  }

  if (Notification.permission === 'granted') {
    var notification = new Notification(msg)
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(function (permission) {
      if (permission === 'granted') {
        var notification = new Notification(msg)
      }
    })
  }

  return
}

export default {
  init,
  notification
}
