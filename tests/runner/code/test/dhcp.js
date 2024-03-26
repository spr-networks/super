const agent = require('../agent')
const assert = require('assert')

describe('dhcp', () => {

  it('should get subnet configuration', (done) => {
    agent
      .get('/subnetConfig')
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.status == 200)
        assert(Object.keys(res.body).length > 0, 'missing subnet config')
        done()
      })
  })

  it('should reject an invalid subnet mask', (done) => {
    let x = {"TinyNets":["192.168.100.0/31"],"LeaseTime":"25h0m0s"}
    agent
      .put('/subnetConfig')
      .send(x)
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.status != 200)
        done()
      })
  })

  it('should reject an invalid subnet ip', (done) => {
    let x = {"TinyNets":["256.168.100.0/24"],"LeaseTime":"25h0m0s"}
    agent
      .put('/subnetConfig')
      .send(x)
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.status != 200)
        done()
      })
  })


  it('should reject an invalid lease time', (done) => {
    let x = {"TinyNets":["192.168.100.0/24"],"LeaseTime":"1y25h0m0s"}
    agent
      .put('/subnetConfig')
      .send(x)
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.status != 200)
        done()
      })
  })


  it('should set subnet config', (done) => {
    let config = {"TinyNets":["192.168.100.0/24"],"LeaseTime":"25h0m0s"}

    agent
      .put('/subnetConfig')
      .send(config)
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.status == 200)
        done()
      })
  })


  it('should see updated subnet config', (done) => {

    agent
      .get('/subnetConfig')
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.status == 200)
        assert(Object.keys(res.body).length > 0, 'missing subnet config')
        //assert(res.body.LeaseTime == "25h0m0s")
        assert(res.body.TinyNets.length == 1)
        assert(res.body.TinyNets[0] == "192.168.100.0/24")
        done()
      })
  })

})
