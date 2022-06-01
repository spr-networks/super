import PropTypes from 'prop-types'
import {
  faBan,
  faBroadcastTower,
  faCircleArrowRight,
  faClock,
  faEllipsis,
  faTag
} from '@fortawesome/free-solid-svg-icons'

// helper functions - TODO move to FlowUtils

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

  //1. days
  let cronDays = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
    sun: 7
  }

  // default abbreviations
  if (days == 'weekdays') {
    days = 'mon,tue,wed,thu,fri'
  } else if (days == 'weekend') {
    days = 'sat,sun'
  }

  dow = days
    .split(',')
    .map((d) => cronDays[d])
    .filter((n) => typeof n === 'number')
    .join(',')

  //2. time
  let [fromH, fromM] = from.split(':')
  let [toH, toM] = to.split(':')

  hour = `${fromH}-${toH}`
  minute = `${fromM}-${toM}`

  // simplify
  if (minute == '00-00') {
    minute = '0'
  }

  let str = `0 ${minute} ${hour} ${dom} ${month} ${dow}`
  return str
}

const parseClient = (cli) => {
  let Client = { Group: '', Identity: '', SrcIP: '' }

  // TODO better check here, fetch groups
  let groups = ['lan', 'wan', 'dns']

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
    onSubmit: function () {
      let { days, from, to } = this.values
      let CronExpr = toCron(days, from, to)
      return { CronExpr, Condition: 'TODO' }
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
        type: PropTypes.number,
        description: 'Dest port, use 0 for all'
      }
    ],
    values: {
      Protocol: 'tcp',
      Client: '0.0.0.0',
      DstIP: '0.0.0.0',
      DstPort: 0
    },
    onSubmit: function () {
      return { ...this.values, Client: parseClient(this.values.Client) }
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
        type: PropTypes.number,
        description: 'Dest port, use 0 for all'
      }
    ],
    values: {
      Protocol: 'udp',
      Client: '0.0.0.0',
      DstIP: '0.0.0.0',
      DstPort: 0
    },
    //NOTE same as TCP
    onSubmit: function () {
      return { Client: parseClient(values.Client), ...this.values }
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
      {
        name: 'SrcPort',
        type: PropTypes.number,
        description: 'Source port, use 0 for all'
      },
      { name: 'DstIP', type: PropTypes.string, description: 'IP/CIDR' },
      { name: 'NewDstIP', type: PropTypes.string, description: 'IP/CIDR' },

      {
        name: 'DstPort',
        type: PropTypes.number,
        description: 'Dest port, use 0 for all'
      }
    ],
    values: {
      Protocol: 'tcp',
      Client: '0.0.0.0',
      SrcPort: 0,
      DstIP: '0.0.0.0',
      NewDstIP: '0.0.0.0',
      DstPort: 0
    },
    onSubmit: function () {
      return { ...this.values, Client: parseClient(this.values.Client) }
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
        name: 'Client',
        type: PropTypes.string,
        description: 'IP/CIDR or Group'
      },
      {
        name: 'SrcPort',
        type: PropTypes.number,
        description: 'Source port, use 0 for all'
      },
      { name: 'DstIP', type: PropTypes.string, description: 'IP/CIDR' },
      { name: 'NewDstIP', type: PropTypes.string, description: 'IP/CIDR' },
      {
        name: 'DstPort',
        type: PropTypes.number,
        description: 'Dest port, use 0 for all'
      }
    ],
    values: {
      Protocol: 'udp',
      Client: '0.0.0.0',
      SrcPort: 0,
      DstIP: '0.0.0.0',
      NewDstIP: '0.0.0.0',
      DstPort: 0
    },
    onSubmit: function () {
      return { ...this.values, Client: parseClient(this.values.Client) }
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
export { FlowCards, getCards, getCard, toCron }
