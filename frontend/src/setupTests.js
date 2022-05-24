// fix ReferenceError: regeneratorRuntime is not defined
//import '@babel/polyfill'
//import '@testing-library/jest-dom/extend-expect'

global.self = global
//global.window = {}
global.XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest

global.localStorage = {
  data: {},
  getItem: function (key) {
    return this.data[key] || null
  },
  setItem: function (key, value) {
    this.data[key] = value
  }
}

process.env.REACT_APP_API = 'mock'

// TODO beforeAll, afterAll server start/shutdown
/*
let server = MockAPI()
server.logging = false
*/
