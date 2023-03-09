const API_URL = process.env.API_URL || 'http://192.168.2.1'
const TOKEN = process.env.TOKEN || Buffer.from('admin:admin').toString('base64')
const supertest = require('supertest')

const hook = (method = 'get') => (args) =>
  supertest(API_URL)
    [method](args)
    .set('Authorization', `Basic ${TOKEN}`)

const request_auth = {
  post: hook('post'),
  get: hook('get'),
  put: hook('put'),
  delete: hook('delete'),
}

const request = supertest(API_URL)

module.exports = request_auth
module.exports.request = request
module.exports.request_auth = request_auth
