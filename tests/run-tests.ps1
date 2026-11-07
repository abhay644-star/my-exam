# Runs the test pages in headless Microsoft Edge and prints the result:
#   tests/marking.html - answer checking, marking rules, papers, question banks, custom papers and the generated pages
#   tests/journey.html - a student's journey through the app at phone and desktop width
#   tests/offline.html - what the service worker saves for offline use, and when
# Usage, from the site folder:  powershell -File tests\run-tests.ps1
# Needs Python (py) for a local web server, and Microsoft Edge. Exit code 0 = all passed, 1 = failures.
$site = Split-Path $PSScriptRoot
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$port = 8790

# --dump-dom prints the page once its virtual time runs out
function Get-DumpedPage($url, $budget) {
  $profileDir = Join-Path $env:TEMP "aa-tests-$([guid]::NewGuid())"
  try { & $edge --headless=new --disable-gpu --no-first-run "--user-data-dir=$profileDir" "--virtual-time-budget=$budget" --window-size=1400,1000 --dump-dom $url 2>$null | Out-String }
  finally { Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue }
}

# a service worker does not start under --dump-dom, so offline.html runs in a normal headless window for $waitSec
# seconds and its result is read through the DevTools protocol
function Get-LivePage($url, $waitSec) {
  $profileDir = Join-Path $env:TEMP "aa-tests-$([guid]::NewGuid())"
  $debugPort = $port + 1
  $p = Start-Process $edge -ArgumentList '--headless=new', '--disable-gpu', '--no-first-run', "--user-data-dir=$profileDir", "--remote-debugging-port=$debugPort", $url -PassThru
  try {
    Start-Sleep $waitSec
    $tabs = Invoke-RestMethod "http://127.0.0.1:$debugPort/json"  # (piped directly, PowerShell 5.1 passes the whole list as one item)
    $tab = $tabs | Where-Object { $_.type -eq 'page' -and $_.url -eq $url } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $none = [Threading.CancellationToken]::None
    $ws.ConnectAsync([Uri]$tab.webSocketDebuggerUrl, $none).Wait()
    $msg = [Text.Encoding]::UTF8.GetBytes('{"id":1,"method":"Runtime.evaluate","params":{"expression":"document.body.innerHTML","returnByValue":true}}')
    $ws.SendAsync([ArraySegment[byte]]$msg, 'Text', $true, $none).Wait()
    $buf = New-Object byte[] 65536; $ms = New-Object IO.MemoryStream
    do { $r = $ws.ReceiveAsync([ArraySegment[byte]]$buf, $none); $r.Wait(); $ms.Write($buf, 0, $r.Result.Count) } while (-not $r.Result.EndOfMessage)
    ([Text.Encoding]::UTF8.GetString($ms.ToArray()) | ConvertFrom-Json).result.result.value
  } catch { Write-Warning "offline.html could not be read: $($_.Exception.Message)"; '' }
  finally {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep 1; Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
  }
}

$server = Start-Process py -ArgumentList "-m http.server $port --bind 127.0.0.1 --directory `"$site`"" -PassThru -WindowStyle Hidden
$code = 0
try {
  Start-Sleep 2
  foreach ($page in @(@('marking.html', 60000), @('journey.html', 180000), @('offline.html', 0))) {
    $url = "http://127.0.0.1:$port/tests/$($page[0])"
    $dom = if ($page[1]) { Get-DumpedPage $url $page[1] } else { Get-LivePage $url 20 }
    $summary = [regex]::Match($dom, '<p id="summary"[^>]*>(.*?)</p>').Groups[1].Value
    $fails = [regex]::Matches($dom, '<li class="fail">(.*?)</li>') | ForEach-Object { [Net.WebUtility]::HtmlDecode(($_.Groups[1].Value -replace '<small>', ' -- ' -replace '<[^>]+>', '')) }
    if (-not $summary -or $summary -like 'Running*') { $summary = 'No result: the test page did not finish' }
    Write-Output ("$($page[0]): " + [Net.WebUtility]::HtmlDecode($summary))
    $fails | ForEach-Object { Write-Output "  $_" }
    if ($summary -notlike 'PASS*') { $code = 1 }
  }
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
exit $code
