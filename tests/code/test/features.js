const agent = require('../agent')
const assert = require('assert')

describe('features', () => {
  it('list features', (done) => {
    agent
      .get('/features')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.body.includes('wifi'), 'no wifi')
        assert(res.body.includes('dns'), 'no dns')
        assert(res.body.includes('wireguard'), 'no wireguard')

        done()
      })
  })
})
