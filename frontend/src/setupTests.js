// fix ReferenceError: regeneratorRuntime is not defined
//import '@babel/polyfill'
//import '@testing-library/jest-dom/extend-expect'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
global.self = global
//global.window = {}
global.XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest
//TODO mock-socket or alternative
global.WebSocket = class {
  addEventListener(event, fn) {}
  close() {}
}
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter')
jest.mock('react-native-chart-kit', () => () => <></>)

jest.mock('react-native-device-info', () => {
  return {
    getUniqueId: () => 1234
  }
})

jest.mock('react-native-rsa-native', () => {
  return {
    RSA: {}
  }
})

jest.mock('@react-native-community/push-notification-ios', () => {
  return {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    requestPermissions: jest.fn(() => Promise.resolve({ data: {} })),
    removeAllPendingNotificationRequests: jest.fn(),
    removeAllDeliveredNotifications: jest.fn(),
    setNotificationCategories: jest.fn(),

    configure: jest.fn()
  }
})

// NOTE not used anymore
global.localStorage = {
  data: {},
  getItem: function (key) {
    return this.data[key] || null
  },
  setItem: function (key, value) {
    this.data[key] = value
  },
  removeItem: function (key) {
    delete this.data[key]
  }
}

process.env.REACT_APP_API = 'mock'

// TODO beforeAll, afterAll server start/shutdown
/*
let server = MockAPI()
server.logging = false
*/
