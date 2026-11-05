param([string]$Voice = 'Microsoft Zira Desktop', [string]$SceneId = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$output = Join-Path $root 'video/.render/walkthrough'
New-Item -ItemType Directory -Path $output -Force | Out-Null
Add-Type -AssemblyName System.Speech
Add-Type -ReferencedAssemblies System.Speech -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Speech.Synthesis;
using System.Speech.AudioFormat;
public class RefMatchWord {
  public string Text;
  public int Position;
  public double Seconds;
}
public class RefMatchNarrator {
  public static List<RefMatchWord> Render(string text, string path, string voice) {
    var words = new List<RefMatchWord>();
    using (var speech = new SpeechSynthesizer()) {
      speech.SelectVoice(voice);
      speech.Rate = 2;
      speech.Volume = 100;
      speech.SpeakProgress += (sender, e) => words.Add(new RefMatchWord {
        Text = e.Text, Position = e.CharacterPosition, Seconds = e.AudioPosition.TotalSeconds
      });
      speech.SetOutputToWaveFile(path, new SpeechAudioFormatInfo(16000, AudioBitsPerSample.Sixteen, AudioChannel.Mono));
      speech.Speak(text);
    }
    return words;
  }
}
'@
$scenes = Get-Content (Join-Path $root 'video/walkthrough/scenes.json') -Raw -Encoding utf8 | ConvertFrom-Json
foreach ($scene in $scenes) {
  if ($SceneId -and $scene.id -ne $SceneId) { continue }
  $wave = Join-Path $output ($scene.id + '.wav')
  $words = [RefMatchNarrator]::Render($scene.text, $wave, $Voice)
  $words | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $output ($scene.id + '-words.json')) -Encoding utf8
  Write-Output "Narrated $($scene.id)"
}
