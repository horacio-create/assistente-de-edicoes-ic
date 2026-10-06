$ErrorActionPreference = 'Stop'
$videoDestination = Join-Path $PSScriptRoot 'tools/ffmpeg'
if ((Test-Path (Join-Path $videoDestination 'ffmpeg.exe')) -and (Test-Path (Join-Path $videoDestination 'ffprobe.exe'))) {
    Write-Host 'O processamento de vídeos já está instalado.'
    exit 0
}
$videoArchive = Join-Path ([IO.Path]::GetTempPath()) ('ic-ffmpeg-' + [guid]::NewGuid().ToString('N') + '.zip')
try {
    Write-Host 'Baixando o processamento de vídeos...'
    & curl.exe -fL --retry 2 -o $videoArchive 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível baixar o processamento de vídeos.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $videoPackage = [IO.Compression.ZipFile]::OpenRead($videoArchive)
    try {
        New-Item -ItemType Directory -Path $videoDestination -Force | Out-Null
        foreach ($videoName in @('ffmpeg.exe','ffprobe.exe','LICENSE','README.txt')) {
            $videoEntry = $videoPackage.Entries | Where-Object { $_.Name -eq $videoName } | Select-Object -First 1
            if ($videoEntry) { [IO.Compression.ZipFileExtensions]::ExtractToFile($videoEntry, (Join-Path $videoDestination $videoName), $true) }
            elseif ($videoName -like '*.exe') { throw "Arquivo necessário ausente: $videoName" }
        }
    } finally { $videoPackage.Dispose() }
    Write-Host 'Vídeos instalados. Reinicie o Assistente de Edições.'
} finally {
    if (Test-Path -LiteralPath $videoArchive) { Remove-Item -LiteralPath $videoArchive }
}
