import { useEffect } from 'react'
import PropTypes from 'prop-types'
import {
  faBan,
  faBroadcastTower,
  faCircleArrowRight,
  faClock,
  faEllipsis,
  faObjectGroup,
  faRepeat,
  faTag,
  faTags
} from '@fortawesome/free-solid-svg-icons'

import { groupAPI } from 'api'

// helper functions - TODO move to FlowUtils

const numToDays = (num) => {
  let cronDays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

  return num
    .map((n, i) => (n ? cronDays[i] : null))
    .filter((d) => d)
    .join(',')
}

// returns array of days in numeric format
const daysToNum = (days) => {
  //1. days
  let cronDays = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6
  }

  // default abbreviations
  if (days == 'weekdays') {
    days = 'mon,tue,wed,thu,fri' //= 1-5
  } else if (days.startsWith('weekend')) {
    days = 'sat,sun' //= 6-7
  } else if (days == 'every day') {
    days = 'mon,tue,wed,thu,fri,sat,sun'
  }

  let dow = days
    .split(',')
    .map((d) => cronDays[d])
    .filter((n) => typeof n === 'number')

  return dow
}

const toCron = (days, from, to) => {
  /*
*    *    *    *    *    *
┬    ┬    ┬    ┬    ┬    ┬
│    │    │    │    │    |
│    │    │    │    │    └ day of week (0 - 7, 1L - 7L) (0 or 7 is Sun)
│    │    │    │    └───── month (1 - 12)
│    │    │    └────────── day of month (1 - 31, L)
│    │    └─────────────── hour (0 - 23)
│    └──────────────────── minute (0 - 59)
└───────────────────────── second (0 - 59, optional)
  */

  let minute = '0',
    hour = '*',
    dom = '*',
    month = '*',
    dow = '*'

  dow = daysToNum(days).join(',')

  //2. time
  let [fromH, fromM] = from.split(':')
  let [toH, toM] = to.split(':')

  hour = `${fromH}-${toH}`
  minute = `${fromM}-${toM}`

  // simplify
  if (minute == '00-00') {
    minute = '0'
  }

  //NOTE will need to have :00 for minutes if hours diff >= 1h
  if (fromH != toH) {
    minute = '*'
  }

  let str = `${minute} ${hour} ${dom} ${month} ${dow}`
  return str
}

const parseClient = async (cli) => {
  let Client = { Group: '', Identity: '', SrcIP: '' }

  let groupMap = await groupAPI.list()
  let groups = groupMap.map((x) => x.Name) //['lan', 'wan', 'dns']

  if (cli.split('.').length == 4) {
    Client.SrcIP = cli
  } else if (groups.includes(cli)) {
    Client.Group = cli
  } else {
    Client.Identity = cli
  }

  return Client
}

const triggers = [
  {
    title: 'Always',
    cardType: 'trigger',
    description: 'Always run the selected trigger',
    color: 'violet.300',
    icon: faRepeat,
    params: [],
    values: {},
    onSubmit: async function () {
      let { days, from, to } = this.values

      return { Time: { Days: [], Start: '', End: '' }, Condition: '' }
    }
  },
  {
    title: 'Date',
    cardType: 'trigger',
    description: 'Trigger on selected date and time',
    color: 'violet.300',
    icon: faClock,
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
    onSubmit: async function () {
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
    color: 'red.400',
    icon: faBroadcastTower,
    params: [{ name: 'event', type: PropTypes.string }]
  }
]

const actions = [
  {
    title: 'Block TCP',
    cardType: 'action',
    description:
      'Block TCP from source address or group to destination address',
    color: 'red.400',
    icon: faBan,
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
    onSubmit: async function () {
      let xx = await parseClient(this.values.Client)
      console.log('xx')
      console.log(xx)
      return { ...this.values, Client: xx }
    }
  },
  {
    title: 'Block UDP',
    cardType: 'action',
    description:
      'Block UDP from source address or group to destination address',
    color: 'warning.400',
    icon: faBan,
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
    //NOTE same as TCP
    onSubmit: async function () {
      return { ...this.values, Client: await parseClient(this.values.Client) }
    }
  },
  {
    title: 'Forward TCP',
    cardType: 'action',
    description:
      'Forward TCP for specified source to destination address and port',
    color: 'emerald.600',
    icon: faCircleArrowRight,
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
    onSubmit: async function () {
      return { ...this.values, Client: await parseClient(this.values.Client) }
    }
  },
  {
    title: 'Forward UDP',
    cardType: 'action',
    description:
      'Forward UDP for specified source to destination address and port',
    color: 'emerald.400',
    icon: faCircleArrowRight,
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
    onSubmit: async function () {
      return { ...this.values, Client: await parseClient(this.values.Client) }
    }
  },
  {
    title: 'Set Device Groups',
    cardType: 'action',
    description: 'A device joins a group only when conditions are met',
    color: 'cyan.500',
    icon: faObjectGroup,
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
      Groups: []
    },
    onSubmit: async function () {
      return { ...this.values, Client: await parseClient(this.values.Client) }
    }
  },
  {
    title: 'Set Device Tags',
    cardType: 'action',
    description: 'Assign device tags when conditions are met',
    color: 'cyan.500',
    icon: faTags,
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
      Tags: []
    },
    onSubmit: async function () {
      return { ...this.values, Client: await parseClient(this.values.Client) }
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
