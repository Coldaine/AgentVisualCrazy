# Forward a Cursor hook payload to AgentVisualCrazy's local hook-receiver.
# Reads JSON from stdin, POSTs it, always exits 0 with `{}`.
#
# Env:
#   SHADOW_HOOK_URL    default http://127.0.0.1:9477/hook
#   SHADOW_HOOK_TOKEN  optional shared token
#   SHADOW_HOOK_SOURCE optional EventSource (default cursor-hook)

$ErrorActionPreference = 'SilentlyContinue'
$url = if ($env:SHADOW_HOOK_URL) { $env:SHADOW_HOOK_URL } else { 'http://127.0.0.1:9477/hook' }
$token = $env:SHADOW_HOOK_TOKEN
$source = if ($env:SHADOW_HOOK_SOURCE) { $env:SHADOW_HOOK_SOURCE } else { 'cursor-hook' }

$body = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($body)) {
  Write-Output '{}'
  exit 0
}

$headers = @{
  'Content-Type' = 'application/json'
  'X-Shadow-Source' = $source
}
if ($token) {
  $headers['X-Shadow-Token'] = $token
}

try {
  Invoke-RestMethod -Method Post -Uri $url -Headers $headers -Body $body -TimeoutSec 2 | Out-Null
} catch {
  # Observer offline — fail open.
}

Write-Output '{}'
exit 0
