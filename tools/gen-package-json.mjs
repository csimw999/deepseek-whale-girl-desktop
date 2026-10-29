import fs from 'node:fs'

const p = process.argv[2]
const pkg = {
  name: 'whale-girl-desktop',
  productName: 'WhaleGirlDesktop',
  version: '0.2.0',
  description: 'Windows 桌面的 Live2D 鲸鱼娘桌宠：DSH 联动、本地语音、角色扮演聊天（Electron 宿主）',
  main: 'main.js',
  private: true,
  scripts: {
    start: 'electron .',
    probe: 'electron . --probe',
    'drag-probe': 'electron . --drag-probe',
    dist: 'electron-builder --win portable nsis',
    'dist:portable': 'electron-builder --win portable',
    distnsis: 'electron-builder --win nsis',
  },
  devDependencies: {
    electron: '^33.4.11',
    'electron-builder': '^25.1.8',
    'electron-updater': '^6.3.9',
  },
  build: {
    appId: 'com.csimw999.whalegirl',
    productName: '鲸鱼娘',
    copyright: 'Code MIT / Art CC BY-NC-SA 4.0',
    directories: { output: 'dist', buildResources: 'assets/icon' },
    files: [
      'main.js',
      'preload.js',
      'preload-chat.js',
      'preload-settings.js',
      'preload-voice.js',
      'package.json',
      'live2d/**',
      'app/**',
      'ui/**',
      'voice/**',
      'assets/**',
      'pets/**',
      'tools/activity-watch.mjs',
      '!**/*.bak*',
      '!**/*.map',
      '!**/node_modules/**/{test,tests,docs,example,examples}/**',
    ],
    asar: true,
    win: {
      icon: 'assets/icon/whale-girl-v4.ico',
      target: ['portable', 'nsis'],
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      shortcutName: '鲸鱼娘',
    },
    publish: [{ provider: 'github', owner: 'csimw999', repo: 'deepseek-whale-girl-desktop' }],
  },
}

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
console.log('package.json rewritten, version=' + pkg.version)
