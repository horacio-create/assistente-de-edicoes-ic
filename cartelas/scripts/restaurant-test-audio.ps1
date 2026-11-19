Add-Type -AssemblyName System.Speech
$restaurantDirectory = Join-Path (Get-Location).Path 'Exemplos\Restaurante-Mangai-Teste'
$restaurantText = [System.IO.File]::ReadAllText((Join-Path $restaurantDirectory 'mensagem-do-audio.txt'), [System.Text.Encoding]::UTF8)
$restaurantSpeaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $restaurantSpeaker.SelectVoice('Microsoft Maria Desktop')
  $restaurantSpeaker.Rate = -1
  $restaurantSpeaker.SetOutputToWaveFile((Join-Path $restaurantDirectory 'audio-pedido-simulado.wav'))
  $restaurantSpeaker.Speak($restaurantText)
} finally { $restaurantSpeaker.Dispose() }
