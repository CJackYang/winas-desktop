# Winas Desktop

### Setup

```
sudo apt-get install git
sudo apt-get install npm
sudo npm install -g n
sudo n 10.16.2
node -v
git clone https://github.com/aidingnan/winas-desktop.git
cd winas-desktop
npm install --registry=https://registry.npm.taobao.org
npm run rebuild
npm run webpack2
npm start
```

### Development 

```bash
npm run webpack             # webpack with HMR
NODE_ENV=dev npm start      # start with devtools
CONN_MODE=remote npm start  # remote mode
# script of running dev mode on Windows
$env:NODE_ENV='dev';.\口袋网盘.exe
```

### Distribute

```bash
# Windows x64
arch=x64 npm run dist-x64

# Windows x32
arch=ia32 npm run dist-ia32

# macOS, need notarize, see ~/Desktop/desktop/notarize-app.txt
npm run dist-mac

# linux
npm run dist-linux
```
