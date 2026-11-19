# HANSALEHLAK — optional helper tools for local work (Windows, winget).
# Run from the project root in PowerShell:   powershell -ExecutionPolicy Bypass -File .\install-tools.ps1
# Optional flags:  -Only ffmpeg,gh   (install just these)   ·   -List   (show status only)
# Nothing here is required by the apps or by `npm test`; each tool speeds up a specific task (listed below).
# Tools that are already installed are skipped. Open a NEW terminal after it finishes so PATH updates apply.

param(
  [string[]]$Only = @(),
  [switch]$List
)

$tools = @(
  @{ key = 'ffmpeg';      cmd = 'ffmpeg';      id = 'Gyan.FFmpeg';                why = 'Video: export ads / demos as MP4 (WhatsApp, Facebook, Instagram)' },
  @{ key = 'gh';          cmd = 'gh';          id = 'GitHub.cli';                 why = 'GitHub: read CI results (Actions), pull requests, releases from the terminal' },
  @{ key = 'poppler';     cmd = 'pdftoppm';    id = 'oschwartz10612.Poppler';     why = 'PDF: render pages to images to review generated documents (project book)' },
  @{ key = 'imagemagick'; cmd = 'magick';      id = 'ImageMagick.ImageMagick';    why = 'Images: resize / convert brand photos and screenshots in bulk' },
  @{ key = 'webp';        cmd = 'cwebp';       id = 'Google.Libwebp';             why = 'Images: compress photos to WebP (smaller app, faster pages)' },
  @{ key = 'osv-scanner'; cmd = 'osv-scanner'; id = 'Google.OSVScanner';          why = 'Security: scan package-lock.json for known vulnerable dependencies' }
)

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Write-Host 'winget is not available. Install "App Installer" from the Microsoft Store, then run this script again.' -ForegroundColor Red
  exit 1
}

$selected = if ($Only.Count) { $tools | Where-Object { $Only -contains $_.key } } else { $tools }
$results = @()

foreach ($t in $selected) {
  $have = [bool](Get-Command $t.cmd -ErrorAction SilentlyContinue)
  if ($List) { $results += [pscustomobject]@{ Tool = $t.key; Status = $(if ($have) { 'installed' } else { 'missing' }); Purpose = $t.why }; continue }
  if ($have) { $results += [pscustomobject]@{ Tool = $t.key; Status = 'already installed'; Purpose = $t.why }; continue }
  Write-Host "`n==> Installing $($t.key)  ($($t.id))" -ForegroundColor Cyan
  Write-Host "    $($t.why)"
  winget install --id $t.id --exact --silent --accept-package-agreements --accept-source-agreements
  $status = if ($LASTEXITCODE -eq 0) { 'installed' } else { "failed (winget exit $LASTEXITCODE)" }
  $results += [pscustomobject]@{ Tool = $t.key; Status = $status; Purpose = $t.why }
}

Write-Host "`n==== Summary ====" -ForegroundColor Green
$results | Format-Table -AutoSize
if (-not $List) {
  Write-Host 'Open a new terminal so the new commands are on PATH.' -ForegroundColor Yellow
  Write-Host 'GitHub CLI needs a one-time sign-in:  gh auth login' -ForegroundColor Yellow
}
