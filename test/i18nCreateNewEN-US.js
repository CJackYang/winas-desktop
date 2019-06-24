/*
 * node test/checkI18n.js
 */
/* eslint-disable camelcase */
const fs = require('fs')

// remove lines not in source
const copyPrekeys = (filePath, preData) => {
  const lines_loc = fs.readFileSync(filePath).toString().split('\n')
  const linesWithKey = lines_loc.map((line) => {
    if (line.trim().length) {
      const key = line.split('"')[1]
      return [line, key]
    }
    return [line, '']
  })
  const keys = preData.map(l => l[0])
  // console.log('keys', keys)
  for (let i = linesWithKey.length - 1; i >= 0; i--) {
    const key = linesWithKey[i][1]
    const index = keys.findIndex(k => k === key)
    // console.log('linesWithKey', linesWithKey[i], index)
    if (index > -1) {
      const parts = linesWithKey[i][0].split('"')
      parts[3] = preData[index][1]
      linesWithKey[i][0] = parts.join('"')
    }
  }
  const newlines = linesWithKey.map(l => l[0]).join('\n')
  fs.writeFileSync('./locales/en-US.json-new', newlines)
  console.log('create ./locales/en-US.json-new')
}

const getKeys = (filePath) => {
  console.log('read  ', filePath)
  const lines_loc = fs.readFileSync(filePath).toString().split('\n').map(l => l.trim())
    .filter(l => l.length)
  const filtered_loc = lines_loc.filter(l => !(/====/.test(l)))
  const keys_loc = filtered_loc.map(l => [l.split('"')[1], l.split('"')[3]]).filter(k => !!k[0])
  return keys_loc
}
const preKeys = getKeys('./locales/en-US.json')
copyPrekeys('./locales/zh-CN.json', preKeys)
