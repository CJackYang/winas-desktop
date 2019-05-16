import i18n from 'i18n'
import UUID from 'uuid'
import React from 'react'
import { RaisedButton } from 'material-ui'
import OpenIcon from 'material-ui/svg-icons/action/open-with'
import DownloadIcon from 'material-ui/svg-icons/file/file-download'

import PDFView from './PDF'
import PhotoDetail from './PhotoDetail'
import DialogOverlay from '../common/DialogOverlay'
import { RSButton } from '../common/Buttons'
import CircularLoading from '../common/CircularLoading'

class Preview extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      pages: null,
      alert: false
    }

    this.close = () => {
      this.props.close()
    }

    this.toggleDialog = op => this.setState({ [op]: !this.state[op] })

    this.downloadSuccess = (event, session, path) => {
      if (this.session === session) {
        clearTimeout(this.time)
        this.session = ''
        if (this.props.item.size > 1024) {
          this.time = setTimeout(() => {
            this.setState({ filePath: path })
          }, 500)
        } else {
          this.setState({ filePath: path })
        }
      }
    }

    this.getArgs = () => {
      this.session = UUID.v4()
      const session = this.session
      const driveUUID = this.props.item.pdrv || this.props.path[0].uuid
      const dirUUID = this.props.item.pdir || this.props.path.slice(-1)[0].uuid
      const entryUUID = this.props.item.uuid || this.session
      const fileName = this.props.item.name
      const hash = this.props.item.hash
      const domain = this.props.isMedia ? 'media' : 'drive'
      return ({ driveUUID, dirUUID, entryUUID, fileName, hash, domain, session })
    }

    this.openByLocal = () => {
      if (this.props.item.size > 50 * 1024 * 1024) this.setState({ alert: true })
      else {
        this.props.ipcRenderer.send('OPEN_FILE', this.getArgs())
        this.props.close()
      }
    }

    this.startDownload = () => {
      this.props.ipcRenderer.send('TEMP_DOWNLOADING', this.getArgs())
      this.props.ipcRenderer.on('TEMP_DOWNLOAD_SUCCESS', this.downloadSuccess)
    }

    this.getRandomSrc = () => {
      const { metadata, hash } = this.props.item
      this.session = UUID.v4()
      this.props.apis.pureRequest('randomSrc', { hash }, (error, data) => {
        const ext = metadata && metadata.type && metadata.type.toLowerCase()
        if (error) console.error('randomSrc error', error)
        else this.setState({ filePath: `http://${this.props.apis.address}:3000/media/${data.random}.${ext}` })
        this.session = ''
      })
    }

    /* download text file and read file */
    this.getTextData = () => {
      this.props.ipcRenderer.send('GET_TEXT_DATA', this.getArgs())
      this.props.ipcRenderer.on('GET_TEXT_DATA_SUCCESS', this.getTextDataSuccess)
    }

    this.getTextDataSuccess = (event, session, res) => {
      if (this.session === session) {
        clearTimeout(this.time)
        this.session = ''
        if (this.props.item.size > 1024) { // actually, filePath is the content of target file
          this.time = setTimeout(() => {
            this.setState({ filePath: res.filePath, data: res.data })
          }, 500)
        } else {
          this.setState({ filePath: res.filePath, data: res.data })
        }
      }
    }

    /* stop video buffer */
    this.addPauseEvent = (video) => {
      video.addEventListener('pause', () => {
        const playtime = video.currentTime
        const tmpSrc = video.src
        video.src = ''
        video.load()
        video.src = tmpSrc
        video.currentTime = playtime
      }, { once: true })
      video.addEventListener('play', () => {
        this.addPauseEvent(video)
      }, { once: true })
    }

    this.isCenter = this.props.isCenter // 'true' in center
  }

  componentDidMount () {
    const { hash, size, metadata } = this.props.item
    const officeMagic = ['DOCX', 'DOC', 'XLSX', 'XLS', 'PPT', 'PPTX']
    const isOffice = metadata && officeMagic.includes(metadata.type) && hash && size < 1024 * 1024 * 50
    if (isOffice && this.isCenter) this.openByLocal()
    else this.forceUpdate()
  }

  componentDidUpdate () {
    if (!this.refVideo || !this.props.parent) return

    if (this.props.parent.style.left === '0px' && this.refVideo.paused && !this.played) {
      this.played = true
      this.refVideo.play()
      this.addPauseEvent(this.refVideo)
    } else if (this.props.parent.style.left !== '0px') {
      this.played = false
      this.refVideo.pause()
    }
  }

  renderPhoto (hash, metadata) {
    const item = Object.assign({}, metadata, { hash })
    return (
      <PhotoDetail
        item={item}
        detailInfo={this.props.detailInfo}
        ipcRenderer={this.props.ipcRenderer}
        updateContainerSize={this.props.updateContainerSize}
      />
    )
  }

  renderDoc (type) {
    return (
      <div
        style={{
          height: 'calc(100% - 160px)',
          width: 'calc(100% - 200px)',
          backgroundColor: '#FFFFFF',
          overflowY: 'auto',
          position: 'relative'
        }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
      >
        <div style={{ width: '100%', height: '100%', position: 'relative' }} className="flexCenter">
          {type === 'pdf' ? this.renderPDF() : this.renderRawText()}
        </div>
      </div>
    )
  }

  renderRawText () {
    if (this.name === this.props.item.name && this.state.filePath) {
      return (
        <div
          style={{ height: '100%', width: '100%', backgroundColor: '#FFFFFF', overflowY: 'auto' }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
        >
          <code>
            <pre style={{ margin: '0 20px', whiteSpace: 'pre-wrap', wordWrap: 'break-word', color: '#545558' }}>
              {this.state.data}
            </pre>
          </code>
        </div>
      )
    }

    if (!this.session) {
      this.name = this.props.item.name
      this.getTextData()
      this.state = Object.assign({}, this.state, { filePath: '', pages: null })
    }

    return (<CircularLoading />)
  }

  renderPDF () {
    if (this.name === this.props.item.name && this.state.filePath) {
      return (
        <div
          className="flexCenter"
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
          style={{ height: '100%', width: '100%', overflowY: 'auto', overflowX: 'hidden' }}
        >
          <PDFView filePath={this.state.filePath} />
        </div>
      )
    }

    if (!this.session) {
      this.name = this.props.item.name
      this.startDownload()
      this.state = Object.assign({}, this.state, { filePath: '', pages: null })
    }
    return (
      <CircularLoading />
    )
  }

  renderVideo () {
    return (
      <div
        style={{ height: 'calc(100% - 160px)', width: 'calc(100% - 200px)', backgroundColor: 'rgba(0,0,0,0)' }}
        onClick={e => e.stopPropagation()}
      >
        <video
          width="100%"
          height="100%"
          controls
          ref={ref => (this.refVideo = ref)}
          controlsList="nodownload"
          src={this.state.filePath}
        >
          <track kind="captions" />
        </video>
      </div>
    )
  }

  renderKnownVideo () {
    if (this.name === this.props.item.name && this.state.filePath) return this.renderVideo()

    if (!this.session) {
      this.name = this.props.item.name
      this.getRandomSrc()
      this.state = Object.assign({}, this.state, { filePath: '', pages: null })
    }

    return (<CircularLoading />)
  }

  renderAudio () {
    return (
      <div onClick={e => e.stopPropagation()}>
        <audio width="100%" height="100%" controls controlsList="nodownload">
          <source src={this.state.filePath} />
          <track kind="captions" />
        </audio>
      </div>
    )
  }

  renderKnownAudio () {
    if (this.name === this.props.item.name && this.state.filePath) return this.renderAudio()

    if (!this.session) {
      this.name = this.props.item.name
      this.getRandomSrc()
      this.state = Object.assign({}, this.state, { filePath: '', pages: null })
    }

    return (<CircularLoading />)
  }

  renderOtherFiles () {
    // debug('this.props renderOtherFiles', this.props)
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          height: 144,
          width: 360,
          backgroundColor: '#424242',
          borderRadius: '20px'
        }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
      >
        <div style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 500 }}>
          {i18n.__('Can Not Preview Text')}
        </div>
        <div style={{ height: 8 }} />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <RaisedButton
            label={i18n.__('Download')}
            primary
            style={{ margin: 12 }}
            icon={<DownloadIcon />}
            onClick={() => { this.props.download(); this.props.close() }}
          />
          <RaisedButton
            label={i18n.__('Open via Local App')}
            style={{ margin: 12 }}
            icon={<OpenIcon />}
            onClick={this.openByLocal}
          />
        </div>
      </div>
    )
  }

  renderLoading () {
    return (
      <div style={{ width: '100%', height: '100%' }} className="flexCenter">
        <CircularLoading />
      </div>
    )
  }

  render () {
    if (!this.props.item || !this.props.item.name) return (<div />)
    const isCloud = this.props && this.props.apis && this.props.apis.isCloud
    const isPhy = this.props.path && (this.props.path[0].isPhyRoot || this.props.path[0].isUSB || this.props.path[0].isPhy)

    const { metadata, hash, size } = this.props.item
    const photoMagic = ['JPEG', 'GIF', 'PNG', 'BMP']
    const videoMagic = ['MP4', 'MOV'] // ['3GP', 'MP4', 'MOV', 'MKV', 'AVI']
    const audioMagic = ['MP3', 'FLAC']
    const officeMagic = ['DOCX', 'DOC', 'XLSX', 'XLS', 'PPT', 'PPTX']
    const isPhoto = metadata && photoMagic.includes(metadata.type) && hash
    const isVideo = metadata && videoMagic.includes(metadata.type) && !isCloud && hash
    const isAudio = metadata && audioMagic.includes(metadata.type) && !isCloud && hash
    const isPDF = metadata && metadata.type === 'PDF' && (size < 1024 * 1024 * 50) && hash
    const isOffice = metadata && officeMagic.includes(metadata.type) && hash && size < 1024 * 1024 * 50 && this.isCenter

    const extension = this.props.item.name.replace(/^.*\./, '').toUpperCase()
    const textExtension = ['TXT', 'MD', 'JS', 'JSX', 'TS', 'JSON', 'HTML', 'CSS', 'LESS', 'CSV', 'XML']
    const isText = textExtension.findIndex(t => t === extension) > -1 && !isPhy &&
      (this.props.item.size < 1024 * 128) && !this.props.isMedia

    return (
      <div
        ref={ref => (this.refBackground = ref)}
        style={{ height: '100%', width: '100%', WebkitAppRegion: 'no-drag' }}
        className="flexCenter"
      >
        {
          isOffice ? this.renderLoading()
            : isPhoto ? this.renderPhoto(hash, metadata)
              : isVideo ? this.renderKnownVideo()
                : isAudio ? this.renderKnownAudio()
                  : isText ? this.renderDoc('text')
                    : isPDF ? this.renderDoc('pdf')
                      : this.renderOtherFiles()
        }
        {/* dialog */}
        <DialogOverlay open={this.state.alert} >
          {
            this.state.alert &&
            <div
              style={{ width: 380, padding: '20px 20px 0px 20px' }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
            >
              <div style={{ height: 60 }} className="title">
                {i18n.__('Tips')}
              </div>
              <div style={{ fontSize: 14, lineHeight: '30px', color: 'var(--grey-text)' }}>
                {i18n.__('File Oversize Text')}
              </div>
              <div style={{ height: 20 }} />
              <div style={{ height: 76, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <RSButton
                  alt
                  label={i18n.__('Cancel')}
                  onClick={() => this.setState({ alert: false })}
                />
                <div style={{ width: 10 }} />
                <RSButton
                  label={i18n.__('Download')}
                  onClick={() => { this.props.download(); this.setState({ alert: false }); this.props.close() }}
                />
              </div>
            </div>
          }
        </DialogOverlay>
      </div>
    )
  }
}

export default Preview
