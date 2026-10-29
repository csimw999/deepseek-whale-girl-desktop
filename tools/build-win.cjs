const fs = require('node:fs')
const path = require('node:path')
const { build, Platform } = require('electron-builder')

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
if (process.env.MINIMAL === '1') {
  delete pkg.build.files
  delete pkg.build.win.icon
}

if (process.env.NOASAR === '1') pkg.build.asar = false

const which = process.argv[2] || 'portable'
const targets =
  which === 'nsis' ? ['nsis'] : which === 'both' ? ['portable', 'nsis'] : which === 'dir' ? ['dir'] : ['portable']

build({
  targets: Platform.WINDOWS.createTarget(targets),
  config: pkg.build,
})
  .then(files => {
    console.log('BUILD OK')
    for (const f of files) console.log(' -', f)
  })
  .catch(error => {
    console.error('BUILD FAILED:', error && error.message ? error.message : error)
    process.exit(1)
  })
