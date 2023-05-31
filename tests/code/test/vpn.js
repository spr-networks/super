const agent = require('../agent')
const assert = require('assert')

describe('status', () => {
  it('should get status', (done) => {
    agent
      .get('/plugins/wireguard/status')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(Object.keys(res.body).length > 0, 'missing interface status')

        done()
      })
  })
})

describe('generate keys', () => {
  it('should generate keys', (done) => {
    agent
      .get('/plugins/wireguard/genkey')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(
          Object.keys(res.body).includes('PrivateKey'),
          'missing private key'
        )
        assert(
          Object.keys(res.body).includes('PublicKey'),
          'missing public key'
        )

        done()
      })
  })
})

describe('adding and removing peer', () => {
  //TODO add test where we specify PublicKey

  let addedPeer = null

  it('should add a peer', (done) => {
    let peer = {}

    agent
      .put('/plugins/wireguard/peer')
      .send(peer)
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .end((err, res) => {
        assert(res.body.Interface.PrivateKey.length > 0, 'missing PrivateKey')
        assert(res.body.Peer.PublicKey.length > 0, 'missing PublicKey')

        done()
      })
  })

  it('should list peers', (done) => {
    agent
      .get('/plugins/wireguard/peers')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.body.length > 0, 'missing peers')

        addedPeer = res.body[res.body.length - 1]

        done()
      })
  })

  it('should remove added peer', (done) => {
    agent
      .delete('/plugins/wireguard/peer')
      .send(addedPeer)
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        //assert(Object.keys(res.body).length > 0, 'missing peers')

        done()
      })
  })
})
