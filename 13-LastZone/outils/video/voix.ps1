# Génère la voix off (une piste .wav par segment) avec la voix française hors ligne de Windows.
#   powershell -File outils/video/voix.ps1 <dossier de sortie>
param([string]$Sortie = "video/voix")

Add-Type -AssemblyName System.Speech
$donnees = Get-Content (Join-Path $PSScriptRoot "narration.json") -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $Sortie | Out-Null

$voix = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voix.SelectVoice($donnees.voix)
$voix.Rate = 0
$i = 0
foreach ($texte in $donnees.segments) {
  $i++
  $fichier = Join-Path $Sortie ("segment{0:D2}.wav" -f $i)
  $voix.SetOutputToWaveFile($fichier)
  $voix.Speak($texte)
  $voix.SetOutputToNull()
  Write-Output ("{0} -> {1}" -f $i, $fichier)
}
$voix.Dispose()
