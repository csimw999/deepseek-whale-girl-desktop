# 重新生成语音包（edge-tts，微软自然女声）
#
# 用法：在项目根目录执行
#   pwsh -File tools\make-voice.ps1
# 需要：python + `pip install edge-tts`（本机已装）
#
# 生成的文件在 assets\voice\*.mp3，由主进程通过 /dsh-pet/voice/* 提供给页面。
# 想换音色就改 $Voice；想加台词就往 $Lines 里加一行。

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$OutDir = Join-Path $Root 'assets\voice'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# zh-CN-XiaoxiaoNeural（晓晓，自然女声）；可爱一点可以换 zh-CN-XiaoyiNeural
$Voice = 'zh-CN-XiaoxiaoNeural'
$Rate = '+4%'

$Lines = @(
  @{ f = 'click1'; t = '嗯？怎么啦' },
  @{ f = 'click2'; t = '在呢在呢' },
  @{ f = 'click3'; t = '摸摸头～' },
  @{ f = 'feed1'; t = '小鱼干最好吃了' },
  @{ f = 'feed2'; t = '谢谢，还要一条' },
  @{ f = 'done1'; t = '搞定啦，辛苦你啦' },
  @{ f = 'done2'; t = '这一轮完成啦' },
  @{ f = 'fail1'; t = '呜，好像出错了' },
  @{ f = 'fail2'; t = '别急，我们再试一次' },
  @{ f = 'task1'; t = '任务完成，你好厉害' }
)

foreach ($line in $Lines) {
  $out = Join-Path $OutDir ($line.f + '.mp3')
  Write-Host ("生成 {0} …" -f $line.f)
  python -m edge_tts --voice $Voice --rate=$Rate --text $line.t --write-media $out
}

$total = (Get-ChildItem $OutDir -Filter '*.mp3' | Measure-Object Length -Sum).Sum / 1KB
Write-Host ("完成：{0} 条，共 {1:N0} KB" -f (Get-ChildItem $OutDir -Filter '*.mp3').Count, $total)
