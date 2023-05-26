const agent = require('../agent')
const assert = require('assert')

describe('get interfaces', () => {
  it('should get status', (done) => {
    agent
      .get('/interfacesConfiguration')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.body.length > 0, 'missing interface status')
        let passed = 0;
        for (let i = 0; i < res.body.length; i++){
         let iface = res.body[i]
         if (iface.Name == "wlan1") {
          assert(iface.Type == "AP")
          assert(iface.Enabled == true)
          passed++;
         }
         if (iface.Name == "wlan0") {
          assert(iface.Type == "AP")
          assert(iface.Enabled == false)
          passed++;
         }
         if (iface.Name == "eth0") {
          assert(iface.Type == "Uplink")
          passed++;
         }
        }
        assert(passed == 3)
        done()
      })
  })
})


describe('calc channel', () => {
  let chanData = {"Channel":36,"Mode":"a","Bandwidth":80,"HT_Enable":true,"VHT_Enable":true,"HE_Enable":true,"He_mu_beamformer":0,"He_su_beamformee":0,"He_su_beamformer":0,"Ieee80211ax":0}

  it('should calcluate channels', (done) => {
    agent
      .put('/hostapd/calcChannel')
      .send(chanData)
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        let expected ={
          Vht_oper_centr_freq_seg0_idx: 42,
          He_oper_centr_freq_seg0_idx: 42,
          Vht_oper_chwidth: 1,
          He_oper_chwidth: 1,
          Freq1: 5180,
          Freq2: 5210,
          Freq3: 0}

        assert(JSON.stringify(res.body) === JSON.stringify(expected))
        done()
      })
  })
})



describe('enable extra bss', () => {
  let extraData = {"Ssid":"TestLab-extra","Bssid":"02:00:00:00:01:00","Wpa":"1"}
  it('should set extra bss', (done) => {
    agent
      .put('/hostapd/wlan1/enableExtraBSS')
      .send(extraData)
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        assert(res.status == 200)
        done()
      })
  })

  it("should show extra bss enabled", (done) => {
   agent
     .get('/interfacesConfiguration')
     .expect(200)
     .expect('Content-Type', /json/)
     .end((err, res) => {
       assert(res.body.length > 0, 'missing interface status')
       let passed = 0
       for (let i = 0; i < res.body.length; i++) {
        let iface = res.body[i]
        if (iface.Name == "wlan1") {
         let extra = iface.ExtraBSS
         assert(extra.length === 1)
         assert(extra[0].Ssid === 'TestLab-extra')
         assert(extra[0].Wpa === '1')
         assert(extra[0].WpaKeyMgmt === 'WPA-PSK WPA-PSK-SHA256')
         assert(extra[0].DisableIsolation === false)
         passed++;
        }
       }

       assert(passed == 1)
       done()
      })

  })


  it("should change channel to 149", (done) => {
   let newConfig = {"Vht_oper_centr_freq_seg0_idx":155,
                    "He_oper_centr_freq_seg0_idx":155,
                    "Vht_oper_chwidth":1,
                    "He_oper_chwidth":1,
                    "Freq1":5745,
                    "Freq2":5775,
                    "Freq3":0,
                    "Channel":149,
                    "Mode":"a",
                    "Bandwidth":80,
                    "HT_Enable":true,
                    "VHT_Enable":true,
                    "HE_Enable":true,
                    "He_mu_beamformer":0,
                    "He_su_beamformee":0,
                    "He_su_beamformer":0,
                    "Ieee80211ax":0,
                    "Hw_mode":"a"}
   agent
     .put('/hostapd/wlan1/config')
     .send(newConfig)
     .expect(200)
     .expect('Content-Type', /json/)
     .end((err, res) => {
       assert(Object.keys(res.body).length > 0, 'missing config')
       let config = res.body
       assert(config.channel == 149)
       done()
      })

  })

  it("should change channel back to 36", (done) => {
   let newConfig = {"Vht_oper_centr_freq_seg0_idx":42,
                    "He_oper_centr_freq_seg0_idx":42,
                    "Vht_oper_chwidth":1,
                    "He_oper_chwidth":1,
                    "Freq1":5180,
                    "Freq2":5210,
                    "Freq3":0,
                    "Channel":36,
                    "Mode":"a",
                    "Bandwidth":80,
                    "HT_Enable":true,
                    "VHT_Enable":true,
                    "HE_Enable":true,
                    "He_mu_beamformer":0,
                    "He_su_beamformee":0,
                    "He_su_beamformer":0,
                    "Ieee80211ax":0,
                    "Hw_mode":"a"}
   agent
     .put('/hostapd/wlan1/config')
     .send(newConfig)
     .expect(200)
     .expect('Content-Type', /json/)
     .end((err, res) => {
       assert(Object.keys(res.body).length > 0, 'missing config')
       let config = res.body
       assert(config.channel == 36)
       done()
      })
  })

  //TBD: would be good to
  // verify stations connect to channel 149
  // verify stations connect to WPA1 BSS 
})
