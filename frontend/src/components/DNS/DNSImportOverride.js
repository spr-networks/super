import React from 'react'
import PropTypes from 'prop-types'
import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'

import {
  Button,
  ButtonText,
  FormControl,
  FormControlError,
  FormControlErrorText,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  VStack,
  HStack,
  Textarea,
  TextareaInput
} from '@gluestack-ui/themed'

const safeSearchTemplate = [
  {
    Type: 'permit',
    Domain: 'www.google.com.',
    ResultIP: '',
    ResultCNAME: 'forcesafesearch.google.com.',
    ClientIP: '*'
  },
  {
    Type: 'permit',
    Domain: 'www.youtube.com.',
    ResultIP: '',
    ResultCNAME: 'restrict.youtube.com.',
    ClientIP: '*'
  },
  {
    Type: 'permit',
    Domain: 'm.youtube.com.',
    ResultIP: '',
    ResultCNAME: 'restrict.youtube.com.',
    ClientIP: '*'
  },
  {
    Type: 'permit',
    Domain: 'youtubei.googleapis.com.',
    ResultIP: '',
    ResultCNAME: 'restrict.youtube.com.',
    ClientIP: '*'
  },
  {
    Type: 'permit',
    Domain: 'youtube.googleapis.com.',
    ResultIP: '',
    ResultCNAME: 'restrict.youtube.com.',
    ClientIP: '*'
  },
  {
    Type: 'permit',
    Domain: 'www.youtube-nocookie.com.',
    ResultIP: '',
    ResultCNAME: 'restrict.youtube.com.',
    ClientIP: '*'
  },
  {
    Type: 'permit',
    Domain: 'bing.com.',
    ResultIP: '',
    ResultCNAME: 'strict.bing.com.',
    ClientIP: '*'
  },
  {
    Type: 'permit',
    Domain: 'www.bing.com.',
    ResultIP: '',
    ResultCNAME: 'strict.bing.com.',
    ClientIP: '*'
  },
  {
    Type: 'permit',
    Domain: 'duckduckgo.com.',
    ResultIP: '',
    ResultCNAME: 'safe.duckduckgo.com.',
    ClientIP: '*'
  },
  {
    Type: 'permit',
    Domain: 'www.duckduckgo.com.',
    ResultIP: '',
    ResultCNAME: 'safe.duckduckgo.com.',
    ClientIP: '*'
  },
  {
    Type: 'permit',
    Domain: 'start.duckduckgo.com.',
    ResultIP: '',
    ResultCNAME: 'safe.duckduckgo.com.',
    ClientIP: '*'
  },
  {
    Type: 'permit',
    Domain: 'duck.com.',
    ResultIP: '',
    ResultCNAME: 'safe.duckduckgo.com.',
    ClientIP: '*'
  },
  {
    Type: 'permit',
    Domain: 'www.duck.com.',
    ResultIP: '',
    ResultCNAME: 'safe.duckduckgo.com.',
    ClientIP: '*'
  },
  {
    Type: 'permit',
    Domain: 'pixabay.com.',
    ResultIP: '',
    ResultCNAME: 'safesearch.pixabay.com.',
    ClientIP: '*'
  }
]

const doh = [
  {
    Type: 'block',
    Domain: 'doh.dns.apple.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.dns.apple.com.v.aaplimg.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'mask.icloud.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'mask-h2.icloud.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'mask-api.fe.apple-dns.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.aaflalo.me.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns-nyc.aaflalo.me.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.adguard.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns-family.adguard.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.alekberg.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns2.alekberg.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dnsse.alekberg.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.alidns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.aa.net.uk.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.42l.fr.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dohtrial.att.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh-fi.blahdns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh-jp.blahdns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh-de.blahdns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh-sg.blahdns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.brahma.world.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'private.canadianshield.cira.ca.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'protected.canadianshield.cira.ca.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'family.canadianshield.cira.ca.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.captnemo.in.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'resolver1.opendns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'resolver2.opendns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'resolver1-fs.opendns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'resolver2-fs.opendns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'resolver1.ipv6-sandbox.opendns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'resolver2.ipv6-sandbox.opendns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.opendns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.opendns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.familyshield.opendns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.umbrella.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.umbrella.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'family-filter-dns.cleanbrowsing.org.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'adult-filter-dns.cleanbrowsing.org.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'security-filter-dns.cleanbrowsing.org.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.cleanbrowsing.org.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'one.one.one.one.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'mozilla.cloudflare-dns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: '1dot1dot1dot1.cloudflare-dns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'cloudflare-dns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns64.cloudflare-dns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'security.cloudflare-dns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'family.cloudflare-dns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'chrome.cloudflare-dns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.xfinity.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'ns1.recursive.dnsbycomodo.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'ns2.recursive.dnsbycomodo.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'commons.host.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.containerpi.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dohdot.coxlab.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.crypto.sx.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh-ipv6.crypto.sx.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.digitale-gesellschaft.ch.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.li.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns1.dnscrypt.ca.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns2.dnscrypt.ca.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dnsforge.de.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.dnshome.de.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.dnslify.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'a.ns.dnslify.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'b.ns.dnslify.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'a.safe.ns.dnslify.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'b.safe.ns.dnslify.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'a.family.ns.dnslify.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'b.family.ns.dnslify.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.seby.io.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh-2.seby.io.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.dns.sb.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'resolver1.dyndnsinternetguide.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'resolver2.dyndnsinternetguide.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'use-application-dns.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.ffmuc.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.applied-privacy.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.233py.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'i.233py.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'wdns.233py.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'ndns.233py.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'sdns.233py.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.google.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'google-public-dns-a.google.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'google-public-dns-b.google.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns64.dns.google.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.hostux.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'ibuki.cgnat.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'ibksturm.synology.me.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'jcdns.fun.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'resolver-eu.lelux.fi.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.libredns.gr.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.mrkaran.dev.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.dns-over-https.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.nextdns.io.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'uncensored.any.dns.nixnet.xyz.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'adblock.any.dns.nixnet.xyz.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'uncensored.lv1.dns.nixnet.xyz.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'adblock.lv1.dns.nixnet.xyz.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'uncensored.ny1.dns.nixnet.xyz.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'adblock.ny1.dns.nixnet.xyz.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'uncensored.lux1.dns.nixnet.xyz.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'adblock.lux1.dns.nixnet.xyz.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.oszx.co.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.pumplex.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.centraleu.pi-dns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.northeu.pi-dns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.westus.pi-dns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.eastus.pi-dns.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.powerdns.org.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.quad9.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns9.quad9.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns10.quad9.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns11.quad9.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'rpz-public-resolver1.rrdns.pch.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns-nosec.quad9.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.twnic.tw.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'v6.rubyfish.cn.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.rubyfish.cn.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'ea-dns.rubyfish.cn.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'uw-dns.rubyfish.cn.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.securedns.eu.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'ads-doh.securedns.eu.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh-01.spectrum.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh-02.spectrum.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh-03.spectrum.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'fi.doh.dns.snopyta.org.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.switch.ch.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.tiar.app.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.tiarap.org.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'jp.tiar.app.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'jp.tiarap.org.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.t53.de.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.xfinity.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.dnsoverhttps.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.dnswarden.com.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'doh.appliedprivacy.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'public.dns.iij.jp.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'jp.gridns.xyz.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'dns.flatuslifir.is.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'odvr.nic.cz.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'rumpelsepp.org.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'ordns.he.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'rdns.faelix.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  },
  {
    Type: 'block',
    Domain: 'adfree.usableprivacy.net.',
    ResultIP: '',
    ResultCNAME: '',
    ClientIP: '*'
  }
]

export default class DNSImportOverride extends React.Component {
  // Template options
  templates = {
    basic:
      '[{"Type": "block", "Domain": "example.com.", "ResultIP": "", "ResultCNAME": "", "ClientIP": "*"}]',
    redirect:
      '[{"Type": "permit", "Domain": "redirect.example.com.", "ResultIP": "10.0.0.1", "ResultCNAME": "", "ClientIP": "*"}]',
    safesearch: JSON.stringify(safeSearchTemplate),
    doh: JSON.stringify(doh)
  }

  state = {
    listName: '',
    jsonContent: '',
    isProcessing: false,
    check: {
      listName: '',
      jsonContent: ''
    }
  }

  constructor(props) {
    super(props)
    this.state.listName = props.listName || ''
    if (this.state.listName == 'Default') {
      this.state.listName = 'New List'
    }
    this.state.jsonContent = this.templates.basic

    this.handleChange = this.handleChange.bind(this)
    this.validateField = this.validateField.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
    this.loadTemplate = this.loadTemplate.bind(this)
  }

  loadTemplate(templateName) {
    const content = this.templates[templateName]
    this.state.listName = templateName
    this.handleChange('jsonContent', content)
  }

  validateField(name, value) {
    let check = { ...this.state.check }

    if (name === 'listName' && !value.trim()) {
      check.listName = 'has-danger'
    } else if (name === 'listName') {
      check.listName = ''
    }

    if (name === 'jsonContent') {
      try {
        if (!value.trim()) {
          check.jsonContent = 'has-danger'
        } else {
          const parsed = JSON.parse(value)

          if (!Array.isArray(parsed)) {
            check.jsonContent = 'has-danger'
          } else {
            const isValid = parsed.every(
              (entry) =>
                typeof entry === 'object' &&
                typeof entry.Type === 'string' &&
                ['block', 'permit'].includes(entry.Type) &&
                typeof entry.Domain === 'string' &&
                entry.Domain.endsWith('.') &&
                entry.Domain.length > 0 &&
                (entry.ResultCNAME == '' || entry.ResultCNAME.endsWith('.'))
            )
            check.jsonContent = isValid ? '' : 'has-danger'
          }
        }
      } catch (e) {
        check.jsonContent = 'has-danger'
      }
    }

    this.setState({ check })
    return Object.values(check).every((v) => !v)
  }

  handleChange(name, value) {
    this.validateField(name, value)
    this.setState({ [name]: value })
  }

  async handleSubmit() {
    if (
      !this.validateField('listName', this.state.listName) ||
      !this.validateField('jsonContent', this.state.jsonContent)
    ) {
      return
    }

    this.setState({ isProcessing: true })

    try {
      const entries = JSON.parse(this.state.jsonContent)

      // Process entries sequentially
      for (const entry of entries) {
        const override = {
          Type: entry.Type,
          Domain: entry.Domain.endsWith('.')
            ? entry.Domain
            : entry.Domain + '.',
          ResultIP: entry.ResultIP || '',
          ResultCNAME: entry.ResultCNAME || '',
          ClientIP: entry.ClientIP || '*',
          Expiration: entry.Expiration || 0
        }

        await blockAPI.putOverride(this.state.listName, override)
      }

      if (this.props.notifyChange) {
        this.props.notifyChange('listimport')
      }
    } catch (error) {
      let errorMessage = await error.response.text()
      this.context.error('Import Failed: ' + errorMessage)
    } finally {
      this.setState({ isProcessing: false })
    }
  }

  render() {
    return (
      <VStack space="md">
        <FormControl
          isRequired
          isInvalid={this.state.check.listName === 'has-danger'}
        >
          <FormControlLabel>
            <FormControlLabelText>List Name</FormControlLabelText>
          </FormControlLabel>

          <Input size="md" variant="underlined">
            <InputField
              type="text"
              value={this.state.listName}
              onChangeText={(value) => this.handleChange('listName', value)}
              placeholder="Enter list name"
            />
          </Input>
          {this.state.check.listName === 'has-danger' ? (
            <FormControlError>
              <FormControlErrorText>List name is required</FormControlErrorText>
            </FormControlError>
          ) : null}
        </FormControl>

        <FormControl
          isRequired
          isInvalid={this.state.check.jsonContent === 'has-danger'}
        >
          <FormControlLabel>
            <FormControlLabelText>JSON Content</FormControlLabelText>
          </FormControlLabel>

          <HStack space="sm" mb="$2" overflowX="auto">
            <Button
              variant="outline"
              size="sm"
              onPress={() => this.loadTemplate('safesearch')}
            >
              <ButtonText>Safe Search</ButtonText>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPress={() => this.loadTemplate('doh')}
            >
              <ButtonText>DOH</ButtonText>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPress={() => this.loadTemplate('basic')}
            >
              <ButtonText>Basic Block</ButtonText>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPress={() => this.loadTemplate('redirect')}
            >
              <ButtonText>Redirect Example</ButtonText>
            </Button>
          </HStack>

          <Textarea size="md" h={200}>
            <TextareaInput
              value={this.state.jsonContent}
              onChangeText={(value) => this.handleChange('jsonContent', value)}
              placeholder="Paste JSON array of override entries"
            />
          </Textarea>

          {this.state.check.jsonContent === 'has-danger' ? (
            <FormControlError>
              <FormControlErrorText>
                Please enter valid JSON array of override entries
              </FormControlErrorText>
            </FormControlError>
          ) : (
            <FormControlHelper>
              <FormControlHelperText>
                Expected format is an array of entries. Domain/CNAME ends with
                '.', each entry should have Type (block/permit), Domain, and
                optional ResultIP, ResultCNAME, ClientIP, and Expiration fields.
              </FormControlHelperText>
            </FormControlHelper>
          )}
        </FormControl>

        <Button
          action="primary"
          variant="solid"
          onPress={this.handleSubmit}
          isDisabled={this.state.isProcessing}
        >
          <ButtonText>
            {this.state.isProcessing ? 'Importing...' : 'Import Overrides'}
          </ButtonText>
        </Button>
      </VStack>
    )
  }
}

DNSImportOverride.propTypes = {
  listName: PropTypes.string,
  notifyChange: PropTypes.func.isRequired
}

DNSImportOverride.contextType = AlertContext
