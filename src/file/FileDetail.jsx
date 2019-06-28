import i18n from 'i18n'
import React from 'react'
import { Divider } from 'material-ui'
import { LIButton } from '../common/Buttons'
import prettySize from '../common/prettySize'
import { localMtime } from '../common/datetime'
import renderFileIcon from '../common/renderFileIcon'
import {
  TypeSmallIcon, LocationSmallIcon, SizeSmallIcon,
  ContentSmallIcon, MTimeSmallIcon, CloseIcon, AllFileIcon, PublicIcon
} from '../common/Svg'

const getType = (item) => {
  const type = item && item.type
  if (type === 'public') return i18n.__('Public Drive')
  if (type === 'directory') return i18n.__('Directory')
  if (type === 'file') return i18n.__('File')
  return i18n.__('Unknown File Type')
}

const getPath = (path) => {
  const newPath = []
  console.log('getPath', path)
  path.map((item, index) => {
    if (!index) {
      newPath.push(item.type === 'public' ? i18n.__('Public Drive') : item.type === 'home' ? i18n.__('Home Title') : item.name)
    } else {
      newPath.push(item.name)
    }
    return null
  })
  return newPath.join('/')
}

// const getSearchPath = (path, entry) => {
//   console.log('getSearchPath', path, entry)
//   if (!Array.isArray(path) || !path[0] || !entry || !Array.isArray(entry.namepath)) return '--'
//   const r = path[0]
//   const rootName = r.type === 'publicRoot' ? i18n.__('Public Drive') : r.type === 'home' ? i18n.__('Home Title') : r.name
//   const newPath = [rootName, ...entry.namepath]
//   newPath.length = entry.namepath.length
//   return newPath.join('/')
// }

class FileDetail extends React.PureComponent {
  constructor (props) {
    super(props)
    this.state = {
      loading: true,
      searchPath: '',
      dirCount: 0,
      fileCount: 0,
      fileTotalSize: 0
    }

    this.reqAsync = async () => {
      this.setState({ loading: true })
      const { selected, entries, path } = this.props
      let [dirCount, fileCount, fileTotalSize] = [0, 0, 0]
      let searchPath = ''

      for (let i = 0; i < selected.length; i++) {
        const entry = entries[selected[i]]
        if (['directory', 'public'].includes(entry.type) || entry.isUSB) {
          if (selected.length > 1) dirCount += 1
          const driveUUID = entry.type === 'public' ? entry.uuid : path[0].uuid
          const dirUUID = entry.uuid
          const res = await this.props.apis.pureRequestAsync('content', { driveUUID, dirUUID })
          dirCount += res.dirCount
          fileCount += res.fileCount
          fileTotalSize += res.fileTotalSize
        } else {
          fileCount += 1
          fileTotalSize += entry.size
        }
      }

      if (this.props.isSearch && this.props.selected.length === 1) {
        const entry = entries[selected[0]]
        const driveUUID = entry.pdrv
        const dirUUID = entry.pdir
        const res = await this.props.apis.pureRequestAsync('listNavDir', { driveUUID, dirUUID })
        const paths = [this.transformLocation(entry.loc)]
        if (entry.loc === 'backup') {
          paths.push(entry.driveLabel)
        }
        // skip first item
        const rest = res.path.map(p => p.name).splice(1)
        paths.push(...rest)
        searchPath = paths.join('/')
      }
      console.log(dirCount, fileCount, fileTotalSize, searchPath)
      return ({ dirCount, fileCount, fileTotalSize, searchPath })
    }
  }

  componentDidMount () {
    this.reqAsync()
      .then((content) => {
        const { dirCount, fileCount, fileTotalSize, searchPath } = content
        this.setState({ dirCount, fileCount, fileTotalSize, searchPath, loading: false })
      })
      .catch(e => console.error('req dir content error', e))
  }

  transformLocation (loc) {
    switch (loc) {
      case 'home':
        return i18n.__('Home Title')
      case 'built-in':
        return i18n.__('Public Title')
      case 'backup':
        return i18n.__('Backup Title')
      default:
        return ''
    }
  }

  getSearchPath () {
    return this.state.loading ? i18n.__('Loading') : this.state.searchPath
  }

  getSize () {
    return this.state.loading ? i18n.__('Loading') : prettySize(this.state.fileTotalSize)
  }

  getContent () {
    const { loading, dirCount, fileCount } = this.state
    if (loading) return i18n.__('Loading')
    if (!dirCount) return i18n.__('File Count %s', fileCount)
    return i18n.__('Content %s %s', dirCount, fileCount)
  }

  renderList (icons, titles, values) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'column', width: '100%' }}>
        {
          values.map((value, index) => {
            if (!value) return (<div key={index.toString()} />)
            const Icon = icons[index]
            const title = titles[index]
            return (
              <div
                key={index.toString()}
                style={{ height: 40, color: '#525a60', display: 'flex', alignItems: 'center', width: '100%' }}
              >
                <div style={{ margin: '2px 2px 0px -5px' }}> <Icon style={{ color: '#85868c' }} /> </div>
                <div style={{ width: 70 }}> { title } </div>
                <input
                  onChange={() => {}}
                  value={value}
                  style={{
                    width: 170,
                    border: 0,
                    padding: 3,
                    fontSize: 14,
                    color: '#888a8c',
                    textAlign: 'right',
                    backgroundColor: '#FFF'
                  }}
                />
              </div>
            )
          })
        }
      </div>
    )
  }

  render () {
    const { selected, entries, path, isSearch, isUSB } = this.props
    const entry = entries[selected[0]]
    if (!entry) return <div />

    const isFile = selected.length === 1 && entry.type === 'file'
    const isMultiple = selected.length > 1

    const Icons = [
      TypeSmallIcon,
      LocationSmallIcon,
      SizeSmallIcon,
      ContentSmallIcon,
      MTimeSmallIcon
    ]

    const Titles = [
      i18n.__('Type'),
      i18n.__('Location'),
      i18n.__('Size'),
      i18n.__('Fold Content'),
      i18n.__('Date Modified')
    ]
    // mtime from bakcup or upload time
    const mtime = entry.bmtime || entry.mtime
    const Values = [
      isMultiple ? i18n.__('Multiple Items') : getType(entry),
      !isSearch ? getPath(path) : !isMultiple ? this.getSearchPath() : '',
      isUSB ? '' : isFile ? prettySize(entry.size) : this.getSize(),
      isUSB ? '' : !isFile ? this.getContent() : '',
      !isMultiple ? localMtime(mtime) : ''
    ]

    return (
      <div style={{ width: 280, margin: '0 20px 20px 20px' }}>
        <div style={{ height: 59, display: 'flex', alignItems: 'center' }} className="title">
          <div style={{ display: 'flex', alignItems: 'center', height: 59 }} >
            { i18n.__('Properties') }
          </div>
          <div style={{ flexGrow: 1 }} />
          <div style={{ marginRight: -10 }}>
            <LIButton onClick={this.props.onRequestClose} >
              <CloseIcon />
            </LIButton>
          </div>
        </div>
        <Divider style={{ width: 280 }} className="divider" />
        <div style={{ height: 20 }} />

        <div style={{ height: 60, display: 'flex', alignItems: 'center' }} >
          <div style={{ marginRight: 4, marginLeft: -6 }} className="flexCenter">
            {
              entry.type === 'public' ? <PublicIcon style={{ width: 60, height: 60, color: '#ffa93e' }} />
                : entry.type === 'file' ? renderFileIcon(entry.name, entry.metadata, 60)
                  : <AllFileIcon style={{ width: 60, height: 60, color: '#ffa93e' }} />
            }
          </div>
          <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', color: '#525a60' }} >
            <div
              style={{
                maxWidth: selected.length > 1 ? 120 : 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginRight: 4
              }}
            >
              { entry.name }
            </div>
            <div>
              { selected.length > 1 && i18n.__('And Other %s Items', selected.length)}
            </div>
          </div>
        </div>

        <div style={{ height: 10 }} />
        {/* data */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          { this.renderList(Icons, Titles, Values) }
        </div>
      </div>
    )
  }
}

export default FileDetail
