const { request, request_auth } = require('../agent')

describe('auth', () => {
  it('should return 401', (done) => {
    request.get('/status').expect(401, done)
  })

  it('should accept token', (done) => {
    request_auth
      .get('/status')
      .expect(200)
      .expect(/Online/, done)
  })
})
