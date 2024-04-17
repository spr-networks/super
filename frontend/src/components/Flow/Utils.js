import { deviceAPI } from 'api'

// helper functions
const niceDateToArray = (value) => {
  if (value == 'weekdays') {
    value = 'mon,tue,wed,thu,fri'
  } else if (value == 'weekend') {
    value = 'sat,sun'
  } else if (value == 'every day') {
    value = 'mon,tue,wed,thu,fri,sat,sun'
  }

  return value.split(',')
}

const dateArrayToStr = (days) => {
  if (typeof days === 'string') {
    days = days.split(',')
  }

  let sorted = [...days]
  sorted.sort()
  sorted = sorted.join(',')

  if (sorted == 'fri,mon,thu,tue,wed') {
    days = 'weekdays'
  } else if (sorted == 'sat,sun') {
    days = 'weekend'
  } else if (sorted == 'fri,mon,sat,sun,thu,tue,wed') {
    days = 'every day'
  } else {
    days = days.join(',')
  }

  return days
}

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

const flowObjParse = (x) => {
  if (typeof x !== 'object') {
    return x
  }
  let cliKeys = [
    'Identity',
    'Group',
    'Policy',
    'Tag',
    'SrcIP',
    'Endpoint',
    'Domain',
    'IP'
  ]
  for (let k of cliKeys) {
    if (x[k]?.length) {
      return x[k]
    }
  }

  return JSON.stringify(x)
}

const parseClientIPOrIdentity = (cli) => {
  let Client = { Group: '', Identity: '', SrcIP: '', Tag: '', Endpoint: '' }

  // if Client is from api we already have an object
  if (typeof cli === 'object') {
    return cli
  }
  if (cli.split('.').length == 4) {
    Client.SrcIP = cli
  } else if (cli.match(/^(lan|wan|dns)$/)) {
    //TODO fetch and compare groups and tags
    Client.Group = cli
  } else {
    Client.Identity = cli
  }

  return Client
}

const toOption = (value) => {
  return { label: value, value }
}

export {
  niceDateToArray,
  dateArrayToStr,
  numToDays,
  daysToNum,
  toCron,
  parseClientIPOrIdentity,
  flowObjParse,
  toOption
}
