import PropTypes from 'prop-types'

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
  WaypointsIcon,
  ArrowDownUpIcon,
  ArrowUpDownIcon,
  BinaryIcon,
  ArrowUp,
  ContainerIcon
} from 'lucide-react-native'

import { BrandIcons } from 'IconUtils'

import { api, deviceAPI, wifiAPI, firewallAPI } from 'api'
import { pfwAPI } from 'api/Pfw'
import {
  numToDays,
  daysToNum,
  toCron,
  parseClientIPOrIdentity,
  toOption
} from './Utils'

const parseDst = (dst) => {
  // handled under FlowCard.js onChange for now,
  //which converts the value to an object {}
  return dst
}

const labelsProtocol = [
  { label: 'tcp', value: 'tcp' },
  { label: 'udp', value: 'udp' }
]
const defaultOptions = async function (name) {
  if (name.endsWith('Port')) {
    return [
      { label: 'http', value: '80' },
      { label: 'https', value: '443' },
      { label: 'ssh', value: '22' },
      { label: 'telnet', value: '23' },
      { label: '3000', value: '3000' },
      { label: '8080', value: '8080' }
    ].map((opt) => ({ ...opt, icon: BinaryIcon }))
  }

  if (name == 'OriginalDst') {
    let addrs = await api.get('/ip/addr')
    addrs = addrs
      .map((a) => {
        let ais = a.addr_info.filter((ai) => ai.family == 'inet')
        return ais
      })
      .filter((ais) => ais && ais.length)
      .map((ais) => ais[0].local)

    let opts = [...new Set(addrs)].map((value) => {
      return { label: value, value, icon: ArrowUpDownIcon }
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

const niceDockerName = (c) => {
  return (c.Names[0] || c.Id.substr(0, 8)).replace(/^\//, '')
}

const niceDockerLabel = (c) => {
  let name = niceDockerName(c)
  let ports = c.Ports.filter((p) => p.IP != '::').map((p) => p.PrivatePort) // p.Type
  return `${name}:${ports}`
}

//NOTE: titles have to match FlowList.js
// or they may become invisible.
const actions = [
  {
    title: 'Block',
    cardType: 'action',
    description: 'Block from source address or group to destination address',
    color: '$red400',
    icon: BanIcon,
    params: [
      {
        name: 'Protocol',
        type: PropTypes.string
      },
      {
        name: 'Client',
        type: PropTypes.string,
        description: 'IP/CIDR or Group'
      },
      {
        name: 'Dst',
        type: PropTypes.object,
        description: 'IP/CIDR, domain, or /regexp/'
      },
      {
        name: 'DstPort',
        type: PropTypes.string,
        description: 'Dest port, range of ports, or empty for all'
      }
    ],
    values: {
      Protocol: 'tcp',
      Client: '0.0.0.0',
      Dst: { IP: '1.2.3.4' },
      DstPort: ''
    },
    getOptions: function (name = 'DstPort') {
      if (name == 'Protocol') {
        return labelsProtocol
      }

      if (name == 'DstPort') {
        return defaultOptions(name)
      }

      return []
    },
    preSubmit: async function () {
      let Client = parseClientIPOrIdentity(this.values.Client)
      let Dst = parseDst(this.values.Dst)
      return { ...this.values, Client, Dst }
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
    title: 'Forward',
    cardType: 'action',
    description: 'Forward for specified source to destination address and port',
    color: '$emerald600',
    icon: SplitIcon,
    params: [
      {
        name: 'Protocol',
        type: PropTypes.string
      },
      {
        name: 'Client',
        type: PropTypes.string,
        description: 'IP/CIDR or Group'
      },
      {
        name: 'OriginalDst',
        type: PropTypes.object,
        description: 'IP: IP/CIDR, Domain: domain, or /regexp/'
      },
      {
        name: 'OriginalDstPort',
        type: PropTypes.string,
        description:
          'Original Destination port, range of ports, or empty for all'
      },
      { name: 'Dst', type: PropTypes.object, description: 'IP/CIDR' },
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
      Dst: { IP: '0.0.0.0' },
      OriginalDst: { IP: '0.0.0.0' },
      OriginalDstPort: ''
    },
    getOptions: async function (name = 'DstPort') {
      if (name == 'Protocol') {
        return labelsProtocol
      }

      if (['DstPort', 'OriginalDstPort'].includes(name)) {
        return defaultOptions(name)
      }

      return []
    },
    preSubmit: async function () {
      return {
        ...this.values,
        Client: parseClientIPOrIdentity(this.values.Client),
        Dst: parseDst(this.values.Dst),
        OriginalDst: parseDst(this.values.OriginalDst)
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
    title: 'Forward all traffic to Interface, Site VPN or Uplink',
    cardType: 'action',
    description:
      'Forward traffic over a Site VPN Gateway, an Uplink, or a Custom Interface',
    color: '$purple600',
    icon: WaypointsIcon,
    params: [
      {
        name: 'Client',
        type: PropTypes.string,
        description: 'IP/CIDR or Group'
      },
      {
        name: 'OriginalDst',
        type: PropTypes.object,
        description: 'IP/CIDR, domain, or /regexp/'
      },
      {
        name: 'DstInterface',
        type: PropTypes.string,
        description: 'Destination site (ex: site0)'
      },
      {
        name: 'Dst',
        type: PropTypes.object,
        description:
          'IP destination, set as destination route, needed for containers'
      }
    ],
    values: {
      Client: '0.0.0.0',
      OriginalDst: { IP: '0.0.0.0' },
      Dst: { IP: '1.2.3.4' },
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

              //and the fw config for custom interfaces
              firewallAPI.config().then((fwconfig) => {
                let ifaces = Array(
                  ...new Set(
                    fwconfig.CustomInterfaceRules.map((a) => a.Interface)
                  )
                )
                for (let iface of ifaces) {
                  s.push({ label: iface, value: iface })
                }
                resolve(s)
              })
            })
          })
        })
      }
    },
    preSubmit: async function () {
      return {
        ...this.values,
        Client: parseClientIPOrIdentity(this.values.Client),
        Dst: parseDst(this.values.Dst),
        OriginalDst: parseDst(this.values.OriginalDst)
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
    title: 'Port Forward to Interface, Site VPN or Uplink',
    cardType: 'action',
    description:
      'Forward traffic over a Site VPN Gateway, an Uplink, or a Custom Interface',
    color: '$purple400',
    icon: WaypointsIcon,
    params: [
      {
        name: 'Protocol',
        type: PropTypes.string
      },
      {
        name: 'Client',
        type: PropTypes.string,
        description: 'IP/CIDR or Group'
      },
      {
        name: 'OriginalDst',
        type: PropTypes.object,
        description: 'IP/CIDR, domain, or /regexp/'
      },
      {
        name: 'OriginalDstPort',
        type: PropTypes.string,
        description:
          'Original Destination port, range of ports, or empty for all'
      },
      {
        name: 'DstInterface',
        type: PropTypes.string,
        description: 'Destination site'
      },
      {
        name: 'Dst',
        type: PropTypes.object,
        description:
          'IP destination, set as destination route, needed for containers'
      },
      {
        name: 'DstPort',
        type: PropTypes.string,
        description: 'New Destination port, range of ports, or empty for all'
      }
    ],
    values: {
      Client: '0.0.0.0',
      OriginalDst: { IP: '0.0.0.0' },
      Dst: { IP: '1.2.3.4' },
      OriginalDstPort: '',
      Protocol: 'tcp',
      DstInterface: '',
      DstPort: ''
    },
    getOptions: function (name = 'DstInterface') {
      if (name == 'Protocol') {
        return labelsProtocol
      }

      if (['DstPort', 'OriginalDstPort'].includes(name)) {
        return defaultOptions(name)
      }

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

              firewallAPI.config().then((fwconfig) => {
                let ifaces = Array(
                  ...new Set(
                    fwconfig.CustomInterfaceRules.map((a) => a.Interface)
                  )
                )
                for (let iface of ifaces) {
                  s.push({ label: iface, value: iface })
                }
                resolve(s)
              })
            })
          })
        })
      }
    },
    preSubmit: async function () {
      return {
        ...this.values,
        Client: parseClientIPOrIdentity(this.values.Client),
        Dst: parseDst(this.values.Dst),
        OriginalDst: parseDst(this.values.OriginalDst)
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
        deviceAPI
          .groups()
          .then((groups) =>
            resolve(
              groups.map(toOption).map((opt) => ({ ...opt, icon: opt.value }))
            )
          )
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
          resolve(tags.map(toOption).map((opt) => ({ ...opt, icon: TagIcon })))
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
    title: 'Docker Forward',
    cardType: 'action',
    description:
      'Forward traffic to a local container. The container does NOT need to expose ports',
    color: '$blue500',
    icon: BrandIcons.Docker, //SplitIcon, //Platform.OS == 'ios' ? SplitIcon : 'Docker',
    params: [
      {
        name: 'Protocol',
        type: PropTypes.string
      },
      {
        name: 'Client',
        type: PropTypes.string,
        description: 'IP/CIDR or Group'
      },
      {
        name: 'OriginalDst',
        type: PropTypes.object,
        description: 'IP/CIDR, domain, or /regexp/'
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
        description: 'Listening port number internal to container'
      },
      {
        name: 'Dst',
        type: PropTypes.object,
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
      Client: { Group: 'lan' },
      Container: 'container',
      ContainerPort: '8080',
      OriginalDst: { IP: '192.168.2.1' },
      OriginalDstPort: '8080',
      DstPort: '8080',
      Dst: { IP: '1.2.3.4' }
    },
    getOptions: async function (name = 'DstPort') {
      if (name == 'Protocol') {
        return labelsProtocol
      }

      if (name.endsWith('Port')) {
        return await defaultOptions(name)
      }

      // get containers from docker api
      if (name == 'Container') {
        let containers = await api.get('/info/docker')

        let opts = containers
          .filter((c) => c.State == 'running' && c.Ports?.length)
          .map((c) => {
            return {
              icon: ContainerIcon,
              label: niceDockerLabel(c),
              value: niceDockerName(c)
            }
          })

        return opts
      }

      return []
    },
    preSubmit: async function () {
      let containers = await api.get('/info/docker')
      let container = containers.find(
        (c) => niceDockerName(c) == this.values.Container
      )

      if (!container) {
        console.error('no container??', this.values)
        return
      }

      let Dst

      let networks = container.NetworkSettings.Networks
      if (networks.bridge) {
        Dst = { IP: container.NetworkSettings.Networks.bridge.IPAddress }
      } else {
        let values = Object.values(container.NetworkSettings.Networks)
        if (values.length > 0) {
          Dst = { IP: values[0].IPAddress }
        } else {
          context.error('container has no IP address')
          return
        }
      }

      let DstPort = this.values.ContainerPort

      let data = {
        Protocol: this.values.Protocol,
        Client: parseClientIPOrIdentity(this.values.Client),
        OriginalDstPort: this.values.OriginalDstPort,
        Dst: parseDst(Dst),
        OriginalDst: parseDst(this.values.OriginalDst),
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
