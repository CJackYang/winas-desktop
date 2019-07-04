const fs = require('fs')
const os = require('os')
const path = require('path')
const xattr = os.platform() === 'win32' ? require('fs-ads') : require('fs-xattr') // eslint-disable-line
const HASH = 'user.winas.hash'
const BACKUP = 'user.winas.backup'

const setXattr = (target, attr) => {
  const stats = fs.lstatSync(target)
  const htime = Math.round(stats.mtime.getTime() / 1000) * 1000
  const newAttr = Object.assign({}, attr, { htime })
  try {
    xattr.setSync(target, HASH, JSON.stringify(newAttr))
    fs.utimesSync(target, stats.atime, new Date(htime))
  } catch (e) {
    console.error(target, 'setXattrAsync error: ', e.code || e)
  }
  return newAttr
}

const readXattr = (target) => {
  let attr
  try {
    attr = JSON.parse(xattr.getSync(target, HASH))
  } catch (e) {
    /* may throw xattr ENOENT or JSON SyntaxError */
    if (e && !['ENOENT', 'ENODATA'].includes(e.code)) console.error('readXattrAsync error: ', e.code || e)
  }
  const stats = fs.lstatSync(target)
  const htime = stats.mtime.getTime()
  if (attr && attr.htime && attr.htime === htime) return attr
  return null
}

const readDir = (entires) => {
  for (let i = 0; i < entires.length; i++) {
    const entry = entires[i]
    const stat = fs.lstatSync(entry)

    try {
      // setXattr(entry, { entry })
      const data = readXattr(entry)
      console.log('xattr of', entry)
      console.log(data)
    } catch (error) {
      console.log('set xattr failed in', entry, error)
    }

    if (stat.isDirectory()) {
      const children = fs.readdirSync(entry)
      if (children.length) {
        readDir(children.map(c => path.join(entry, c)))
      }
    }
  }
}

// target: target entry path
// dirUUID: backup directory uuid

const setBackupFlag = async (target, dirUUID) => {
  const stats = await fs.lstatAsync(target)
  const atime = stats.atime.getTime()
  const mtime = Math.round(stats.mtime.getTime() / 1000) * 1000
  const birthtime = stats.birthtime.getTime()
  const newAttr = { atime, mtime, birthtime, dirUUID, target }
  try {
    await xattr.setAsync(target, BACKUP, JSON.stringify(newAttr))
    await fs.utimesAsync(target, stats.atime, new Date(mtime))
  } catch (e) {
    console.error(target, 'setXattrAsync error: ', e.code || e)
  }
  return newAttr
}

const checkBackupFlag = async (target, dirUUID) => {
  let attr
  try {
    attr = JSON.parse(await xattr.getAsync(target, BACKUP))
  } catch (e) {
    /* may throw xattr ENOENT or JSON SyntaxError */
    if (e && !['ENOENT', 'ENODATA'].includes(e.code)) console.error('readXattrAsync error: ', e.code || e)
  }
  let stats
  try {
    stats = await fs.lstatAsync(target)
  } catch (error) {
    return false
  }

  const atime = stats.atime.getTime()
  const mtime = stats.mtime.getTime()
  const birthtime = stats.birthtime.getTime()
  if (attr && attr.atime === atime && attr.mtime === mtime &&
    attr.birthtime === birthtime && attr.dirUUID === dirUUID && attr.target === target) {
    return true
  }

  return false
}

const root = '/home/lxw/Desktop/backupTest'
readDir([root])
process.exit()
