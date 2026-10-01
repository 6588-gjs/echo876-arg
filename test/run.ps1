# 回声电台 ARG · 端到端验证
#
# 用法（在 echo876-arg 目录下）：
#   pwsh -File test/run.ps1
#
# 会启动一个无头 Chrome/Edge，用 CDP 驱动真实浏览器把整条谜题链走一遍：
#   首页 → 关闭提示 → 调频 87.6 → 听录音 → 网站裂开 → 留言板第 41 页
#   → 错密码被拒 → 输入 1103 解压 → 透明文字框选显形 → 输入 417 → 终局
#   → 收尾 → 刷新后状态保持 → 全部路由
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw '未找到 Chrome 或 Edge。' }

$profile = Join-Path $env:TEMP ('echo876-verify-' + [guid]::NewGuid().ToString('N'))
$url = ([uri](Join-Path $root 'index.html')).AbsoluteUri
Write-Host "浏览器: $chrome"
Write-Host "页面  : $url`n"

$proc = Start-Process -FilePath $chrome -PassThru -WindowStyle Hidden -ArgumentList @(
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  "--user-data-dir=$profile", '--remote-debugging-port=9333', $url
)
$code = 1
try {
  Start-Sleep -Seconds 4
  node (Join-Path $PSScriptRoot 'verify.js') $url
  $code = $LASTEXITCODE
} finally {
  Get-Process -Id $proc.Id -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue
}
exit $code
