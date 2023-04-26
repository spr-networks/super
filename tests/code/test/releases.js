const agent = require('../agent')
const assert = require('assert')


describe('releases', () => {
  it('should get release info', (done) => {
    agent
      .get('/release')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.body.Current != "", 'missing current')
        assert(res.body.CustomChannel != "", 'missing custom channel')
        assert(res.body.CustomVersion != "", 'missing custom version')
        done()
      })
  })

  it('should get release channels', (done) => {
    agent
      .get('/releaseChannels')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.body.includes('main'), 'missing stable')
        assert(res.body.includes('-dev'), 'missing dev channel')
        done()
      })
  })

  it('should get releases available', (done) => {
    //return null for no container specified
    agent
      .get('/releasesAvailable')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.body == null)
        done()
      })
  })

  it('should get releases available', (done) => {
    //return a list for superd
    agent
      .get('/releasesAvailable?container=super_superd')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.body.length > 2)
        assert(res.body.includes("latest"))
        assert(res.body.includes("latest-dev"))
        done()
      })
  })

  it('should get the running version', (done) => {
    agent
      .get('/version')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.body != "", 'missing version')
        done()
      })
  })


})
