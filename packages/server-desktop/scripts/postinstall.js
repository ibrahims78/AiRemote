'use strict'
if (process.platform === 'win32') {
  require('child_process').execSync('electron-builder install-app-deps', { stdio: 'inherit' })
} else {
  console.log('Skipping electron-builder install-app-deps (non-Windows)')
}
