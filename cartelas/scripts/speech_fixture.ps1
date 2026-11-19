Add-Type -AssemblyName System.Speech
$fixtureRoot = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { (Get-Location).Path }
$fixtureDirectory = Join-Path $fixtureRoot 'test-results\intake'
New-Item -ItemType Directory -Path $fixtureDirectory -Force | Out-Null
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $speaker.SelectVoice('Microsoft Maria Desktop')
  $speaker.SetOutputToWaveFile((Join-Path $fixtureDirectory 'pedido-audio.wav'))
  $speaker.Speak('Cartela um. Logo, texto e foto um. Doutora Victoria da Ponte. Harmonização facial. Cartela dois. Logo, foto dois e serviços. Preenchimento facial. Labial. Bioestimuladores. Cartela três. Logo, texto, contato e QR code. Realce sua beleza.')
} finally { $speaker.Dispose() }
