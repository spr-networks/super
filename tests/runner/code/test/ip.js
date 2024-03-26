const agent = require('../agent')
const assert = require('assert')

describe('ip', () => {
  it('addr', (done) => {
    agent
      .get('/ip/addr')
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.status == 200)
        assert(res.body.length > 0, 'missing ifaces')

        done()
      })
  })
})
