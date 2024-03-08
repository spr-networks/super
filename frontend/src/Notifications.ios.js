import PushNotificationIOS from '@react-native-community/push-notification-ios'

const init = ({
  onLocalNotification,
  onNotification,
  onRegister,
  ...props
}) => {
  //NOTE useEffect in layouts/Admin

  console.log('+ ios notifications init')

  if (onLocalNotification) {
    console.log('+ setup notification handler: localNotification')
    PushNotificationIOS.addEventListener(
      'localNotification',
      onLocalNotification
    )
  }

  if (onNotification) {
    console.log('+ setup notification handler: notification')
    PushNotificationIOS.addEventListener('notification', onNotification)
  }

  if (onRegister) {
    console.log('+ setup notification handler: register')
    PushNotificationIOS.addEventListener('register', onRegister)
  }

  // init notifications
  PushNotificationIOS.requestPermissions({
    alert: true,
    badge: true,
    sound: true,
    critical: true
  }).then(
    (data) => {
      //console.log('PushNotificationIOS.requestPermissions', data)
    },
    (data) => {
      //console.log('PushNotificationIOS.requestPermissions failed', data)
    }
  )

  PushNotificationIOS.removeAllPendingNotificationRequests()
  // we should do this to get rid of the red badge
  //PushNotificationIOS.removeAllPendingNotificationRequests()
  PushNotificationIOS.removeAllDeliveredNotifications()

  PushNotificationIOS.setNotificationCategories([
    {
      id: 'userAction',
      actions: [
        { id: 'open', title: 'Open', options: { foreground: true } },
        /*{
            id: 'ignore',
            title: 'Desruptive',
            options: { foreground: true, destructive: true }
          },*/
        {
          id: 'allow',
          title: 'Allow',
          options: { foreground: true }
        },
        {
          id: 'deny',
          title: 'Deny',
          options: { foreground: true, destructive: true }
        },
        {
          id: 'text',
          title: 'Comment',
          options: { foreground: true },
          textInput: { buttonTitle: 'Send' }
        }
      ]
    }
  ])
}

// remove eventListeners
const cleanup = () => {
  PushNotificationIOS.removeEventListener('register')
  PushNotificationIOS.removeEventListener('notification')
  PushNotificationIOS.removeEventListener('localNotification')
}

/*
// notification reply
const onLocalNotification = (notification) => {
  const data = notification.getData()
  const isClicked = data.userInteraction === 1
  const actionId = notification.getActionIdentifier() // allow, deny

  //TODO call onCloseConfirm here
  //{"actionIdentifier": "allow", "type": "confirm", "userInteraction": 1}

  console.log(
    'Local Notification Received',
    `Alert title:  ${notification.getTitle()},
    Alert subtitle:  ${notification.getSubtitle()},
    Alert message:  ${notification.getMessage()},
    Badge: ${notification.getBadgeCount()},
    Action Id:  ${actionId},
    User Text:  ${notification.getUserText()},
    Notification is clicked: ${String(isClicked)}.`,
    notification.getData()
  )
}

// notification reply
const onRemoteNotification = (notification) => {
  const actionIdentifier = notification.getActionIdentifier()

  if (actionIdentifier === 'open') {
    // Perform action based on open action
    console.log('[notification] open')
  }

  if (actionIdentifier === 'text') {
    // Text that of user input.
    const userText = notification.getUserText()
    // Perform action based on textinput action
    console.log('[notification] text', userText)
  }
}
*/

const notification = (title, body, category = null, userInfo = {}) => {
  // use id here to link with a callback ?

  let req = {
    id: new Date().toString(),
    title,
    //subtitle: title,
    body,
    badge: 0, // counter on home screen
    threadId: 'thread-id',
    userInfo
  }

  if (category) {
    req.category = category
  }

  PushNotificationIOS.addNotificationRequest(req)

  return req.id
}

const confirm = (title, body, data = null) => {
  /*// setup eventhandler when we wait for it, remove when done
  PushNotificationIOS.addEventListener('localNotification', (notification) => {
    const data = notification.getData()
    //const isClicked = data.userInteraction === 1
    const action = notification.getActionIdentifier() // allow, deny
    //com.apple.UNNotificationDefaultActionIdentifier = default open

    console.log('#notification:', data)
    console.log('#calling onCloseConfirm ***** ****\n\n')
    PushNotificationIOS.removeEventListener('localNotification', this)
    onCloseConfirm(action)
  })*/

  // trigger notification
  let userInfo = { data }
  let id = notification(title, body, 'userAction', userInfo)
  console.log('!! notification id=', id)
}

export default {
  init,
  cleanup,
  notification,
  confirm
}
