import PropTypes from 'prop-types'
import {
  faBan,
  faBroadcastTower,
  faClock,
  faEllipsis,
  faTag
} from '@fortawesome/free-solid-svg-icons'

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
    description: 'Block TCP for specified source and destination',
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
    }
  },
  {
    title: 'Block UDP',
    cardType: 'action',
    description: 'Block UDP for specified source and destination',
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

export { FlowCards, getCards, getCard }
