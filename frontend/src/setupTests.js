// fix ReferenceError: regeneratorRuntime is not defined
//import '@babel/polyfill'
//import '@testing-library/jest-dom/extend-expect'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
global.self = global
//global.window = {}
global.XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter')

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
