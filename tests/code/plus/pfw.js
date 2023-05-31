const agent = require('../agent')
const assert = require('assert')

describe('pfw', () => {
  it('get config', (done) => {
    agent
      .get('/plugins/pfw/config')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(
          Object.keys(res.body).includes('ForwardingRules'),
          'no forward rules'
        )
        assert(Object.keys(res.body).includes('BlockRules'), 'no block rules')

        assert(typeof res.body.Variables === 'object', 'no variables')

        done()
      })
  })

  it('mask token', (done) => {
    agent
      .get('/plugins/pfw/config')
      .expect(200)
      .end((err, res) => {
        assert(res.body.APIToken == '*masked*', 'no forward rules')

        done()
      })
  })

  it('block tcp always', (done) => {
    let block = {
      RuleName: 'Block TCP test',
      Time: { Days: [], Start: '', End: '' },
      Condition: '',
      Protocol: 'tcp',
      Client: { Group: 'wan', Identity: '', SrcIP: '' },
      DstIP: '1.2.3.4',
      DstPort: ''
    }

    agent
      .put('/plugins/pfw/block')
      .send(block)
      .expect(200)
      .end((err, res) => {
        //done()
        agent
          .get('/plugins/pfw/config')
          .expect(200)
          .end((err, res) => {
            assert(res.body.BlockRules.length > 0, 'failed to add block')

            let id = 0

            //cleanup & verify delete works
            agent
              .delete(`/plugins/pfw/block/${id}`)
              .send({})
              .expect(200)
              .end((err, res) => {
                done()
              })
          })
      })
  })

  it('block udp weekdays', (done) => {
    let block = {
      RuleName: 'NewFlow',
      Time: { Days: [0, 1, 1, 1, 1, 1, 0], Start: '10:00', End: '11:00' },
      Condition: '',
      Protocol: 'udp',
      Client: { Group: 'dns', Identity: '', SrcIP: '' },
      DstIP: '1.2.3.4',
      DstPort: ''
    }

    agent
      .put('/plugins/pfw/block')
      .send(block)
      .expect(200)
      .end((err, res) => {
        //done()
        agent
          .get('/plugins/pfw/config')
          .expect(200)
          .end((err, res) => {
            assert(res.body.BlockRules.length > 0, 'failed to add block')

            let id = 0

            //cleanup & verify delete works
            agent
              .delete(`/plugins/pfw/block/${id}`)
              .send({})
              .expect(200)
              .end((err, res) => {
                done()
              })
          })
      })
  })
})
