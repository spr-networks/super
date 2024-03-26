const agent = require('../agent')
const assert = require('assert')

describe('device', () => {
  it('should add a device', (done) => {
    let dev = {
      MAC: 'pending',
      Name: 'devName',
      Policies: ['dns', 'wan'],
      Groups: [],
      DeviceTags: [],
      PSKEntry: { Psk: 'password', Type: 'sae' }
    }

    agent
      .put('/device?identity=pending')
      .send(dev)
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.status == 200)
        assert.equal(res.body.Name, 'devName')
        assert.equal(res.body.PSKEntry.Psk, '**', 'password not masked')

        done()
      })
  })

  it('should list devices', (done) => {
    agent
      .get('/devices')
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.status == 200)
        assert(Object.keys(res.body).length > 0, 'missing devices')

        done()
      })
  })
})
