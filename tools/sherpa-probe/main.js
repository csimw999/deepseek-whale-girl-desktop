const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const LOG = path.join(__dirname, '..', '..', 'data', 'sherpa-probe.log')
const w = m => { try { fs.appendFileSync(LOG, String(m) + '\n') } catch {} }
app.whenReady().then(() => {
  try {
    const sherpa = require('sherpa-onnx-node')
    w('require ok: ' + Object.keys(sherpa).slice(0, 4).join(','))
    const root = path.join(__dirname, '..', '..')
    const dir = path.join(root, 'voice-models', 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17')
    const recognizer = new sherpa.OfflineRecognizer({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        senseVoice: { model: path.join(dir, 'model.int8.onnx'), useInverseTextNormalization: 1, language: 'zh' },
        tokens: path.join(dir, 'tokens.txt'),
        numThreads: 4, debug: 0, provider: 'cpu',
      },
    })
    w('recognizer created')
    const wave = sherpa.readWave(path.join(root, 'data', 'stt-test.wav'))
    w('wave: rate=' + wave.sampleRate + ' len=' + wave.samples.length)
    const stream = recognizer.createStream()
    stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples })
    recognizer.decode(stream)
    w('ASR => ' + JSON.stringify(recognizer.getResult(stream).text))
  } catch (error) {
    w('FAILED: ' + (error && error.stack ? error.stack : String(error)))
  }
  app.quit()
})