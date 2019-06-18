const fs = require('fs')
const path = require('path')
const rimraf = require('rimraf')
const { app } = require('electron')
const Promise = require('bluebird')

/**
a custom db to store backup data
@param {path} path to store the db
*/
// dbPath = path.join(app.getPath('appData'), 'pocket_drive', 'dbCache')
class BackupDB {
  constructor (dirId) {
    this.dbFile = path.join(app.getPath('appData'), 'pocket_drive', 'backupDB', `${dirId}.db`)
  }

  add (key, value, cb) {
    const string = `${key}\t${value}\n`
    fs.appendFile(this.dbFile, string, cb)
  }

  setAll (map, cb) {
    let string = ''
    map.entries((key, value) => {
      string = `${string}${key}\t${value}\n`
    })
    fs.writeFile(this.dbFile, string, cb)
  }

  readAll (cb) {
    fs.readFile(this.dbFile, (err, res) => {
      if (err) cb(err)
      else {
        try {
          const list = res.toString().split('\n').map(l => l.split('\t')).filter(l => l.length === 2)
          const map = new Map()
          list.forEach((arr) => {
            map.set(arr[0], arr[1])
          })
          cb(null, map)
        } catch (error) {
          cb(error)
        }
      }
    })
  }

  async readAllAsync () {
    return Promise.promisify(this.readAll).bind(this)()
  }

  clear (cb) {
    rimraf(this.dbFile, cb)
  }
}

module.exports = BackupDB
