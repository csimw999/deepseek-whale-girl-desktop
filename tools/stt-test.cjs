const path = require('node:path')
const sherpa = require('sherpa-onnx-node')
const root = path.join(__dirname, '..')
const dir = path.join(root, 'voice-models', 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17')
const recognizer = new sherpa.OfflineRecognizer({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: {
    senseVoice: { model: path.join(dir, 'model.int8.onnx'), useInverseTextNormalization: 1, language: 'zh' },
    tokens: path.join(dir, 'tokens.txt'),
    numThreads: 4,
    debug: 0,
    provider: 'cpu',
  },
})
const wave = sherpa.readWave(process.argv[2])
const stream = recognizer.createStream()
stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples })
recognizer.decode(stream)
console.log('ASR =>', JSON.stringify(recognizer.getResult(stream).text))