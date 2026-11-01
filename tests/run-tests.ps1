# Runs the test pages in headless Microsoft Edge and prints the result:
#   tests/marking.html - answer checking, marking rules, papers, question banks, custom papers and the generated pages
#   tests/journey.html - a student's journey through the app at phone and desktop width
# Usage, from the site folder:  powershell -File tests\run-tests.ps1
# Needs Python (py) for a local web server, and Microsoft Edge. Exit code 0 = all passed, 1 = failures.
$site = Split-Path $PSScriptRoot
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$port = 8790
$server = Start-Process py -ArgumentList "-m http.server $port --bind 127.0.0.1 --directory `"$site`"" -PassThru -WindowStyle Hidden
$code = 0
try {
  Start-Sleep 2
  foreach ($page in @(@('marking.html', 60000), @('journey.html', 180000))) {
    $profileDir = Join-Path $env:TEMP "aa-tests-$([guid]::NewGuid())"
    $dom = & $edge --headless=new --disable-gpu --no-first-run "--user-data-dir=$profileDir" "--virtual-time-budget=$($page[1])" --window-size=1400,1000 --dump-dom "http://127.0.0.1:$port/tests/$($page[0])" 2>$null | Out-String
    Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
    $summary = [regex]::Match($dom, '<p id="summary"[^>]*>(.*?)</p>').Groups[1].Value
    $fails = [regex]::Matches($dom, '<li class="fail">(.*?)</li>') | ForEach-Object { [Net.WebUtility]::HtmlDecode(($_.Groups[1].Value -replace '<small>', ' -- ' -replace '<[^>]+>', '')) }
    if (-not $summary) { $summary = 'No result: the test page did not finish' }
    Write-Output ("$($page[0]): " + [Net.WebUtility]::HtmlDecode($summary))
    $fails | ForEach-Object { Write-Output "  $_" }
    if ($summary -notlike 'PASS*') { $code = 1 }
  }
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
exit $code
