# Winas Desktop

基于 Electron + React 开发的口袋网盘PC客户端

+ 项目地址 https://github.com/aidingnan/winas-desktop

+ 本地项目路径
    - linux: /home/lxw/winas-desktop
    - mac: /Users/wisnuc-imac/Github/winas-desktop
    - windows: ~/Desktop/winas-desktop

### 项目文档

[fruitmix-desktop docs](https://github.com/wisnuc/fruitmix-desktop/tree/master/doc)

[winas-desktop docs](https://github.com/aidingnan/winas-desktop/tree/master/doc)

### 项目启动

```bash
# 安装git和node
sudo apt-get install git
sudo apt-get install npm
sudo npm install -g n
sudo n 10.16.2
node -v

# clone 项目
git clone https://github.com/aidingnan/winas-desktop.git
cd winas-desktop

# 安装依赖包
npm install --registry=https://registry.npm.taobao.org

# rebuilde二进制包，主要是fs-xattr
npm run rebuild

# 打包文件
npm run webpack2

# 启动项目
npm start
```

### 开发相关脚本

```bash
npm run webpack             # webpack with HMR
NODE_ENV=dev npm start      # start with devtools
CONN_MODE=remote npm start  # remote mode
# script of running dev mode on Windows
$env:NODE_ENV='dev';.\口袋网盘.exe
```

### 版本发布

使用`electron-builder`打包，配置文件是`electron-builder.yml`，相关文档见[docs](https://www.electron.build/)

+ 下载源码

目前三台电脑都已下载本地项目

```bash
git clone https://github.com/aidingnan/winas-desktop.git
cd winas-desktop
npm install
npm run rebuild
npm run webpack2
```

+ 更新代码

```bash
git pull
npm run webpack2
```

+ windows下打包

需要在windows环境下运行， 打包32位和64位两个版本，打包完成的文件会放在dist目录下，如`KouDaiWangPan-1.0.7-x64.dmg`

```bash
arch=ia32 npm run dist-ia32 && arch=x64 npm run dist-x64
```

+ mac下打包

需要mac环境下运行，打包完成的文件会放在dist目录下，如`KouDaiWangPan-1.0.7.dmg`， 需要notarize, 见Mac电脑的 ~/Desktop/desktop/notarize-app.txt

```bash
npm run dist-mac
```

+ linux下打包

生成deb文件，打包完成的文件会放在dist目录下，如`KouDaiWangPan-1.0.7.deb`

```bash
npm run dist-linux
```
### 项目逻辑

+ 登录逻辑 主要代码在`src/login`

  - 目前支持使用帐户密码和微信来登录云帐户，登录后获取访问云api的token，同时获取已绑定的设备列表
  
  - 登录用户选择的特定口袋网盘，主要是通过云获取口袋网盘的局域网用的token，同时通过调用3001端口的`winasd/info` api 判断设备是否在局域网内。
  
  - 在局域网内则使用ip直接访问，在外网环境则走云的pipe通道访问

+ 文件的上传、下载和备份 主要代码在`lib/backup.js`, `lib/backupTransform.js`, `lib/upload.js`, `lib/uploadTransform.js`, `lib/download.js`, `lib/downloadTransform.js`, `lib/transform.js`

  - 这部

+ 多语言

  使用`i18n`库来实现，在locales/下写好en-US、zh-CN的两个json文件，使用i18n.__('somekey')的形式获取对应的文本

### 项目结构

* dist : 打包后的安装文件

* doc : 项目文档目录

+ electron-builder.yml : 打包的配置文件

* lib : node端代码目录

    * app.js node端入口
    * window.js 设定 Browser 窗口的配置，包括启动主界面窗口、About界面等
    * server.js 与服务器通讯的api接口
    * transform.js 管道状态机组件，主要用于上传和下载过程管理
    * newDownload.js 下载任务入口
    * downloadTransform.js 处理下载文件过程，主要包括readRemote、diff、download、rename四个步骤
    * newUpload.js 上传任务入口
    * uploadTransform.js 处理上传文件过程，主要包括readDir、mkdir、hash、diff、upload四个步骤
    * backup.js 备份任务入口
    * backupTransform.js 处理备份文件过程，主要包括readDir、fastCount、classify、diff、upload五个过程
    * transmissionUpdate.js 文件传输过程的消息管理
    * xattr.js 读取和存储xattr数据, windows下用alternative data stream代替xattr

* locales : 多语言翻译文件

* logo : 打包后的安装程序用到的图标和用户须知文档等

* main.js : 程序的主入口

* node\_modules : 存放项目依赖包（工具相关）

* public : 前端资源文件目录

    * assets : 存放资源文件（css, images, font)
    * bundle.js : 前端打包输出

* src : 前端源代码目录

    * app.js: js入口, 挂载组件, 事件监听

    * common: 通用组件 utils等
      * fruitmix.js 设备相关api的接口
      * CloudApis.js 云相关api的接口

    * control: 用户管理相关页面

    * file: 文件页面
      * FileContent.jsx 文件列表入口
      * BackupCard.jsx 备份设置

    * login: 登录页面
      * Login.jsx 入口
      * WisnucLogin.jsx 帐户密码登录云帐户
      * WeChatLogin.jsx 微信登录云帐户
      * DeviceLogin.jsx 登录设备

    * nav: 导航
      * Navigation.jsx 页面导航UI和逻辑
      * ChangeDevice.jsx 切换设备页面

    * transmission : 上传下载页面

    * view: 各个页面的viewmodel
      * Home.jsx 首页，我的空间页面
      * Public.jsx 公共盘页面，暂时被隐藏
      * Backup.jsx 备份页面
      * Search.jsx 搜索页面
      * Transfer.jsx 传输页面
      * Base.jsx 基础页面

    * Winas.jsx: 顶层React页面

* .babelrc : babel工具配置文件

* .eslintrc : eslint配置文件

* package.json : 配置项目依赖及命令

* webpack.config.js : webpack配置文件