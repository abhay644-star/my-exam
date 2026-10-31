# Runs tests/marking.html in headless Microsoft Edge and prints the result.
# Usage, from the site folder:  powershell -File tests\run-tests.ps1
# Needs Python (py) for a local web server, and Microsoft Edge. Exit code 0 = all passed, 1 = failures.
$site = Split-Path $PSScriptRoot
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$port = 8790
$server = Start-Process py -ArgumentList "-m http.server $port --bind 127.0.0.1 --directory `"$site`"" -PassThru -WindowStyle Hidden
$profileDir = Join-Path $env:TEMP "aa-tests-$([guid]::NewGuid())"
try {
  Start-Sleep 2
  $dom = & $edge --headless=new --disable-gpu --no-first-run "--user-data-dir=$profileDir" --virtual-time-budget=60000 --dump-dom "http://127.0.0.1:$port/tests/marking.html" 2>$null | Out-String
  $summary = [regex]::Match($dom, '<p id="summary"[^>]*>(.*?)</p>').Groups[1].Value
  $fails = [regex]::Matches($dom, '<li class="fail">(.*?)</li>') | ForEach-Object { [Net.WebUtility]::HtmlDecode(($_.Groups[1].Value -replace '<small>', ' -- ' -replace '<[^>]+>', '')) }
  if (-not $summary) { $summary = 'No result: the test page did not finish' }
  Write-Output ([Net.WebUtility]::HtmlDecode($summary))
  $fails | ForEach-Object { Write-Output "  $_" }
  if ($summary -like 'PASS*') { $code = 0 } else { $code = 1 }
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
}
exit $code
