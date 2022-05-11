// fix ReferenceError: regeneratorRuntime is not defined
import '@babel/polyfill'
//import '@testing-library/jest-dom/extend-expect'
import createServer from './api/MockAPI'

process.env.REACT_APP_API="skip"

// TODO beforeAll, afterAll server start/shutdown
let server = createServer()
server.logging = false
