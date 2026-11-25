# BEM Incoming Inspection System - serve.ps1
# Free local web server for testing on a Windows computer. Needs nothing to be installed.
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080] [-NoBrowser]
param(
  [int]$Port = 8080,
  [switch]$NoBrowser
)

$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.md'   = 'text/plain; charset=utf-8'
  '.csv'  = 'text/csv; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch {
  Write-Host "Could not start on port $Port. Another program may be using it. Try: serve.ps1 -Port 8090" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "BEM Incoming Inspection System is running at  http://localhost:$Port/" -ForegroundColor Green
Write-Host "Keep this window open while using the app. Press Ctrl+C to stop."
Write-Host ""
if (-not $NoBrowser) { Start-Process "http://localhost:$Port/" }

try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(500)) { }
    $ctx = $task.GetAwaiter().GetResult()
    $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
      $file = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
      if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $type = 'application/octet-stream'
        if ($mime.ContainsKey($ext)) { $type = $mime[$ext] }
        $res.ContentType = $type
        $res.StatusCode = 200
      } else {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
        $res.ContentType = 'text/plain'
        $res.StatusCode = 404
      }
      $res.Headers.Add('Cache-Control', 'no-cache')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      Write-Host "Request error: $_" -ForegroundColor Yellow
    } finally {
      $res.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
}
