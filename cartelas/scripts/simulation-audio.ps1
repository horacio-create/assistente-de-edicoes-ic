Add-Type -AssemblyName System.Speech
$simulationDirectory = Join-Path (Get-Location).Path 'Exemplos\Simulacao-Aurora'
$simulationText = [System.IO.File]::ReadAllText((Join-Path $simulationDirectory 'mensagem-do-audio.txt'), [System.Text.Encoding]::UTF8)
$simulationSpeaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $simulationSpeaker.SelectVoice('Microsoft Maria Desktop')
  $simulationSpeaker.Rate = -1
  $simulationSpeaker.SetOutputToWaveFile((Join-Path $simulationDirectory 'audio-cliente-ficticio.wav'))
  $simulationSpeaker.Speak($simulationText)
} finally { $simulationSpeaker.Dispose() }
