<#
  Start Claude Code with DeepSeek as the model (DeepSeek's Anthropic-compatible API), on a safe branch.
  Usage (from the project folder, in PowerShell):   .\start-deepseek.ps1
  First run asks for your DeepSeek API key (https://platform.deepseek.com/api_keys) and can remember it for your
  Windows user only. The key is never written into the project.
#>
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# 1) API key: from the user environment, or ask once
$key = [Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY', 'User')
if (-not $key) {
  $sec = Read-Host 'DeepSeek API key (sk-...)' -AsSecureString
  $key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  if (-not $key) { Write-Host 'No key entered.'; exit 1 }
  if ((Read-Host 'Remember this key for next time on this Windows user? (y/n)') -eq 'y') {
    [Environment]::SetEnvironmentVariable('DEEPSEEK_API_KEY', $key, 'User')
  }
}

# 2) Safe branch: DeepSeek never works on main
$dirty = git status --porcelain
if ($dirty) { Write-Host 'The project has uncommitted changes. Commit or stash them first.'; exit 1 }
git fetch origin 2>$null | Out-Null
$exists = git branch --list deepseek-work
if ($exists) { git switch deepseek-work | Out-Null } else { git switch -c deepseek-work | Out-Null }
Write-Host "Working on branch: $(git branch --show-current)" -ForegroundColor Green

# 2b) Guard rails enforced by git itself (scripts/agent-guard.cjs): commits only on deepseek-work, protected files
#     refused, tests / cache / domain copy must be green before any commit, no push to main.
git config core.hooksPath .githooks
$env:HS_AGENT = 'deepseek'

# 3) Point Claude Code at DeepSeek for this window only
$env:ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic'
$env:ANTHROPIC_AUTH_TOKEN = $key
$env:ANTHROPIC_MODEL = 'deepseek-chat'
$env:ANTHROPIC_SMALL_FAST_MODEL = 'deepseek-chat'
$env:API_TIMEOUT_MS = '600000'
$env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'

# 4) Launch with the handoff as the first instruction
claude --disallowedTools "Bash(firebase deploy*)" "PowerShell(firebase deploy*)" "Bash(*--no-verify*)" "PowerShell(*--no-verify*)" "Bash(git push --force*)" "PowerShell(git push --force*)" "Bash(git reset --hard*)" "PowerShell(git reset --hard*)" "Bash(git config core.hooksPath*)" "PowerShell(git config core.hooksPath*)" --append-system-prompt (Get-Content -Raw -Encoding UTF8 docs/DEEPSEEK_HANDOFF.md) "اقرأ CLAUDE.md و docs/AI_CONTEXT/START_HERE.md الأول. اتبع «طريقة الشغل» في التسليم خطوة بخطوة في كل مهمة. بعدها اسألني عايز تبدأ بأنهي مهمة."

# 5) Back to main when the session ends (DeepSeek's work stays on deepseek-work for Claude to review)
$env:HS_AGENT = $null
git switch main | Out-Null
Write-Host 'Back on main. DeepSeek commits are on the deepseek-work branch.' -ForegroundColor Green
