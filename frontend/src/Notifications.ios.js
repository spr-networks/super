import PushNotificationIOS from '@react-native-community/push-notification-ios'

const init = () => {
  // init notifications
  PushNotificationIOS.requestPermissions({
    alert: true,
    badge: true,
    sound: true,
    critical: true
  }).then(
    (data) => {
      console.log('PushNotificationIOS.requestPermissions', data)
    },
    (data) => {
      console.log('PushNotificationIOS.requestPermissions failed', data)
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

  //const type = 'notification' //remove
  const type = 'localNotification'
  //PushNotificationIOS.addEventListener('notification', onRemoteNotification)
  PushNotificationIOS.addEventListener(type, onLocalNotification)
  return () => {
    PushNotificationIOS.removeEventListener(type)
  }
}

const notification = (title, body, category = 'test') => {
  let req = {
    id: new Date().toString(),
    title,
    //subtitle: title,
    body,
    badge: 0, // counter on home screen
    category,
    threadId: 'thread-id'
  }

  PushNotificationIOS.addNotificationRequest(req)
}

const onLocalNotification = (notification) => {
  const isClicked = notification.getData().userInteraction === 1
  const actionId = notification.getActionIdentifier()

  console.log(
    'Local Notification Received',
    `Alert title:  ${notification.getTitle()},
    Alert subtitle:  ${notification.getSubtitle()},
    Alert message:  ${notification.getMessage()},
    Badge: ${notification.getBadgeCount()},
    Action Id:  ${actionId},
    User Text:  ${notification.getUserText()},
    Notification is clicked: ${String(isClicked)}.`,
    [
      {
        text: 'Dismiss',
        onPress: null
      }
    ]
  )
}

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

export default {
  init,
  notification
}
