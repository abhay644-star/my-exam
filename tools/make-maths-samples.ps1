# Writes tools/maths-samples.json: a few Class XI and XII Mathematics questions per chapter, made by the app's own generators.
# Usage, from the site folder:  powershell -File tools\make-maths-samples.ps1   (then run py tools/build_pages.py)
# Needs Python (py) for a local web server, and Microsoft Edge. Run it again only when the Mathematics generators change.
$site = Split-Path $PSScriptRoot
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$port = 8791
$server = Start-Process py -ArgumentList "-m http.server $port --bind 127.0.0.1 --directory `"$site`"" -PassThru -WindowStyle Hidden
$profileDir = Join-Path $env:TEMP "aa-maths-$([guid]::NewGuid())"
try {
  Start-Sleep 2
  $dom = & $edge --headless=new --disable-gpu --no-first-run "--user-data-dir=$profileDir" --virtual-time-budget=30000 --dump-dom "http://127.0.0.1:$port/tools/maths-samples.html" 2>$null | Out-String
  $json = [Net.WebUtility]::HtmlDecode([regex]::Match($dom, '<pre id="out">(.*?)</pre>', 'Singleline').Groups[1].Value)
  if (-not $json.StartsWith('{')) { Write-Output "Failed: $json"; $code = 1 }
  else {
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'maths-samples.json'), $json + "`n", (New-Object Text.UTF8Encoding $false))
    Write-Output "tools/maths-samples.json written ($($json.Length) characters)"
    $code = 0
  }
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
}
exit $code
