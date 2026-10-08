# Executar na pasta aberta no Microsoft Visual Studio: .\iniciar.ps1
# Servidor apenas em 127.0.0.1. Não publica o site na internet.
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskNodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$taskNode = if ($taskNodeCommand) { $taskNodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $taskNode)) {
    throw 'Node.js não encontrado. Use um servidor estático/Live Server ou instale Node.js para executar server.mjs.'
}
$taskUrl = 'http://127.0.0.1:4183'
try {
    $taskResponse = Invoke-WebRequest -UseBasicParsing -Uri $taskUrl -TimeoutSec 2
    if ($taskResponse.Content -notmatch 'data-build="media-split-v4"') { throw 'A porta 4183 está ocupada por outra versão ou outro serviço.' }
    Start-Process $taskUrl
    Write-Host "MinhaEstante V4 já está disponível em $taskUrl"
    return
} catch {
    if ($_.Exception.Message -eq 'A porta 4183 está ocupada por outra versão ou outro serviço.') { throw }
}
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList ('"' + (Join-Path $taskRoot 'server.mjs') + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru
for ($taskAttempt = 0; $taskAttempt -lt 12; $taskAttempt++) {
    Start-Sleep -Milliseconds 250
    try {
        $taskResponse = Invoke-WebRequest -UseBasicParsing -Uri $taskUrl -TimeoutSec 1
        if ($taskResponse.StatusCode -eq 200) {
            Start-Process $taskUrl
            Write-Host "MinhaEstante aberta em $taskUrl. Processo do servidor: $($taskProcess.Id)."
            Write-Host "Para encerrar somente este servidor: Stop-Process -Id $($taskProcess.Id)"
            return
        }
    } catch { }
}
throw 'O servidor não iniciou. Execute node server.mjs no terminal para ver a mensagem de erro.'
