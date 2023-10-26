import { Platform } from 'react-native'
import PropTypes from 'prop-types'
import {
  faBan,
  faBox,
  faBroadcastTower,
  faCircleArrowRight,
  faClock,
  faEllipsis,
  faForward,
  faObjectGroup,
  faRepeat,
  faTag,
  faTags
} from '@fortawesome/free-solid-svg-icons'

import {
  BanIcon,
  BoxIcon,
  BoxesIcon,
  RadioTowerIcon,
  ArrowRightCircleIcon,
  ClockIcon,
  MoreHorizontalIcon,
  ArrowRightFromLineIcon,
  RepeatIcon,
  SplitIcon,
  TagIcon,
  TagsIcon,
  WaypointsIcon
} from 'lucide-react-native'

import { BrandIcons } from 'IconUtils'

import { api, deviceAPI, wifiAPI } from 'api'
import { pfwAPI } from 'api/Pfw'
import {
  numToDays,
  daysToNum,
  toCron,
  parseClientIPOrIdentity,
  toOption
} from './Utils'

const defaultOptions = async function (name) {
  if (name.endsWith('Port')) {
    return [
      { label: 'http', value: '80' },
      { label: 'https', value: '443' },
      { label: 'ssh', value: '22' },
      { label: 'telnet', value: '23' },
      { label: '3000', value: '3000' },
      { label: '8080', value: '8080' }
    ]
  }

  if (name == 'OriginalDstIP') {
    let addrs = await api.get('/ip/addr')
    addrs = addrs
      .map((a) => {
        let ais = a.addr_info.filter((ai) => ai.family == 'inet')
        return ais
      })
      .filter((ais) => ais && ais.length)
      .map((ais) => ais[0].local)
    let opts = addrs.map((value) => {
      return { label: value, value }
    })
    return opts
  }
}

const triggers = [
  {
    title: 'Always',
    cardType: 'trigger',
    description: 'Always run the selected trigger',
    color: '$violet300',
    icon: RepeatIcon,
    params: [],
    values: {},
    preSubmit: function () {
      return { Time: { Days: [], Start: '', End: '' }, Condition: '' }
    }
  },
  {
    title: 'Date',
    cardType: 'trigger',
    description: 'Trigger on selected date and time',
    color: '$violet300',
    icon: ClockIcon,
    params: [
      {
        name: 'days',
        type: PropTypes.array,
        description: 'mon, tue. weekdays, weekend'
      },
      {
        name: 'from',
        type: PropTypes.string,
        format: /^\d{2}:\d{2}$/,
        description: 'starting time. format: HH:MM'
      },
      {
        name: 'to',
        type: PropTypes.string,
        format: /^\d{2}:\d{2}$/,
        description: 'ending time. format: HH:MM'
      }
    ],
    values: {
      days: 'mon,tue,wed',
      from: '10:00',
      to: '11:00'
    },
    getOptions: function (name = 'days') {
      if (name == 'days') {
        let days = [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday'
        ]

        return days.map((label) => {
          return { label, value: label.slice(0, 3).toLowerCase() }
        })
      }

      //NOTE from,to use TimeSelect component
    },
    preSubmit: function () {
      let { days, from, to } = this.values
      //let CronExpr = toCron(days, from, to)
      let Days = new Array(7).fill(0),
        Start = from,
        End = to

      daysToNum(days).map((idx) => (Days[idx] = 1))

      return { Time: { Days, Start, End }, Condition: '' }
    }
  },
  {
    title: 'Incoming GET',
    hidden: true,
    cardType: 'trigger',
    description: 'Trigger this card by sending a GET request',
    color: '$red400',
    icon: RadioTowerIcon,
    params: [{ name: 'event', type: PropTypes.string }]
  }
]

//NOTE: titles have to match FlowList.js
// or they may become invisible.
const actions = [
  {
    title: 'Block TCP',
    cardType: 'action',
    description:
      'Block TCP from source address or group to destination address',
    color: '$red400',
    icon: BanIcon,
    params: [
      {
        name: 'Protocol',
        hidden: true,
        type: PropTypes.string
      },
      {
        name: 'Client',
        type: PropTypes.string,
        description: 'IP/CIDR or Group'
      },
      { name: 'DstIP', type: PropTypes.string, description: 'IP/CIDR' },
      {
        name: 'DstPort',
        type: PropTypes.string,
        description: 'Dest port, range of ports, or empty for all'
      }
    ],
    values: {
      Protocol: 'tcp',
      Client: '0.0.0.0',
      DstIP: '',
      DstPort: ''
    },
    getOptions: function (name = 'DstPort') {
      if (name == 'DstPort') {
        return defaultOptions(name)
      }

      return []
    },
    preSubmit: async function () {
      let Client = parseClientIPOrIdentity(this.values.Client)

      return { ...this.values, Client }
    },
    submit: function (data, flow) {
      let isUpdate = flow.index !== undefined

      if (isUpdate) {
        return pfwAPI.updateBlock(data, flow.index)
      }

      return pfwAPI.addBlock(data)
    }
  },
  {
    title: 'Block UDP',
    cardType: 'action',
    description:
      'Block UDP from source address or group to destination address',
    color: '$warning400',
    icon: BanIcon,
    params: [
      {
        name: 'Protocol',
        hidden: true,
        type: PropTypes.string
      },
      {
        name: 'Client',
        type: PropTypes.string,
        description: 'IP/CIDR or Group'
      },
      { name: 'DstIP', type: PropTypes.string, description: 'IP/CIDR' },
      {
        name: 'DstPort',
        type: PropTypes.string,
        description: 'Dest port, range of ports, or empty for all'
      }
    ],
    values: {
      Protocol: 'udp',
      Client: '0.0.0.0',
      DstIP: '',
      DstPort: ''
    },
    getOptions: function (name = 'DstPort') {
      if (name == 'DstPort') {
        return defaultOptions(name)
      }

      return []
    },
    //NOTE same as TCP
    preSubmit: async function () {
      return {
        ...this.values,
        Client: parseClientIPOrIdentity(this.values.Client)
      }
    },
    submit: function (data, flow) {
      let isUpdate = flow.index !== undefined

      if (isUpdate) {
        return pfwAPI.updateBlock(data, flow.index)
      }

      return pfwAPI.addBlock(data)
    }
  },
  {
    title: 'Forward TCP',
    cardType: 'action',
    description:
      'Forward TCP for specified source to destination address and port',
    color: '$emerald600',
    icon: SplitIcon,
    params: [
      {
        name: 'Protocol',
        hidden: true,
        type: PropTypes.string
      },
      {
        name: 'Client',
        type: PropTypes.string,
        description: 'IP/CIDR or Group'
      },
      { name: 'OriginalDstIP', type: PropTypes.string, description: 'IP/CIDR' },
      {
        name: 'OriginalDstPort',
        type: PropTypes.string,
        description:
          'Original Destination port, range of ports, or empty for all'
      },
      { name: 'DstIP', type: PropTypes.string, description: 'IP/CIDR' },
      {
        name: 'DstPort',
        type: PropTypes.string,
        description: 'New Destination port, range of ports, or empty for all'
      }
    ],
    values: {
      Protocol: 'tcp',
      Client: '0.0.0.0',
      DstPort: '',
      DstIP: '0.0.0.0',
      OriginalDstIP: '0.0.0.0',
      OriginalDstPort: ''
    },
    getOptions: async function (name = 'DstPort') {
      if (['DstPort', 'OriginalDstPort'].includes(name)) {
        return defaultOptions(name)
      }

      if (name == 'OriginalDstIP') {
        return await defaultOptions(name)
      }

      return []
    },
    preSubmit: async function () {
      return {
        ...this.values,
        Client: parseClientIPOrIdentity(this.values.Client)
      }
    },
    submit: function (data, flow) {
      let isUpdate = flow.index !== undefined

      if (isUpdate) {
        return pfwAPI.updateForward(data, flow.index)
      }

      return pfwAPI.addForward(data)
    }
  },
  {
    title: 'Forward UDP',
    cardType: 'action',
    description:
      'Forward UDP for specified source to destination address and port',
    color: '$emerald400',
    icon: SplitIcon,
    params: [
      {
        name: 'Protocol',
        hidden: true,
        type: PropTypes.string
      },
      {
        name: 'Protocol',
        hidden: true,
        type: PropTypes.string
      },
      {
        name: 'Client',
        type: PropTypes.string,
        description: 'IP/CIDR or Group'
      },
      { name: 'OriginalDstIP', type: PropTypes.string, description: 'IP/CIDR' },
      {
        name: 'OriginalDstPort',
        type: PropTypes.string,
        description:
          'Original Destination port, range of ports, or empty for all'
      },
      { name: 'DstIP', type: PropTypes.string, description: 'IP/CIDR' },
      {
        name: 'DstPort',
        type: PropTypes.string,
        description: 'New Destination port, range of ports, or empty for all'
      }
    ],
    values: {
      Protocol: 'udp',
      Client: '0.0.0.0',
      DstIP: '0.0.0.0',
      OriginalDstIP: '',
      OriginalDstPort: '',
      DstPort: ''
    },
    getOptions: async function (name = 'DstPort') {
      if (['DstPort', 'OriginalDstPort'].includes(name)) {
        return defaultOptions(name)
      }

      if (name == 'OriginalDstIP') {
        return await defaultOptions(name)
      }

      return []
    },
    preSubmit: async function () {
      return {
        ...this.values,
        Client: parseClientIPOrIdentity(this.values.Client)
      }
    },
    submit: function (data, flow) {
      let isUpdate = flow.index !== undefined

      if (isUpdate) {
        return pfwAPI.updateForward(data, flow.index)
      }

      return pfwAPI.addForward(data)
    }
  },
  {
    title: 'Forward to Site VPN or Uplink Interface',
    cardType: 'action',
    description: 'Forward traffic over a Site VPN Gateway or Uplink Interface',
    color: '$purple600',
    icon: WaypointsIcon,
    params: [
      {
        name: 'Client',
        type: PropTypes.string,
        description: 'IP/CIDR or Group'
      },
      { name: 'OriginalDstIP', type: PropTypes.string, description: 'IP/CIDR' },
      {
        name: 'DstInterface',
        type: PropTypes.string,
        description: 'Destination site (ex: site0)'
      }
    ],
    values: {
      Client: '0.0.0.0',
      OriginalDstIP: '0.0.0.0',
      DstInterface: ''
    },
    getOptions: function (name = 'DstInterface') {
      if (name == 'DstInterface') {
        return new Promise((resolve, reject) => {
          pfwAPI.config().then((config) => {
            let s = []
            for (
              let i = 0;
              config.SiteVPNs != null && i < config.SiteVPNs.length;
              i++
            ) {
              s.push({ label: 'site' + i, value: 'site' + i })
            }

            // pull in interfaces also
            wifiAPI.interfacesConfiguration().then((ifaces) => {
              for (let iface of ifaces) {
                if (
                  iface.Type == 'Uplink' &&
                  iface.Subtype != 'pppup' &&
                  iface.Enabled == true
                ) {
                  s.push({ label: iface.Name, value: iface.Name })
                }
              }
              resolve(s)
            })
          })
        })
      }
    },
    preSubmit: async function () {
      return {
        ...this.values,
        Client: parseClientIPOrIdentity(this.values.Client)
      }
    },
    submit: function (data, flow) {
      let isUpdate = flow.index !== undefined

      if (isUpdate) {
        return pfwAPI.updateForward(data, flow.index)
      }

      return pfwAPI.addForward(data)
    }
  },
  {
    title: 'Set Device Groups',
    cardType: 'action',
    description: 'A device joins a group only when conditions are met',
    color: '$cyan500',
    icon: BoxesIcon,
    params: [
      {
        name: 'Client',
        type: PropTypes.string
      },
      {
        name: 'Groups',
        type: PropTypes.array,
        description: 'Groups'
      }
    ],
    values: {
      Client: '',
      Groups: []
    },
    getOptions: function (value = 'Groups') {
      return new Promise((resolve, reject) => {
        deviceAPI.groups().then((groups) => resolve(groups.map(toOption)))
      })
    },
    preSubmit: async function () {
      let Client = parseClientIPOrIdentity(this.values.Client)
      return { ...this.values, Client }
    },
    submit: function (data, flow) {
      let isUpdate = flow.index !== undefined
      console.log('submit:', data, flow)

      if (isUpdate) {
        return pfwAPI.updateGroups(data, flow.index)
      }

      return pfwAPI.addGroups(data)
    }
  },
  {
    title: 'Set Device Tags',
    cardType: 'action',
    description: 'Assign device tags when conditions are met',
    color: '$cyan500',
    icon: TagsIcon,
    params: [
      {
        name: 'Client',
        type: PropTypes.string
      },
      {
        name: 'Tags',
        type: PropTypes.array,
        description: 'Tags'
      }
    ],
    values: {
      Client: '',
      Tags: []
    },
    getOptions: function (value = 'Tags') {
      return new Promise((resolve, reject) => {
        deviceAPI.tags().then((tags) => {
          resolve(tags.map(toOption))
        })
      })
    },
    preSubmit: async function () {
      let Client = {}
      try {
        Client = parseClientIPOrIdentity(this.values.Client)
      } catch (err) {
        console.log('parse fail:', err)
      }

      return { ...this.values, Client }
    },
    submit: function (data, flow) {
      let isUpdate = flow.index !== undefined

      if (isUpdate) {
        return pfwAPI.updateTags(data, flow.index)
      }

      return pfwAPI.addTags(data)
    }
  },
  {
    title: 'Docker Forward TCP',
    cardType: 'action',
    description:
      'Forward TCP for specified source to exposed port for a local container',
    color: '$blue500',
    icon: BrandIcons.Docker, //SplitIcon, //Platform.OS == 'ios' ? SplitIcon : 'Docker',
    params: [
      {
        name: 'Protocol',
        type: PropTypes.string,
        hidden: true
      },
      {
        name: 'Client',
        type: PropTypes.string,
        description: 'IP/CIDR or Group'
      },
      {
        name: 'OriginalDstIP',
        type: PropTypes.string,
        description: 'IP/CIDR'
      },
      {
        name: 'OriginalDstPort',
        type: PropTypes.string,
        description:
          'Original Destination port, range of ports, or empty for all'
      },
      {
        name: 'Container',
        type: PropTypes.string,
        description: 'Docker container id'
      },
      {
        name: 'ContainerPort',
        type: PropTypes.string,
        description: 'Port exposed by container'
      },
      {
        name: 'DstIP',
        type: PropTypes.string,
        description: 'IP/CIDR',
        hidden: true
      },
      {
        name: 'DstPort',
        type: PropTypes.string,
        description: 'New Destination port, range of ports, or empty for all',
        hidden: true
      }
    ],
    values: {
      Protocol: 'tcp',
      Client: 'lan',
      Container: 'container',
      ContainerPort: '8080',
      OriginalDstIP: '192.168.2.1',
      OriginalDstPort: '8080',
      DstPort: '8080',
      DstIP: '0.0.0.0'
    },
    niceDockerName: function (c) {
      return (c.Names[0] || c.Id.substr(0, 8)).replace(/^\//, '')
    },
    niceDockerLabel: function (c) {
      let name = this.niceDockerName(c)
      let ports = c.Ports.filter((p) => p.IP != '::').map((p) => p.PublicPort) // p.Type
      return `${name}:${ports}`
    },
    getOptions: async function (name = 'DstPort') {
      if (name.endsWith('Port') || name == 'OriginalDstIP') {
        return await defaultOptions(name)
      }

      // get containers from docker api
      if (name == 'Container') {
        let containers = await api.get('/info/docker')

        let opts = containers
          .filter((c) => c.Ports && c.Ports.length)
          .map((c) => {
            return {
              label: this.niceDockerLabel(c),
              value: this.niceDockerName(c)
            }
          })

        return opts
      }

      return []
    },
    preSubmit: async function () {
      let containers = await api.get('/info/docker')
      let container = containers.find(
        (c) => this.niceDockerName(c) == this.values.Container
      )

      if (!container) {
        console.error('no container??', this.values)
        return
      }

      let DstIP = container.NetworkSettings.Networks.bridge.IPAddress
      let DstPort = this.values.ContainerPort

      //TODO this should be a iface select
      let OriginalDstIP = '192.168.2.1'

      let data = {
        Protocol: this.values.Protocol,
        Client: parseClientIPOrIdentity(this.values.Client),
        //OriginalDstIP: this.values.OriginalDstIP,
        OriginalDstIP,
        OriginalDstPort: this.values.OriginalDstPort,
        DstIP,
        DstPort
      }

      console.log('presubmit:', JSON.stringify(data))
      return data
    },
    submit: function (data, flow) {
      let isUpdate = flow.index !== undefined

      console.log('submit:', JSON.stringify(data))

      if (isUpdate) {
        return pfwAPI.updateForward(data, flow.index)
      }

      return pfwAPI.addForward(data)
    }
  }
]

const getCards = (cardType) => {
  let cards = cardType == 'trigger' ? triggers : actions
  return cards.filter((card) => card.hidden !== true)
}

const getCard = (cardType, title) => {
  return getCards(cardType).find((card) => card.title == title)
}

const FlowCards = [...triggers, ...actions]

export default FlowCards
export { FlowCards, getCards, getCard, toCron, numToDays }
