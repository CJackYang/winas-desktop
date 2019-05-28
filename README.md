# Winas Desktop

### Setup

```
sudo apt-get install git
sudo apt-get install npm
sudo npm install -g n
sudo n latest
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
$env:NODE_ENV='dev';.\pocket_drive.exe
```
