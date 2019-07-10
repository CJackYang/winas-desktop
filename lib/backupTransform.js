const path = require('path')
const Debug = require('debug')
const Promise = require('bluebird')
const sanitize = require('sanitize-filename')
const fs = Promise.promisifyAll(require('original-fs')) // eslint-disable-line

const Transform = require('./transform')
const { getMainWindow } = require('./window')
const { hashFileAsync } = require('./filehash')
const { readXattrAsync, setXattrAsync, checkBackupFlagAsync, setBackupFlagAsync } = require('./xattr')
const { createBackupDirAsync, UploadMultipleFiles, serverGetAsync, updateBackupDirsOrFilesAsync } = require('./server')

const debug = Debug('node:lib:backupTransform:')

const sendMsg = () => {}

class Task {
  constructor (localEntries, driveId, dirId, changedTargets, localPath, onFinished) {
    this.localEntries = localEntries
    this.driveUUID = driveId
    this.dirUUID = dirId
    this.changed = changedTargets
    this.rootPath = localPath
    this.onFinished = onFinished
    this.readDirSize = 0
    this.diffSize = 0
    this.completeSize = 0
    this.skipSize = 0
    this.readDirCount = 0
    this.diffCount = 0
    this.finishCount = 0
    this.state = 'visitless'
    this.errors = []
    this.warnings = []

    this.reqHandles = []

    /* Transform must be an asynchronous function !!! */
    this.readDir = new Transform({
      name: 'readDir',
      concurrency: 2,
      transform (x, callback) {
        // read entries
        const read = async (entries, tree, task) => {
          let trueChanged = false
          let dirCount = 0
          let dirSize = 0
          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]
            const fullName = path.parse(entry).base
            const warning = { pipe: 'readDir', entry, name: fullName, isWarning: true }
            let stat
            try {
              stat = await fs.lstatAsync(path.resolve(entry))
            } catch (error) {
              // handle lstat error caused by invalid name
              if (fullName !== sanitize(fullName)) {
                task.warnings.push(Object.assign({ error: { code: 'ENAME' } }, warning))
                console.error('invalid name:', entry)
                continue
              } else {
                task.warnings.push({ pipe: 'readDir', entry, name: fullName, error })
                console.error('lstat error:', entry)
                continue
              }
            }

            const type = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'others'

            /* filter unsupport type */
            if (type === 'others') {
              task.warnings.push(Object.assign({ error: { code: 'ETYPE' } }, warning))
              console.error('unsupport type', entry)
              continue
            }

            /* filter invalid name */
            if (fullName !== sanitize(fullName)) {
              task.warnings.push(Object.assign({ error: { code: 'ENAME' } }, warning))
              console.error('invalid name:', entry)
              continue
            }

            /* filter skip files */
            if (stat.isFile() && (fullName === '.DS_Store' || fullName.startsWith('~$'))) {
              task.warnings.push(Object.assign({ error: { code: 'ESKIP' } }, warning))
              console.error('skip file', entry)
              continue
            }
            dirCount += 1
            // check if already backuped
            const backuped = await checkBackupFlagAsync(entry, dirId)
            // debug(entry, 'is backuped ?', backuped)
            if (!backuped) trueChanged = true
            if (stat.isDirectory()) {
              /* read child */
              tree.children.push({ value: fullName, entry, children: [] })
              const children = await fs.readdirAsync(path.resolve(entry))
              const newEntries = []
              children.forEach(c => newEntries.push(path.join(entry, c)))
              // check if anything changed recursively
              const res = await read(newEntries, tree.children[tree.children.length - 1], task)
              if (!res.trueChanged && backuped) {
                const index = tree.children.findIndex(v => v.value === fullName)
                if (index > -1) tree.children.splice(index, 1)
              } else {
                trueChanged = true
              }
            } else {
              dirSize += stat.size
              if (!backuped) {
                tree.children.push({ value: fullName, entry, children: [] })
              }
            }
          }
          task.readDirCount += dirCount
          task.readDirSize += dirSize
          if (!trueChanged) {
            task.finishCount += dirCount
            task.skipSize += dirSize
            task.completeSize += dirSize
          }
          return ({ trueChanged, changed: tree, entries, dirUUID: dirId, driveUUID: driveId, rootPath: localPath, task })
        }
        const treeRoot = { root: localPath, children: [] }
        const { entries, task } = x
        read(entries, treeRoot, task).then(y => callback(null, y)).catch(callback)
      }
    })

    this.fastCount = new Transform({
      name: 'fastCount',
      concurrency: 2,
      transform (x, callback) {
        // read entries
        const read = async (changed, dirUUID, driveUUID, rootPath, task) => {
          debug('fastCount', this.pending.length, changed.entry, dirUUID, driveUUID, rootPath)
          const currentEntries = []
          const deepEntries = []
          changed.children.forEach(c => (c.children.length ? deepEntries.push(c) : currentEntries.push(c)))

          let trueChanged = false

          // count deepEntries
          if (deepEntries.length) {
            for (let i = 0; i < deepEntries.length; i++) {
              const node = deepEntries[i]
              const dirname = node.value
              try {
                const entry = path.join(rootPath, dirname)
                const stat = await fs.lstatAsync(entry)
                if (stat.isDirectory) {
                  // current is dir, read dir
                  const res = await read(node, dirUUID, driveUUID, entry, task)
                  const backuped = await checkBackupFlagAsync(entry, dirId)
                  if (res.trueChanged || !backuped) {
                    trueChanged = true
                  }
                } else {
                  // something changed, ignore this chaneEvent
                  debug('something changed, ignore this chaneEvent', node)
                }
              } catch (e) {
                // dir not found or other error, should handled in parent dir
                debug('dir not found or  other error, should handled in parent dir', node)
                console.error(e)
              }
            }
          }
          // something changed in current dir, check entire dir
          if (currentEntries.length) {
            // debug('currentEntries', currentEntries)

            let dirCount = 0
            let dirSize = 0
            let list
            try {
              list = await fs.readdirAsync(path.resolve(rootPath))
            } catch (error) {
              console.error('readdir currentEntries error', error)
              changed.children.length = 0
              return ({ trueChanged: false, changed, dirUUID, driveUUID, rootPath, task })
            }

            const entries = []
            list.forEach(c => entries.push(path.join(rootPath, c)))
            for (let i = 0; i < entries.length; i++) {
              const entry = entries[i]
              const fullName = path.parse(entry).base
              const warning = { pipe: 'readDir', entry, name: fullName, isWarning: true }
              let stat
              try {
                stat = await fs.lstatAsync(path.resolve(entry))
              } catch (error) {
                // handle lstat error caused by invalid name
                if (fullName !== sanitize(fullName)) {
                  task.warnings.push(Object.assign({ error: { code: 'ENAME' } }, warning))
                  console.error('invalid name:', entry)
                  continue
                } else {
                  task.warnings.push({ pipe: 'readDir', entry, name: fullName, error })
                  console.error('lstat error:', entry)
                  continue
                }
              }

              const type = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'others'

              /* filter unsupport type */
              if (type === 'others') {
                task.warnings.push(Object.assign({ error: { code: 'ETYPE' } }, warning))
                console.error('unsupport type', entry)
                continue
              }

              /* filter invalid name */
              if (fullName !== sanitize(fullName)) {
                task.warnings.push(Object.assign({ error: { code: 'ENAME' } }, warning))
                console.error('invalid name:', entry)
                continue
              }

              /* filter skip files */
              if (stat.isFile() && (fullName === '.DS_Store' || fullName.startsWith('~$'))) {
                task.warnings.push(Object.assign({ error: { code: 'ESKIP' } }, warning))
                console.error('skip file', entry)
                continue
              }
              const backuped = await checkBackupFlagAsync(entry, dirId)

              if (!backuped) {
                trueChanged = true
              }
              dirCount += 1
              if (stat.isFile()) {
                dirSize += stat.size
              }
            }

            task.readDirCount += dirCount
            task.readDirSize += dirSize
            if (!trueChanged) {
              task.finishCount += dirCount
              task.skipSize += dirSize
              task.completeSize += dirSize
            }
          }
          // remove not trueChanged
          if (!trueChanged) {
            changed.children.length = 0
          }
          return ({ trueChanged, changed, dirUUID, driveUUID, rootPath, task })
        }
        const { changed, dirUUID, driveUUID, rootPath, task } = x
        read(changed, dirUUID, driveUUID, rootPath, task).then(y => callback(null, y)).catch(callback)
      }
    })

    this.classify = new Transform({
      name: 'classify',
      concurrency: 2,
      isBlocked: () => this.diff.pending.length > 16 || this.upload.pending.length > 16,
      transform (x, callback) {
        // read entries
        const read = async (changed, dirUUID, driveUUID, rootPath, task) => {
          debug('classify', this.pending.length, changed.entry, dirUUID, driveUUID, rootPath)
          const currentEntries = []
          const deepEntries = []
          changed.children.forEach(c => (c.children.length ? deepEntries.push(c) : currentEntries.push(c)))
          // debug('currentEntries', currentEntries.length)
          // debug('deepEntries', deepEntries.length)
          // classify deepEntries
          if (deepEntries.length) {
            /* read reomte */
            const ep = `drives/${driveUUID}/dirs/${dirUUID}`
            const listNav = await serverGetAsync(ep, null)
            const remoteEntries = listNav.entries || []
            const remoteDirs = remoteEntries.filter(r => r.type === 'directory' && !r.archived)
            for (let i = 0; i < deepEntries.length; i++) {
              const node = deepEntries[i]
              const dirname = node.value
              try {
                const entry = path.join(rootPath, dirname)
                const stat = await fs.lstatAsync(entry)
                if (stat.isDirectory) {
                  // current is dir
                  const attr = {
                    bctime: stat.birthtime.getTime(),
                    bmtime: Math.round(stat.mtime.getTime() / 1000) * 1000
                  }
                  const remoteDir = remoteDirs.find(v => v.bname === dirname && v.bmtime === attr.bmtime)
                  let uuid
                  if (!remoteDir) {
                    // create new dir
                    const res = await createBackupDirAsync(driveUUID, dirUUID, dirname, attr)
                    uuid = res && res.uuid
                    remoteDirs.push(res)
                    await setBackupFlagAsync(entry, task.dirUUID)
                    // debug('create new dir in classify', entry, uuid)
                  } else {
                    // find remote dir
                    uuid = remoteDir.uuid
                  }
                  // push to a new classify
                  this.push({
                    changed: node,
                    dirUUID: uuid,
                    driveUUID,
                    rootPath: path.join(rootPath, dirname),
                    task
                  })
                } else {
                  // something changed, ignore this chaneEvent
                  debug('something changed, ignore this chaneEvent', node)
                }
              } catch (e) {
                // dir not found or other error, should handled in parent dir
                debug('dir not found or  other error, should handled in parent dir', node)
                console.error(e)
              }
            }
          }
          // something changed in current dir, check entire dir
          if (currentEntries.length) {
            // debug('currentEntries', currentEntries)
            let list
            try {
              list = await fs.readdirAsync(path.resolve(rootPath))
            } catch (error) {
              console.error('readdir currentEntries error', error)
              return ({ noChange: true })
            }

            const entries = []
            list.forEach(c => entries.push(path.join(rootPath, c)))
            for (let i = 0; i < entries.length; i++) {
              const entry = entries[i]
              const fullName = path.parse(entry).base
              const warning = { pipe: 'readDir', entry, name: fullName, isWarning: true }
              let stat
              try {
                stat = await fs.lstatAsync(path.resolve(entry))
              } catch (error) {
                // handle lstat error caused by invalid name
                if (fullName !== sanitize(fullName)) {
                  task.warnings.push(Object.assign({ error: { code: 'ENAME' } }, warning))
                  console.error('invalid name:', entry)
                  continue
                } else {
                  task.warnings.push({ pipe: 'readDir', entry, name: fullName, error })
                  console.error('lstat error:', entry)
                  continue
                }
              }

              const type = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'others'

              /* filter unsupport type */
              if (type === 'others') {
                task.warnings.push(Object.assign({ error: { code: 'ETYPE' } }, warning))
                console.error('unsupport type', entry)
                continue
              }

              /* filter invalid name */
              if (fullName !== sanitize(fullName)) {
                task.warnings.push(Object.assign({ error: { code: 'ENAME' } }, warning))
                console.error('invalid name:', entry)
                continue
              }

              /* filter skip files */
              if (stat.isFile() && (fullName === '.DS_Store' || fullName.startsWith('~$'))) {
                task.warnings.push(Object.assign({ error: { code: 'ESKIP' } }, warning))
                console.error('skip file', entry)
                continue
              }
            }

            return ({ entries, dirUUID, driveUUID, task })
          }
          // nothing changed in current dir
          return ({ noChange: true })
        }
        const { changed, dirUUID, driveUUID, rootPath, task } = x

        read(changed, dirUUID, driveUUID, rootPath, task).then(y => callback(null, y)).catch(callback)
      }
    })

    this.diff = new Transform({
      name: 'diff',
      concurrency: 2,
      isBlocked: () => this.upload.pending.length > 16,
      push (x) {
        if (!x.noChange) {
          this.pending.push(x)
        }
        this.schedule()
      },
      transform (x, callback) {
        const read = async (entries, dirUUID, driveUUID, task) => {
          debug('diff', this.pending.length, entries.length, 'in', dirUUID, driveUUID)
          /* read local */
          const localFiles = []
          const localDirs = []

          /* read reomte */
          const ep = `drives/${driveUUID}/dirs/${dirUUID}`
          const listNav = await serverGetAsync(ep, null)
          const remoteEntries = listNav.entries || []
          const remoteFiles = []
          const remoteDirs = []
          // includes deleted files, which does not need to upload or archive
          remoteEntries.filter(r => !r.archived && !r.fingerprint).forEach((entry) => {
            if (entry.type === 'file') remoteFiles.push(entry)
            else remoteDirs.push(entry)
          })
          // debug('remote', remoteFiles.map(f => f.bname), remoteDirs.map(d => d.bname))

          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]
            /* skip items */
            const fullName = path.parse(entry).base
            if (fullName !== sanitize(fullName)) continue
            let stat
            try {
              stat = await fs.lstatAsync(path.resolve(entry))
            } catch (error) {
              task.warnings.push({ error, pipe: 'diff', entry, name: fullName })
              continue
            }

            if (!stat.isFile() && !stat.isDirectory()) continue
            if (stat.isFile() && (fullName === '.DS_Store' || fullName.startsWith('~$'))) continue

            task.diffCount += 1
            if (stat.isDirectory()) {
              const dirname = fullName
              const attr = {
                bctime: stat.birthtime.getTime(),
                bmtime: Math.round(stat.mtime.getTime() / 1000) * 1000
              }
              const remoteDir = remoteDirs.find(v => v.bname === dirname && v.bmtime === attr.bmtime)

              let uuid = null
              if (!remoteDir) {
                const res = await createBackupDirAsync(driveUUID, dirUUID, dirname, attr)
                uuid = res && res.uuid

                remoteDirs.push(res)
                await setBackupFlagAsync(entry, task.dirUUID)
                // debug('create new dir in diff', entry, uuid)
              } else if (!remoteDir.deleted) {
                uuid = remoteDir.uuid
                // debug('get remote dir in diff', entry, uuid)
              } else { // deleted
                task.warnings.push({
                  pipe: 'diff',
                  entry,
                  error: { code: 'EDELDIR' },
                  name: fullName,
                  type: 'directory',
                  isWarning: true,
                  remote: { uuid: remoteDir.uuid, pdrv: driveUUID, pdir: dirUUID, name: remoteDir.bname }
                })
              }
              if (uuid && !remoteDir) {
                /* read child */
                const children = await fs.readdirAsync(path.resolve(entry))

                const newEntries = []
                children.forEach(c => newEntries.push(path.join(entry, c)))

                // push as new diff task
                this.push({ entries: newEntries, dirUUID: uuid, driveUUID, task })
              }
              task.finishCount += 1
              localDirs.push({ entry, stat, name: fullName })
            } else {
              try {
                const attr = await readXattrAsync(entry)
                if (attr && attr.parts) localFiles.push({ entry, stat, name: fullName, parts: attr.parts })
                else throw Error('No Attr')
              } catch (e) {
                const parts = await hashFileAsync(entry, stat.size, 1024 * 1024 * 1024)
                try {
                  await setXattrAsync(entry, { parts })
                } catch (err) {
                  console.error('setXattr error', err)
                }
                // use new stats which times may changed
                const newStat = await fs.lstatAsync(path.resolve(entry))
                task.diffSize += newStat.size
                localFiles.push({ entry, stat: newStat, name: fullName, parts })
              }
            }
          }

          /* Compare between remote and local
           * new file: upload
           * same name && type && hash &&  bmtime: nothing to do
           * file with same name but different bmtime/hash: archive remote and then, upload
           * remote deleted: not upload or archive
           */

          const lackFiles = []
          const map = new Map() // compare name && type && hash  && bmtime
          const nameMap = new Map() // only same name
          localFiles.forEach((l) => {
            const { name, stat } = l
            const mtime = stat.mtime.getTime()

            const hash = l.parts[l.parts.length - 1].fingerprint
            // local file's key: name + fingerprint + mtime
            const key = name.concat(hash).concat(mtime)
            map.set(key, l)
            nameMap.set(name, key)
          })
          remoteFiles.forEach((r) => {
            // remote file's key: name + hash

            const rKey = r.name.concat(r.hash).concat(r.bmtime)
            if (nameMap.has(r.name)) {
              const key = nameMap.get(r.name)
              const value = map.get(key)
              if (!r.deleted) {
                Object.assign(value, { policy: { archiveRemote: true, remoteUUID: r.uuid, remoteHash: r.hash } })
              }
              nameMap.delete(r.name)
            } else if (!r.deleted) {
              lackFiles.push(r)
            }

            // same files, no need to upload and regard as finished
            const value = map.get(rKey)
            if (value) {
              task.completeSize += value.stat.size
              task.skipSize += value.stat.size
              map.delete(rKey)
              /* remote delete file */
              if (r.deleted) {
                task.warnings.push({
                  pipe: 'diff',
                  entry: value.entry,
                  error: { code: 'EDELFILE' },
                  name: value.name,
                  type: 'file',
                  remote: { uuid: r.uuid, hash: r.hash, pdrv: driveUUID, pdir: dirUUID, name: r.bname },
                  isWarning: true
                })
              }
            }
          })
          // current nameMap: new files, map: new files and different files
          const newFiles = []
          const diffFilesMap = new Map([...map])

          const nameValue = [...nameMap.values()]
          nameValue.forEach((key) => {
            newFiles.push(map.get(key))
            diffFilesMap.delete(key)
          })

          // different files
          const diffFiles = [...diffFilesMap.values()]

          const lackDirs = remoteDirs.filter(rd => !rd.deleted && !localDirs.find(d => (d.name === rd.name)))

          // debug('remoteFiles', remoteFiles.length)
          // debug('localFiles', localFiles.length)
          // debug('newFiles', newFiles.length)
          // debug('diffFiles', diffFiles.length)
          // debug('lackFiles', lackFiles.length)
          // debug('lackDirs', lackDirs.length)

          task.finishCount += localFiles.length - newFiles.length - diffFiles.length

          /* archive local lack dirs or files */
          if (lackFiles.length + lackDirs.length) {
            const lackEntries = [...lackFiles, ...lackDirs].map((e) => {
              const { uuid, hash, bname } = e
              const args = hash ? { op: 'updateAttr', hash, uuid, archived: true } : { op: 'updateAttr', archived: true }
              return ({ bname, args })
            })
            await updateBackupDirsOrFilesAsync(driveUUID, dirUUID, lackEntries)
          }

          // check if any large file's part
          const partFiles = remoteEntries.filter(r => !r.deleted && !r.archived && r.fingerprint)

          // files need to upload, diff or new files
          const targetFiles = [...newFiles, ...diffFiles]

          targetFiles.forEach((l) => {
            // large file: > 1GB
            if (l.parts.length > 1) {
              // upload file start from position: (seed * 1024 * 1024 * 1024)
              let seed = 0
              const fingerprint = l.parts[l.parts.length - 1].fingerprint
              const targetParts = partFiles.filter(p => p.fingerprint === fingerprint)
              const reverseParts = [...l.parts].reverse()
              const index = reverseParts.findIndex(part => targetParts.some(p => p.hash === part.target))
              if (index > -1) {
                seed = reverseParts.length - 1 - index
                task.completeSize += seed * 1024 * 1024 * 1024
                task.skipSize += seed * 1024 * 1024 * 1024
              }

              l.policy = Object.assign({ seed }, l.policy) // important: assign a new object !
            }
          })

          // debug('targetFiles', targetFiles)
          return ({ files: targetFiles, dirUUID, driveUUID, task })
        }
        const { entries, dirUUID, driveUUID, task } = x
        read(entries, dirUUID, driveUUID, task).then(y => callback(null, y)).catch(callback)
      }
    })

    this.upload = new Transform({
      name: 'upload',
      concurrency: 2,
      isBlocked: () => this.state === 'finished',
      push (x) {
        const MAX = 8
        const { driveUUID, dirUUID, task, domain, files } = x
        for (let start = 0; start < files.length; start += MAX) {
          const currentFiles = files.slice(start, start + MAX)
          this.pending.push({ driveUUID, dirUUID, task, domain, files: currentFiles })
        }

        this.schedule()
      },
      transform: (X, callback) => {
        let uploadedSum = 0
        let countSum = 0
        const { driveUUID, dirUUID, task, domain } = X
        task.state = 'uploading'

        const Files = X.files.map((x) => {
          const { entry, stat, parts, name, policy } = x
          const readStreams = parts.map((p, i) => {
            const rs = fs.createReadStream(entry, { start: p.start, end: Math.max(p.end, 0), autoClose: true })
            let lastTimeSize = 0
            let countReadHandle = null
            const countRead = () => {
              sendMsg()
              const gap = rs.bytesRead - lastTimeSize
              task.completeSize += gap
              uploadedSum += gap
              lastTimeSize = rs.bytesRead
            }
            rs.on('open', () => {
              countReadHandle = setInterval(countRead, 200)
            })
            rs.on('end', () => {
              clearInterval(countReadHandle)
              const gap = rs.bytesRead - lastTimeSize
              task.completeSize += gap
              uploadedSum += gap
              lastTimeSize = rs.bytesRead
              if (i === parts.length - 1) {
                task.finishCount += 1
                countSum += 1
                setBackupFlagAsync(entry, task.dirUUID).catch(console.error)
              }
              sendMsg()
            })

            if (domain === 'phy') return rs

            let formDataOptions = {
              op: 'newfile',
              size: p.end - p.start + 1,
              sha256: p.sha,
              bctime: stat.birthtime.getTime(),
              bmtime: stat.mtime.getTime()
            }

            // add fingerprint for backup large file(> 1G)
            if (parts.length > 1) {
              formDataOptions = Object.assign(formDataOptions, { fingerprint: parts[parts.length - 1].fingerprint })
            }

            // append file part for backup large file(> 1G)
            if (p.start) {
              formDataOptions = Object.assign(formDataOptions, { hash: p.target, op: 'append' })
            }

            p.formDataOptions = { filename: JSON.stringify(formDataOptions) }

            return rs
          })

          return ({ entry, stat, name, parts, readStreams, policy })
        })

        // no files
        if (!Files.length) {
          setImmediate(() => callback(null, { driveUUID, dirUUID, Files, task, domain }))
          return
        }

        this.hasFileUpload = true

        const handle = new UploadMultipleFiles(driveUUID, dirUUID, Files, domain, (error) => {
          task.reqHandles.splice(task.reqHandles.indexOf(handle), 1)
          if (error) {
            task.finishCount -= countSum
            task.completeSize -= uploadedSum
          }
          callback(error, { driveUUID, dirUUID, Files, task, domain })
        })
        task.reqHandles.push(handle)
        handle.upload()
      }
    })

    this.onData = (x) => {
      const { dirUUID } = x
      getMainWindow().webContents.send('driveListUpdate', { uuid: dirUUID })
      sendMsg()
    }

    this.onStep = () => {
      this.errors.length = 0
      const pipes = ['readDir', 'classify', 'diff', 'upload']
      pipes.forEach((p) => {
        if (!this[p].failed.length) return
        this[p].failed.forEach((x) => {
          if (Array.isArray(x)) x.forEach(c => this.errors.push(Object.assign({ pipe: p }, c, { task: c.task.uuid })))
          else this.errors.push(Object.assign({ pipe: p }, x, { task: x.task.uuid }))
        })
      })
      if (this.root.isStopped() || this.errors.length > 15) this.finish()
    }

    this.root = this.changed ? this.fastCount : this.readDir
    this.root.pipe(this.classify).pipe(this.diff).pipe(this.upload)

    this.root.on('data', this.onData)
    this.root.on('step', this.onStep)
  }

  run () {
    if (this.changed) {
      this.root.push({
        changed: this.changed, dirUUID: this.dirUUID, driveUUID: this.driveUUID, rootPath: this.rootPath, task: this
      })
    } else {
      this.root.push({ entries: this.localEntries, dirUUID: this.dirUUID, driveUUID: this.driveUUID, task: this })
    }
  }

  status () {
    return Object.assign({}, this.props, {
      completeSize: this.completeSize,
      skipSize: this.skipSize,
      count: Math.max(this.diffCount, this.readDirCount),
      finishCount: this.finishCount,
      size: Math.max(this.diffSize, this.readDirSize),
      state: this.state,
      warnings: this.warnings,
      errors: this.errors
    })
  }

  finish () {
    if (this.state === 'finished') return
    this.state = 'finished'
    this.root.clear()
    for (let i = this.reqHandles.length - 1; i >= 0; i--) {
      this.reqHandles[i].abort()
    }
    this.onFinished(this.errors, this.warnings)
  }
}

module.exports = Task
