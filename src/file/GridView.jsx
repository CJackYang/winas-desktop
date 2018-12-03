import i18n from 'i18n'
import React from 'react'
import prettysize from 'prettysize'
import { AutoSizer } from 'react-virtualized'
import { Menu, MenuItem, IconButton, Toggle, Popover, Checkbox } from 'material-ui'

import Name from './Name'
import Thumb from './Thumb'
import HoverTip from './HoverTip'
import ScrollBar from '../common/ScrollBar'
import renderFileIcon from '../common/renderFileIcon'
import { AllFileIcon, ArrowDownIcon, CheckedIcon, PCIcon, MobileIcon, SettingsIcon, FailedIcon, ChevronRightIcon, BackwardIcon } from '../common/Svg'
import { formatMtime } from '../common/datetime'
import FlatButton from '../common/FlatButton'
import { LIButton } from '../common/Buttons'
import SimpleScrollBar from '../common/SimpleScrollBar'

const hasThumb = (metadata) => {
  if (!metadata) return false
  const arr = ['PNG', 'JPEG', 'GIF', 'BMP', 'TIFF', 'MOV', '3GP', 'MP4', 'RM', 'RMVB', 'WMV', 'AVI', 'MPEG', 'MP4', '3GP', 'MOV', 'FLV', 'MKV', 'PDF']
  if (arr.includes(metadata.type)) return true
  return false
}

class Row extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      open: false
    }

    this.headers = [
      { title: i18n.__('Name'), up: 'nameUp', down: 'nameDown' },
      { title: i18n.__('Date Modified'), up: 'timeUp', down: 'timeDown' },
      { title: i18n.__('Date Taken'), up: 'takenUp', down: 'takenDown' },
      { title: i18n.__('Size'), up: 'sizeUp', down: 'sizeDown' }
    ]

    this.header = this.headers.find(header => (header.up === this.props.sortType) ||
      (header.down === this.props.sortType)) || this.headers[0]

    this.state = {
      type: this.header.title
    }

    this.handleChange = (type) => {
      if (this.state.type !== type) {
        switch (type) {
          case i18n.__('Date Modified'):
            this.props.changeSortType('timeUp')
            break
          case i18n.__('Size'):
            this.props.changeSortType('sizeUp')
            break
          case i18n.__('Date Taken'):
            this.props.changeSortType('takenUp')
            break
          default:
            this.props.changeSortType('nameUp')
        }
        this.setState({ type, open: false })
      } else {
        this.setState({ open: false })
      }
    }

    this.toggleMenu = (event) => {
      if (!this.state.open && event && event.preventDefault) event.preventDefault()
      this.setState({ open: event !== 'clickAway' && !this.state.open, anchorEl: event.currentTarget })
    }

    this.openSettings = (e, drive) => {
      e.stopPropagation()
      e.preventDefault()
      console.log('this.openSettings', drive)
    }

    this.handleClickAdd = (e, drive) => {
      e.stopPropagation()
      e.preventDefault()
      this.props.addBackupDir()
    }

    this.openSettings = (e) => {
      e.stopPropagation()
      e.preventDefault()
      this.setState({ openBS: true, anchorSetting: e.currentTarget })
    }
  }

  shouldComponentUpdate (nextProps) {
    return (!nextProps.isScrolling)
  }

  calcTime (time) {
    if (!time) return ''
    const date = new Date(time)
    return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', { hour12: false })}`
  }

  renderCurrentBackup (drive) {
    const { label, client } = drive
    const { lastBackupTime } = client
    const { showDirs } = this.state
    const transition = 'left 450ms'
    return (
      <div
        style={{
          backgroundColor: '#009688',
          height: '100%',
          width: '100%',
          boxSizing: 'border-box',
          padding: 16,
          position: 'relative'
        }}
      >
        <div style={{ height: 32, width: '100%', display: 'flex', alignItems: 'center' }}>
          <div style={{ color: '#FFF' }}>
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              { label }
            </div>
            <div style={{ fontSize: 12 }}>
              { i18n.__('Current Device') }
            </div>
          </div>
          <div style={{ flexGrow: 1 }} />
          <div
            style={{ width: 24, height: 24, cursor: 'pointer' }}
            onClick={this.openSettings}
            onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault() }}
          >
            <SettingsIcon style={{ color: '#FFF' }} onClick={e => this.openSettings(e, drive)} />
          </div>
          <Popover
            open={this.state.openBS}
            anchorEl={this.state.anchorSetting}
            anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
            targetOrigin={{ horizontal: 'left', vertical: 'top' }}
            onRequestClose={() => this.setState({ openBS: false, showDirs: false })}
          >
            <Menu style={{ maxWidth: 306, fontSize: 14, marginTop: -8 }} >
              <div style={{ position: 'relative', height: 354, width: 306, backgroundColor: '#FFF', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', height: '100%', width: '100%', left: showDirs ? '-100%' : 0, top: 0, transition }}>
                  <div style={{ height: 56, display: 'flex', alignItems: 'center', borderBottom: '1px solid #e8eaed' }}>
                    <div style={{ marginLeft: 16 }}> { i18n.__('Current Device Backup') } </div>
                    <div style={{ flexGrow: 1 }} />
                    <Toggle
                      defaultToggled
                      label={i18n.__('Enable')}
                      labelStyle={{ maxWidth: 'fit-content' }}
                      style={{ marginRight: 16, maxWidth: 'fit-content' }}
                    />
                  </div>
                  <div style={{ height: 8 }} />
                  <div style={{ height: 40, display: 'flex', alignItems: 'center', marginLeft: 16, color: 'rgba(0,0,0,.54)' }}>
                    { i18n.__('Settings') }
                  </div>
                  <MenuItem style={{ height: 48, fontSize: 14 }} onClick={() => this.setState({ showDirs: true })}>
                    { i18n.__('Manage Backup Dir') }
                    <div style={{ position: 'absolute', right: 16, top: 2 }}>
                      <ChevronRightIcon style={{ color: 'rgba(0,0,0,.38)', height: 16, width: 16 }} />
                    </div>
                  </MenuItem>
                  <MenuItem style={{ height: 48, fontSize: 14 }}>
                    { i18n.__('Backup Policy') }
                    <div style={{ position: 'absolute', right: 16, top: 2 }}>
                      <ChevronRightIcon style={{ color: 'rgba(0,0,0,.38)', height: 16, width: 16 }} />
                    </div>
                  </MenuItem>
                  <div style={{ height: 48, display: 'flex', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid #e8eaed' }}>
                    <div style={{ marginLeft: 16 }}> { i18n.__('Running Backup On Startup') } </div>
                    <div style={{ flexGrow: 1 }} />
                    <Toggle
                      defaultToggled
                      label={i18n.__('Enable')}
                      labelStyle={{ maxWidth: 'fit-content' }}
                      style={{ marginRight: 16, maxWidth: 'fit-content' }}
                    />
                  </div>
                  <div style={{ height: 8 }} />
                  <div style={{ height: 40, display: 'flex', alignItems: 'center', marginLeft: 16, color: 'rgba(0,0,0,.54)' }}>
                    { i18n.__('Notification') }
                  </div>
                  <div style={{ height: 48, display: 'flex', alignItems: 'center' }}>
                    <div style={{ marginLeft: 16 }}> { i18n.__('Enable Remove Backup Warnings') } </div>
                    <div style={{ flexGrow: 1 }} />
                    <Checkbox
                      defaultChecked
                      style={{ maxWidth: 'fit-content' }}
                    />
                  </div>
                </div>
                <div style={{ position: 'absolute', height: '100%', width: '100%', left: showDirs ? 0 : '100%', top: 0, transition }}>
                  <div style={{ height: 56, display: 'flex', alignItems: 'center', borderBottom: '1px solid #e8eaed' }}>
                    <LIButton
                      style={{ marginLeft: 8, zIndex: 10000 }}
                      onClick={() => this.setState({ showDirs: false })}
                    >
                      <BackwardIcon />
                    </LIButton>
                    <div style={{ marginLeft: 8 }}> { i18n.__('Manage Backup Dir') } </div>
                    <div style={{ flexGrow: 1 }} />
                    <div style={{ marginRight: 24 }}> { i18n.__('%s Items', 5) } </div>
                  </div>
                  <div style={{ height: 8 }} />
                  <SimpleScrollBar height={300} width={306} >
                    {
                      [1, 2, 3, 4, 5].map(v => (
                        <MenuItem style={{ height: 44, fontSize: 14 }} key={v}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <AllFileIcon style={{ width: 24, height: 24, color: '#ffa93e', marginRight: 16 }} />
                            { `${i18n.__('备份文件夹')}-${v}` }
                            <div style={{ position: 'absolute', right: 24, top: 2 }}>
                              <ChevronRightIcon style={{ color: 'rgba(0,0,0,.38)', height: 16, width: 16 }} />
                            </div>
                          </div>
                        </MenuItem>
                      ))
                    }
                  </SimpleScrollBar>
                </div>
              </div>
            </Menu>
          </Popover>
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#FFF', margin: '8px 0 4px 0' }}>
          { this.calcTime(lastBackupTime) }
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#FFF' }}>
          { lastBackupTime ? i18n.__('Backup Success') : i18n.__('Backup Not Finished') }
        </div>
        <div
          style={{
            height: 40,
            position: 'absolute',
            left: 16,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer'
          }}
          onClick={e => this.handleClickAdd(e, drive)}
          onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault() }}
        >
          <div style={{ transform: 'rotate(45deg)' }}>
            <FailedIcon style={{ color: '#FFF', height: 24, width: 24 }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#FFF', marginLeft: 16 }}>
            { i18n.__('Add Backup Directroy') }
          </div>
        </div>
      </div>
    )
  }

  renderBackupCard (drive, index) {
    if (!index) return this.renderCurrentBackup(drive)
    const { client, label } = drive
    const { type, lastBackupTime } = client
    let backgroundColor = '#039be5'
    let Icon = PCIcon
    switch (type) {
      case 'Win-PC':
        backgroundColor = '#039be5'
        Icon = PCIcon
        break
      case 'Mac-PC':
        backgroundColor = '#000000'
        Icon = PCIcon
        break
      case 'Android-Mobile':
        backgroundColor = '#43a047'
        Icon = MobileIcon
        break
      case 'IOS-Mobile':
        backgroundColor = '#000000'
        Icon = MobileIcon
        break
      default:
        break
    }
    return (
      <div style={{ height: 108, width: 'calc(100% - 64px)' }} >
        <div
          className="flexCenter"
          style={{ height: 40, width: 40, marginBottom: 16, backgroundColor, borderRadius: 20, overflow: 'hidden' }}
        >
          <Icon style={{ color: '#FFF' }} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>
          { label }
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(0,0,0,.54)', margin: '8px 0 4px 0' }}>
          { this.calcTime(lastBackupTime) }
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(0,0,0,.54)' }}>
          { i18n.__('Backup Success') }
        </div>
      </div>
    )
  }

  render () {
    const { select, list, isScrolling, rowSum, inPublicRoot, sortType, changeSortType, size } = this.props
    const h = this.headers.find(header => header.title === this.state.type) || this.headers[0]
    return (
      <div style={{ height: '100%', width: '100%' }} >
        {/* header */}
        {
          list.first && list.entries[0].entry.type !== 'backup' &&
            <div style={{ height: 48, display: 'flex', alignItems: 'center ' }}>
              <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.54)', width: 64 }}>
                { list.entries[0].entry.type === 'directory' ? i18n.__('Directory') : i18n.__('File') }
              </div>
              <div style={{ flexGrow: 1 }} />
              {
                !list.entries[0].index && !this.props.inPublicRoot &&
                  <div style={{ display: 'flex', alignItems: 'center ', marginRight: 84 }}>
                    <FlatButton
                      label={this.state.type}
                      labelStyle={{ fontSize: 14, color: 'rgba(0,0,0,0.54)' }}
                      onClick={this.toggleMenu}
                    />
                    {/* menu */}
                    <Popover
                      open={this.state.open}
                      anchorEl={this.state.anchorEl}
                      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                      targetOrigin={{ horizontal: 'right', vertical: 'top' }}
                      onRequestClose={this.toggleMenu}
                    >
                      <Menu style={{ minWidth: 240 }}>
                        <MenuItem
                          style={{ fontSize: 13 }}
                          leftIcon={this.state.type === i18n.__('Name') ? <CheckedIcon /> : <div />}
                          primaryText={i18n.__('Name')}
                          onClick={() => this.handleChange(i18n.__('Name'))}
                        />
                        <MenuItem
                          style={{ fontSize: 13 }}
                          leftIcon={this.state.type === i18n.__('Date Modified') ? <CheckedIcon /> : <div />}
                          primaryText={i18n.__('Date Modified')}
                          onClick={() => this.handleChange(i18n.__('Date Modified'))}
                        />
                        <MenuItem
                          style={{ fontSize: 13 }}
                          leftIcon={this.state.type === i18n.__('Date Taken') ? <CheckedIcon /> : <div />}
                          primaryText={i18n.__('Date Taken')}
                          onClick={() => this.handleChange(i18n.__('Date Taken'))}
                        />
                        <MenuItem
                          style={{ fontSize: 13 }}
                          leftIcon={this.state.type === i18n.__('Size') ? <CheckedIcon /> : <div />}
                          primaryText={i18n.__('Size')}
                          onClick={() => this.handleChange(i18n.__('Size'))}
                        />
                      </Menu>
                    </Popover>

                    {/* direction icon */}
                    <IconButton
                      style={{ height: 36, width: 36, padding: 9, borderRadius: '18px' }}
                      iconStyle={{
                        height: 18,
                        width: 18,
                        color: 'rgba(0,0,0,0.54)',
                        transition: 'transform 0ms',
                        transform: (sortType === h.up || !sortType) ? 'rotate(180deg)' : ''
                      }}
                      hoveredStyle={{ backgroundColor: 'rgba(0,0,0,0.18)' }}
                      onClick={() => { sortType === h.up || !sortType ? changeSortType(h.down) : changeSortType(h.up) }}
                    >
                      { sortType === h.up || !sortType ? <ArrowDownIcon /> : <ArrowDownIcon /> }
                    </IconButton>
                  </div>
              }
            </div>
        }
        {
          list.first && list.entries[0].entry.type === 'backup' && <div style={{ height: 24 }} />
        }
        {/* onMouseDown: clear select and start grid select */}
        {
          isScrolling ? (
            <div style={{ display: 'flex' }}>
              {
                list.entries.map((item) => {
                  const { index, entry } = item
                  const backgroundColor = '#FFF'
                  return (
                    <div
                      style={{
                        position: 'relative',
                        width: size,
                        height: entry.type !== 'directory' ? size : 48,
                        marginRight: 16,
                        marginBottom: 16,
                        backgroundColor,
                        overflow: 'hidden',
                        borderRadius: 6,
                        boxSizing: 'border-box',
                        boxShadow: 'rgba(0, 0, 0, 0.118) 0px 1px 6px, rgba(0, 0, 0, 0.118) 0px 1px 4px'
                      }}
                      role="presentation"
                      key={index}
                    >
                      {/* preview or icon */}
                      {
                        entry.type !== 'directory' &&
                          <div
                            draggable={false}
                            className="flexCenter"
                            style={{
                              height: size - 48,
                              width: size,
                              margin: 0,
                              overflow: 'hidden',
                              backgroundColor: '#f0f0f0'
                            }}
                          />
                      }

                      {/* file name */}
                      <div style={{ height: 48, width: size, position: 'relative', display: 'flex', alignItems: 'center' }} >
                        <div style={{ width: 24, margin: '0px 16px' }}>
                          { entry.type === 'directory' ? <AllFileIcon style={{ width: 24, height: 24, color: '#ffa93e' }} />
                            : renderFileIcon(entry.name, entry.metadata, 24) }
                        </div>
                        <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: '#525a60' }} >
                          { entry.name }
                        </div>
                        <div style={{ width: 8 }} />
                      </div>
                    </div>
                  )
                })
              }
            </div>
          )
            : <div style={{ display: 'flex' }} >
              {
                list.entries.map((item) => {
                  const { index, entry } = item
                  const selected = select.selected.findIndex(s => s === index) > -1
                  const isOnModify = select.modify === index && !inPublicRoot
                  const hover = select.hover === index && !selected
                  const backgroundColor = selected ? '#f4fafe' : hover ? '#f9fcfe' : '#FFF'
                  if (entry.type === 'backup') {
                    return (
                      <div
                        key={entry.uuid}
                        className="flexCenter"
                        onClick={e => this.props.onRowClick(e, index)}
                        onDoubleClick={e => this.props.onRowDoubleClick(e, index)}
                        style={{
                          height: size,
                          width: size,
                          borderRadius: 4,
                          marginRight: 16,
                          marginBottom: 16,
                          boxShadow: '0px 1px 0.9px 0.1px rgba(0, 0, 0, 0.24), 0 0 1px 0px rgba(0, 0, 0, 0.16)'
                        }}
                      >
                        { this.renderBackupCard(entry, index) }
                      </div>
                    )
                  }
                  return (
                    <div
                      style={{
                        position: 'relative',
                        width: size,
                        height: entry.type !== 'directory' ? size : 48,
                        marginRight: 16,
                        marginBottom: 16,
                        backgroundColor,
                        boxSizing: 'border-box',
                        boxShadow: selected ? 'rgba(0, 0, 0, 0.19) 0px 10px 16px, rgba(0, 0, 0, 0.227) 0px 6px 10px'
                          : 'rgba(0, 0, 0, 0.118) 0px 1px 6px, rgba(0, 0, 0, 0.118) 0px 1px 4px'
                      }}
                      role="presentation"
                      onClick={e => this.props.onRowClick(e, index)}
                      onMouseUp={(e) => { e.preventDefault(); e.stopPropagation() }}
                      onContextMenu={e => this.props.onRowContextMenu(e, index)}
                      onMouseEnter={e => this.props.onRowMouseEnter(e, index)}
                      onMouseLeave={e => this.props.onRowMouseLeave(e, index)}
                      onDoubleClick={e => this.props.onRowDoubleClick(e, index)}
                      onMouseDown={e => e.stopPropagation() || this.props.gridDragStart(e, index)}
                      key={index}
                    >
                      {/* preview or icon */}
                      {
                        entry.type !== 'directory' &&
                          <div
                            draggable={false}
                            className="flexCenter"
                            style={{ height: size - 48, width: size, margin: 0, overflow: 'hidden' }}
                          >
                            {
                              entry.type === 'directory'
                                ? <AllFileIcon style={{ width: 48, height: 48, color: '#ffa93e' }} />
                                : ((rowSum < 500 || !isScrolling) && entry.hash && hasThumb(entry.metadata)
                                  ? (
                                    <Thumb
                                      full={false}
                                      name={entry.name}
                                      metadata={entry.metadata}
                                      bgColor="#FFFFFF"
                                      digest={entry.hash}
                                      ipcRenderer={this.props.ipcRenderer}
                                      height={size - 48}
                                      width={size}
                                    />
                                  ) : renderFileIcon(entry.name, entry.metadata, 48)
                                )
                            }
                          </div>
                      }

                      {/* file name */}
                      <div
                        style={{ height: 48, width: size, position: 'relative', display: 'flex', alignItems: 'center' }}
                      >
                        <div style={{ width: 24, margin: '0px 16px' }}>
                          { entry.type === 'directory' ? <AllFileIcon style={{ width: 24, height: 24, color: '#ffa93e' }} />
                            : renderFileIcon(entry.name, entry.metadata, 24) }
                        </div>
                        <Name
                          center
                          refresh={() => this.props.refresh({ noloading: true })}
                          openSnackBar={this.props.openSnackBar}
                          entry={entry}
                          entries={this.props.entries}
                          modify={isOnModify}
                          apis={this.props.apis}
                          path={this.props.path}
                        />
                        <div style={{ width: 8 }} />
                      </div>
                    </div>
                  )
                })
              }
            </div>
        }
      </div>
    )
  }
}

class GridView extends React.Component {
  constructor (props) {
    super(props)

    this.scrollToRow = index => this.ListRef.scrollToRow(index)

    this.getStatus = () => this.gridData

    this.calcGridData = () => {
      this.gridData = {
        mapData: this.mapData.reduce((acc, val, index) => {
          val.entries.forEach(() => acc.push(index))
          return acc
        }, []),
        allHeight: this.allHeight, // const rowHeight = ({ index }) => allHeight[index]
        indexHeightSum: this.indexHeightSum,
        scrollTop: this.getScrollToPosition(),
        cellWidth: this.size
      }

      this.props.setGridData(this.gridData)
    }

    this.getScrollToPosition = () => (this.scrollTop || 0)

    this.onScroll = ({ scrollTop }) => {
      this.scrollTop = scrollTop
      this.props.onScroll(scrollTop)
    }

    this.onMouseMove = (e) => {
      this.mouseX = e.clientX
      this.mouseY = e.clientY
    }
  }

  componentDidMount () {
    this.calcGridData()
  }

  componentDidUpdate () {
    if (this.props.scrollTo) {
      const index = this.props.entries.findIndex(entry => entry.name === this.props.scrollTo)
      if (index > -1) {
        let rowIndex = 0
        let sum = 0
        /* calc rowIndex */
        for (let i = 0; i < this.mapData.length; i++) {
          sum += this.mapData[i].entries.length
          if (index < sum) break
          rowIndex += 1
        }
        if (rowIndex < this.mapData.length) this.scrollToRow(rowIndex)
        this.props.resetScrollTo()
        this.props.select.touchTap(0, index)
      }
    }
    this.calcGridData()
  }

  renderHoverTip () {
    const longHover = this.props.select && this.props.select.longHover
    const hover = this.props.select && this.props.select.hover
    const entry = this.props.entries[longHover] || this.props.entries[hover] || {}
    const top = Math.min(this.mouseY, window.innerHeight - 100)
    const left = Math.min(this.mouseX, window.innerWidth - 400)
    return (
      <div
        style={{
          position: 'fixed',
          top,
          left,
          maxWidth: 400,
          boxSizing: 'bordr-box',
          padding: 5,
          color: '#292936',
          fontSize: 12,
          backgroundColor: '#FFF',
          border: 'solid 1px #d9d9d9'
        }}
      >
        <div>
          { `${i18n.__('Name')}: ${entry.name}` }
        </div>
        {
          entry.type !== 'directory' && (
            <div>
              { `${i18n.__('Size')}: ${prettysize(entry.size, false, true, 2).toUpperCase()}` }
            </div>
          )
        }
        {
          entry.mtime && (
            <div>
              { `${i18n.__('Date Modified')}: ${formatMtime(entry.mtime)}` }
            </div>
          )
        }
      </div>
    )
  }

  calcGridInfo (height, width, entries) {
    if (height !== this.preHeight || width !== this.preWidth || entries !== this.preEntries || !this.preData) { // singleton
      const MAX = Math.floor((width - (24 - 16)) / (180 + 16)) // Min Size: 180, margin-between: 16, margin-right: 24
      const size = Math.floor((width - (24 - 16)) / MAX - 16)
      let MaxItem = 0
      let lineIndex = 0
      let lastType = 'diriectory'
      this.allHeight = []
      this.rowHeightSum = 0
      this.indexHeightSum = []
      this.maxScrollTop = 0

      const firstFileIndex = entries.findIndex(item => item.type !== 'directory')
      this.mapData = []
      entries.forEach((entry, index) => {
        if (MaxItem === 0 || lastType !== entry.type) {
          /* add new row */
          this.mapData.push({
            first: (!index || index === firstFileIndex),
            index: lineIndex,
            entries: [{ entry, index }]
          })

          MaxItem = MAX - 1
          lastType = entry.type
          lineIndex += 1
        } else {
          MaxItem -= 1
          this.mapData[this.mapData.length - 1].entries.push({ entry, index })
        }
      })

      /* simulate large list */
      for (let i = 1; i <= 0; i++) {
        this.mapData.push(...this.mapData)
      }
      /* calculate each row's heigth and their sum */
      this.mapData.forEach((list) => {
        const tmp = 64 + !!list.first * 48 + (list.entries[0].entry.type !== 'directory') * (size + 16 - 64)
        this.allHeight.push(tmp)
        this.rowHeightSum += tmp
        this.indexHeightSum.push(this.rowHeightSum)
      })

      this.maxScrollTop = this.rowHeightSum - height
      if (this.rowHeightSum > 1500000) {
        const r = this.rowHeightSum / 1500000
        this.indexHeightSum = this.indexHeightSum.map(h => h / r)
        this.maxScrollTop = 1500000 - height
      }

      this.preHeight = height
      this.preWidth = width
      this.preEntries = entries
      this.preData = {
        size,
        mapData: this.mapData,
        allHeight: this.allHeight,
        rowHeightSum: this.rowHeightSum,
        indexHeightSum: this.indexHeightSum,
        maxScrollTop: this.maxScrollTop
      }
    }

    return this.preData
  }

  render () {
    if (!this.props.entries || this.props.entries.length === 0) return (<div />)
    return (
      <div
        style={{ width: 'calc(100% - 48px)', marginLeft: 48, height: '100%' }}
        onDrop={this.props.drop}
        onMouseMove={this.onMouseMove}
        onMouseDown={e => this.props.onRowClick(e, -1) || this.props.selectStart(e)}
      >
        <AutoSizer>
          {({ height, width }) => {
            const gridInfo = this.calcGridInfo(height, width, this.props.entries)
            const { mapData, allHeight, rowHeightSum, size } = gridInfo

            /* To get row index of scrollToRow */
            this.mapData = mapData
            this.allHeight = allHeight
            this.size = size

            const estimatedRowSize = rowHeightSum / allHeight.length
            const rowHeight = ({ index }) => allHeight[index]

            const rowRenderer = ({ key, index, style, isScrolling }) => (
              <div key={key} style={style} >
                <Row
                  {...this.props}
                  size={size}
                  rowSum={mapData.length}
                  isScrolling={isScrolling}
                  list={mapData[index]}
                />
              </div>
            )

            return (
              <div
                role="presentation"
                onMouseUp={e => this.props.onRowClick(e, -1)}
                onContextMenu={e => this.props.onRowContextMenu(e, -1)}
                onMouseMove={e => this.props.selectGrid(e, this.getStatus())}
                onMouseDown={e => this.props.onRowClick(e, -1) || this.props.selectStart(e)}
              >
                <ScrollBar
                  ref={ref => (this.ListRef = ref)}
                  allHeight={rowHeightSum}
                  height={height}
                  width={width}
                  estimatedRowSize={estimatedRowSize}
                  rowHeight={rowHeight}
                  rowRenderer={rowRenderer}
                  rowCount={gridInfo.mapData.length}
                  onScroll={this.onScroll}
                  overscanRowCount={10}
                  style={{ outline: 'none' }}
                />
              </div>
            )
          }}
        </AutoSizer>
        <HoverTip
          longHover={this.props.select && this.props.select.longHover}
          hover={this.props.select && this.props.select.hover}
          entries={this.props.entries}
          mouseX={this.mouseX}
          mouseY={this.mouseY}
          onMouseEnter={this.props.onRowMouseEnter}
          onMouseLeave={this.props.onRowMouseLeave}
        />
      </div>
    )
  }
}

export default GridView
