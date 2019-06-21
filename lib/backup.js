const i18n = require('i18n')
const path = require('path')
const Promise = require('bluebird')
const { ipcMain, webContents } = require('electron')
const fs = Promise.promisifyAll(require('original-fs')) // eslint-disable-line

const { getMainWindow } = require('./window')
const Task = require('./backupTransform')
const {
  updateBackupDrive, serverGet, serverGetAsync, createBackupDirAsync,
  updateBackupDirsOrFiles, updateBackupDirsOrFilesAsync, createBackupDrive
} = require('./server')

let instance = null

const getLocaleRestTime = (restTime) => {
  if (!(restTime > 0)) return ''
  const hour = Math.floor(restTime / 3600)
  const minute = Math.ceil((restTime - hour * 3600) / 60)
  if (!hour) return i18n.__('Rest Time By Minute %s', minute)
  if (hour > 72) return i18n.__('More Than 72 Hours')
  return i18n.__('Rest Time By Hour And Minute %s, %s', hour, minute)
}

const prettySize = (size) => {
  const s = parseFloat(size, 10)
  if (!s || s < 0) return `0 ${i18n.__('Byte')}`
  if (s === 1) return `1 ${i18n.__('Byte')}`
  if (s < 1024) return `${s.toFixed(0)} ${i18n.__('Bytes')}`
  else if (s < (1024 * 1024)) return `${(s / 1024).toFixed(2)} KB`
  else if (s < (1024 * 1024 * 1024)) return `${(s / 1024 / 1024).toFixed(2)} MB`
  return `${(s / 1024 / 1024 / 1024).toFixed(2)} GB`
}

let currentErrors = []
let currentWarnings = []

class Backup {
  constructor (drive, dirs) {
    this.drive = drive
    this.dirs = dirs
    this.status = 'Idle'
    this.watchers = []
    this.Tasks = []
    this.lastTenData = []
    // times of retry
    this.retryCount = 0

    this.debounceTimer = null

    this.checkTopDirAsync = async (entries, fileChangeMap, drv) => {
      const [driveUUID, dirUUID] = [drv.uuid, drv.uuid]
      const ep = `drives/${driveUUID}/dirs/${dirUUID}`
      const listNav = await serverGetAsync(ep, null)
      // contain deleted or disabled top dir
      // const remoteTopDirs = listNav.entries.filter(e => !e.deleted && e.metadata && !e.metadata.disabled)
      const remoteTopDirs = listNav.entries
      const backupDir = []
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const name = path.parse(entry).base
        const localPath = path.resolve(entry)
        let stat = null
        let children = []
        let dir
        try {
          stat = await fs.lstatAsync(localPath)
          children = await fs.readdirAsync(localPath)
        } catch (e) {
          console.warn('read local file error', e)
          currentErrors.push({ pipe: 'checkTopDir', entry, error: { code: 'ENOBDIR' }, name, type: 'directory' })
          continue
        }
        const newEntries = children.map(c => path.join(entry, c))
        const remoteEntry = remoteTopDirs.find(e => e.metadata && e.metadata.localPath === localPath)
        if (remoteEntry) {
          const { uuid } = remoteEntry
          const args = {
            archived: false,
            op: 'updateAttr',
            bctime: stat.birthtime.getTime(),
            bmtime: stat.mtime.getTime(),
            metadata: {
              disabled: false,
              localPath: entry,
              status: 'Working'
            }
          }
          const lastBackupTime = remoteEntry.metadata && remoteEntry.metadata.lastBackupTime
          await updateBackupDirsOrFilesAsync(driveUUID, dirUUID, [{ bname: uuid, args }])
          dir = { driveUUID, dirUUID: uuid, entries: newEntries, localPath: entry, lastBackupTime }
        } else {
          const attr = {
            bctime: stat.birthtime.getTime(),
            bmtime: stat.mtime.getTime(),
            metadata: {
              localPath: entry
            }
          }
          const res = await createBackupDirAsync(driveUUID, dirUUID, name, attr)
          dir = { driveUUID, dirUUID: res.uuid, entries: newEntries, localPath: entry }
          getMainWindow().webContents.send('driveListUpdate', { uuid: driveUUID })
        }
        // fileChangeMap
        // localPath => Array of ChangedFilePath

        if (fileChangeMap.size) {
          const list = fileChangeMap.get(localPath)
          if (list && list.length > 0) {
            dir.changed = list
            console.log(list.length, 'changed in', localPath)
            backupDir.push(dir)
          } else {
            console.log('nothing changed in', localPath)
          }
        } else {
          console.log('check everything in', localPath)
          backupDir.push(dir)
        }
      }
      console.log('>>>>>>>>>>>>>>>>>>>fileChangeMap')
      console.log(fileChangeMap)
      /**
       * Algorithm of handle fileChangeMap
       *  1. changed target: /home/lxw/Desktop/backupTest/trojan/blabla.txt
       *  2. localPath: /home/lxw/Desktop/backupTest (with driveUUID, dirUUID)
       *  3. get targets' relative path: target.substr(localPath.length + 1) => trojan/blabla.txt
       *  4. get pathList: trojan/blabla.txt => [ 'trojan', 'a.txt' ]
       *    a. pathList === 1: check target, mkdir / upload file or archive target
       *    b. pathList > 1: change localPath to path.join(localPath + pathList[0]), mkdir and get new dirUUID goto 3
       */

      /* TODO
      // archive localDeleted remoteTopDirs
      if (lackDirs.size) {
        const lackEntries = [...lackDirs].map(d => ({ bname: d.name, args: { op: 'updateAttr', archived: true } }))
        await updateBackupDirsOrFilesAsync(driveUUID, dirUUID, lackEntries)
      }
      */
      getMainWindow().webContents.send('updateBackupRoot')
      return backupDir
    }
  }

  // init status, start backup-run-turn
  start () {
    console.log('backup start', this.dirs.length)

    // start monitor file changes
    this.startMonitor()

    // start calculation of speed and broadcast status
    this.startCalcSpeed()

    this.status = 'Idle'
    this.dirty = true
    this.isAborted = false
    this.run()
  }

  // abort Backup
  abort () {
    console.log('backup aborted')
    this.isAborted = true
    this.removeMonitor()
    this.clearTimer()
    this.Tasks.forEach(t => t.finish())
    this.Tasks.length = 0
  }

  // abort current Backup, update drive & dirs, restart backup
  updateDirs (drive, dirs) {
    this.abort()
    setImmediate(() => {
      this.isAborted = false
      this.drive = drive
      this.dirs = dirs
      this.start()
    })
  }

  // retry backup-run-turn
  retry () {
    this.retryCount += 1
    console.warn('Backup Failed, retry', 1000 * 60 * this.retryCount ** 2, 'ms later')
    this.status = 'Failed'
    this.dirty = true
    this.retryTimer = setTimeout(() => this.run(), 1000 * 60 * this.retryCount ** 2) // retry later
  }
  /**
   *  filter and transform data
   *
   *  this.fileChangeMap.set(path.join(rootPath, filename), { rootPath, eventType })
   *
   *  this.fileChangeMap: changedFilePath => backupPath
   *
   *  result: backupPath => Array of changedFilePath
   *
   */
  getFileChangeMap () {
    const result = new Map()
    if (!this.fileChangeMap.size) return result

    // console.log('this.fileChangeMap in getFileChangeMap', this.fileChangeMap)

    // transform
    this.fileChangeMap.forEach((value, key) => {
      const parts = key.split(path.sep)
      if (result.has(value.rootPath)) {
        result.get(value.rootPath).push({ fullPath: key, eventType: value.eventType, parts })
      } else {
        result.set(value.rootPath, [{ fullPath: key, eventType: value.eventType, parts }])
      }
    })
    // console.log('result', result)
    // filter and merge list
    result.forEach((list, key) => {
      const newArr = [list[0]]
      const dupLength = key.split(path.sep)

      for (let i = 1; i < list.length; i++) {
        // changeEvent: { fullPath, eventType, parts }
        const changeEvent = list[i]
        // console.log('changeEvent', changeEvent)
        for (let j = newArr.length - 1; j >= 0; j--) {
          if (newArr[j].fullPath === changeEvent.fullPath) {
            // find same fullPath, replace with 'rename' or do nothing (rename > change)
            if (changeEvent.eventType === 'rename') {
              newArr[j].eventType = 'rename'
            }
            // console.log('find same fullPath', changeEvent)
            break
          } else {
            const iPart = changeEvent.parts.slice(dupLength)
            const jPart = newArr[j].parts.slice(dupLength)
            // console.log('iPart, jPart', iPart, jPart)

            if (iPart.length + 1 === jPart.length && iPart.join(path.sep) === jPart.slice(0, iPart.length).join(path.sep)) {
              // iPart is parent of jPart
              newArr.splice(j, 1)
              newArr.push(changeEvent)
              break
            } else if (iPart.length === jPart.length + 1 && jPart.join(path.sep) === iPart.slice(0, jPart.length).join(path.sep)) {
              // jPart is parent of iPart
              // console.log('ignore, child event', changeEvent.fullPath)
              break
            } else if (j === 0) {
              // changeEvent is in new branch, push to newArr
              newArr.push(changeEvent)
            }
            // iPart and jPart are not in the same branch, continue next
          }
        }
      }
      result.set(key, newArr)
    })

    this.fileChangeMap.clear()
    return result
  }
  /**
   * backup-run-turn
   * 1. update Backup Drive
   * 2. check TopDir
   * 3. backup each dirs, see `this.backup`
   */
  run () {
    if (this.status === 'Working' || !this.dirty) return // run when (dirty && status !== 'Working')
    clearTimeout(this.retryTimer)
    this.Tasks.length = 0
    this.status = 'Working'
    this.dirty = false

    this.hasFileUpload = false
    currentWarnings.length = 0
    currentErrors.length = 0

    // filter fileChangeMap and clear
    const fileChangeMap = this.getFileChangeMap()

    // update currentErrors and currentWarnings
    if (getMainWindow()) {
      getMainWindow().webContents.send('BACKUP_RES', { currentErrors, currentWarnings })
    }
    // no drive or topDirs
    if (!this.drive || !this.dirs.length || this.drive.client.disabled) {
      this.status = 'Idle'
      return
    }
    const purePaths = this.dirs.map(d => d.metadata.localPath)
    if (!purePaths.length) {
      this.status = 'Idle'
      this.run()
      return
    }

    updateBackupDrive(this.drive, { status: 'Working' }, (er, res) => {
      if (er) {
        console.error('update BackupDrive error, try later')
        this.retry()
        return
      }
      const lbt = res.client.lastBackupTime
      this.checkTopDirAsync(purePaths, fileChangeMap, this.drive).then((backupDir) => {
        if (!backupDir.length) { // no avaliable backupDir
          this.status = 'Idle'
          return
        }
        this.backup(backupDir, (errorList, warningList) => {
          if (this.isAborted) return // aborted, no thing to do
          if (Array.isArray(errorList) && errorList.length) { // Backup Failed
            updateBackupDrive(this.drive, { status: 'Failed' }, (err, drive) => {
              if (err || !drive) console.error('Failed to update backup drive to Idle')
              else this.drive = drive
              this.retry()
            })
            // update currentErrors for notification
            currentErrors = errorList
          } else {
            // update currentErrors and currentWarnings for notification
            if (Array.isArray(warningList) && warningList) currentWarnings = warningList

            this.lastBackupTime = (this.hasFileUpload || !lbt) ? new Date().getTime() : lbt
            updateBackupDrive(this.drive, { status: 'Idle', lastBackupTime: this.lastBackupTime }, (err, drive) => {
              if (err || !drive) console.error('Failed to update backup drive to Idle')
              else this.drive = drive
              console.log('Backup Idle in backup callback')
              this.status = 'Idle'
              setTimeout(() => this.run(), 1000) // 1 second later
            })
          }
          getMainWindow().webContents.send('BACKUP_RES', { currentErrors, currentWarnings })
        })
      }).catch((e) => {
        console.error('checkTopDir error', e)
        this.retry()
      })
    })
  }

  // creat task for each dir
  backup (backupDir, cb) {
    let i = backupDir.length
    const errorList = []
    const warningList = []
    const done = (errors, warnings) => {
      if (this.isAborted) cb()
      i -= 1
      errorList.push(...errors)
      warningList.push(...warnings)
      if (i === 0) cb(errorList, warningList)
    }
    backupDir.forEach((dir) => {
      this.createTask(dir, done)
    })
  }

  // createTask to backup target topDir
  createTask (topDir, cb) {
    const { entries, driveUUID, dirUUID, localPath, lastBackupTime } = topDir
    const task = new Task(entries, driveUUID, dirUUID, (errors, warnings) => {
      if (!this.isAborted && !errors.length) {
        // change lastBackupTime when any files uploaded
        const args = {
          op: 'updateAttr',
          metadata: {
            localPath,
            disabled: false,
            status: 'Idle',
            lastBackupTime: (task.hasFileUpload || !lastBackupTime) ? new Date().getTime() : lastBackupTime
          }
        }
        this.hasFileUpload = this.hasFileUpload || task.hasFileUpload // check if any file uploaded
        updateBackupDirsOrFiles(
          driveUUID,
          driveUUID,
          [{ bname: dirUUID, args }],
          err => err && console.error('update topDir error', err)
        )
        getMainWindow().webContents.send('driveListUpdate', { uuid: driveUUID })
      }
      cb(errors, warnings)
    })
    this.Tasks.push(task)
    task.run()
  }

  // get progress data of tasks
  summary () {
    let [count, finishCount, size, completeSize, skipSize] = [0, 0, 0, 0, 0]
    const [status, lastBackupTime, drive] = [this.status, this.lastBackupTime, this.drive]
    this.Tasks.forEach((t) => {
      // to fix finishCount > count or completeSize > size, or any < 0
      count += Math.max(t.count, t.finishCount, 0)
      finishCount += Math.max(t.finishCount, 0)
      size += Math.max(t.size, t.completeSize, 0)
      completeSize += Math.max(t.completeSize, 0)
      skipSize += Math.max(t.skipSize, 0)
      this.hasFileUpload = this.hasFileUpload || t.hasFileUpload
    })
    // true transfer size
    const transferSize = Math.max(completeSize - skipSize, 0)
    return ({
      count,
      finishCount,
      size,
      completeSize,
      skipSize,
      status,
      lastBackupTime,
      drive,
      transferSize,
      hasFileUpload: this.hasFileUpload
    })
  }

  // calc and update speed of backup
  // update backup status to AllWebContents
  startCalcSpeed () {
    // calc rest time of backup
    this.lastTenData.length = 0
    clearInterval(this.timer)

    this.timer = setInterval(() => {
      const data = this.summary()
      this.lastTenData.unshift(data)

      // keep 10 data
      if (this.lastTenData.length > 10) this.lastTenData.length = 10

      const ltd = this.lastTenData
      if (ltd.length > 1) {
        const speed = (ltd[0].transferSize - ltd[ltd.length - 1].transferSize) / ltd.length - 1

        // restTimeBySize (bytes per seconds)
        const restTime = (data.size - data.completeSize) / speed

        // const sizeProgress = `${prettySize(data.completeSize)} / ${prettySize(data.size)}`

        const bProgress = data.count ? `${data.finishCount || 0} / ${data.count}` : '--/--'

        const args = {
          speed: i18n.__('%s Speed', prettySize(speed)),
          restTime: getLocaleRestTime(restTime),
          bProgress,
          ...data
        }
        webContents.getAllWebContents().forEach(contents => contents.send('BACKUP_MSG', args))
      }
    }, 1000)
  }

  debounceRun () {
    clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.run(), 2000)
  }

  // use fs.watch to watch file changes
  startMonitor () {
    this.watchers.length = 0
    this.fileChangeMap = new Map()
    this.dirs.forEach((dir) => {
      let watcher
      try {
        const rootPath = path.resolve(dir.metadata.localPath)
        watcher = fs.watch(rootPath, { recursive: true }, (eventType, filename) => {
          console.log('watcher fire', eventType, filename)
          this.dirty = true
          this.fileChangeMap.set(path.join(rootPath, filename), { rootPath, eventType })
          this.debounceRun()
        })
      } catch (e) {
        console.warn('watch file error', e)
        return
      }
      this.watchers.push(watcher)
    })
  }

  // remove monitor
  removeMonitor () {
    this.watchers.forEach(w => w && typeof w.close === 'function' && w.close())
    this.watchers.length = 0
    this.fileChangeMap.clear()
  }

  // clear timers
  clearTimer () {
    // cancel retry timer
    clearTimeout(this.retryTimer)
    // cancel speed caculation timer
    clearTimeout(this.timer)
  }
}

const onBackupDir = (event, args) => {
  const { drive } = args
  const dirs = args.dirs.filter(d => !d.deleted && d.metadata && !d.metadata.disabled)
  if (!instance) {
    instance = new Backup(drive, dirs)
    instance.start()
  } else {
    instance.updateDirs(drive, dirs)
  }
}

const startBackup = () => {
  serverGet('drives', null, (error, drives) => {
    if (error) return // TODO
    const machineId = global.configuration.machineId.slice(-8)
    const drive = drives.find(d => d.type === 'backup' && d.client && (d.client.id === machineId))
    if (drive) {
      if (drive.client.disabled) {
        // backup disabled
        if (instance) instance.abort()
        instance = new Backup(drive, [])
        instance.start()
      } else {
        // backup enabled
        serverGet(`drives/${drive.uuid}/dirs/${drive.uuid}/`, null, (err, dirs) => {
          if (err) return
          const entries = dirs.entries.filter(e => !e.deleted && e.metadata && !e.metadata.disabled)
          if (entries && entries.length) {
            if (instance) instance.abort()
            instance = new Backup(drive, entries)
            instance.start()
          }
        })
      }
    }
  })
}

const stopBackup = () => {
  if (instance) instance.abort()
}

const onCommand = (event, name, args) => {
  const onRes = (session, err, res) => {
    event.sender.send('COMMAND_RES', { session, err, res })
  }
  switch (name) {
    case 'createBackupDrive':
      createBackupDrive((err, res) => onRes(args.session, err, res))
      break
    case 'updateBackupDrive':
      stopBackup()
      updateBackupDrive(args.drive, args.attr, (err, res) => {
        startBackup()
        onRes(args.session, err, res)
      })
      break
    default:
      break
  }
}

const onBackupReq = (event) => {
  event.sender.send('BACKUP_RES', { currentErrors, currentWarnings })
}

const onRestartBackup = (event) => {
  startBackup()
}

ipcMain.on('BACKUP_DIR', onBackupDir)
ipcMain.on('BACKUP_REQ', onBackupReq)
ipcMain.on('RESTART_BACKUP', onRestartBackup)
ipcMain.on('LOGIN', () => setTimeout(startBackup, 1000))
ipcMain.on('LOGOUT', () => setImmediate(stopBackup))
ipcMain.on('COMMAND', onCommand)

instance = new Backup(null, [])
instance.start()

module.exports = { stopBackup }
