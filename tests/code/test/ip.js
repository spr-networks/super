const agent = require('../agent')
const assert = require('assert')

describe('ip', () => {
  it('addr', (done) => {
    agent
      .get('/ip/addr')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.body.length > 0, 'missing ifaces')

        done()
      })
  })
})
