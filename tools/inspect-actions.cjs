const fs = require('node:fs')
const src = fs.readFileSync(process.argv[2], 'utf8')
for (const name of ['const FACE_ACT', 'const ACTIONS', 'function playAction']) {
  const i = src.indexOf(name)
  if (i < 0) { console.log(name + ': missing'); continue }
  console.log('==== ' + name + ' ====')
  console.log(src.slice(i, i + 900).split('\n').slice(0, 26).join('\n'))
}
const model = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
console.log('==== 模型 motions ====')
console.log((model.FileReferences && model.FileReferences.Motions ? Object.keys(model.FileReferences.Motions) : []).join(', '))
if (model.FileReferences && model.FileReferences.Motions) {
  for (const [k, v] of Object.entries(model.FileReferences.Motions)) console.log('  ' + k + ': ' + v.length + ' 个')
}