param([Parameter(Mandatory=$true)][string]$Manifest)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
$taskAsTask=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await($Operation,$ResultType){
 $task=$taskAsTask.MakeGenericMethod($ResultType).Invoke($null,@($Operation))
 if(-not $task.Wait(6000)){throw 'OCR timeout'}
 return $task.Result
}
$taskLanguage=[Windows.Globalization.Language]::new('pt-BR')
$taskEngine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($taskLanguage)
if(-not $taskEngine){$taskEngine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()}
if(-not $taskEngine){throw 'OCR unavailable'}
$taskLines=@()
foreach($taskPath in (Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json)){
 $taskStream=$null
 try{
  $taskFile=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($taskPath)) ([Windows.Storage.StorageFile])
  $taskStream=Await ($taskFile.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $taskDecoder=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($taskStream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $taskBitmap=Await ($taskDecoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $taskConverted=[Windows.Graphics.Imaging.SoftwareBitmap]::Convert($taskBitmap,[Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,[Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)
  $taskResult=Await ($taskEngine.RecognizeAsync($taskConverted)) ([Windows.Media.Ocr.OcrResult])
  foreach($taskLine in $taskResult.Lines){$taskHeight=($taskLine.Words | ForEach-Object {$_.BoundingRect.Height} | Measure-Object -Maximum).Maximum;$taskLines+=@{text=$taskLine.Text;height=$taskHeight}}
  $taskConverted.Dispose();$taskBitmap.Dispose()
 }finally{if($taskStream){$taskStream.Dispose()}}
}
ConvertTo-Json -InputObject @($taskLines) -Depth 3 -Compress
