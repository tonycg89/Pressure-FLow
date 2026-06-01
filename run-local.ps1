$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (Test-Path $BundledNode) {
  & $BundledNode (Join-Path $Root "server.js")
  exit $LASTEXITCODE
}

node (Join-Path $Root "server.js")

