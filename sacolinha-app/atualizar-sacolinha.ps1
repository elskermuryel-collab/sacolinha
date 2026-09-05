# =========================================================================
#  atualizar-sacolinha.ps1
#  Da um duplo-clique nesse arquivo (ou botao direito > Executar com PowerShell)
#  que ele:
#    1) copia todos os arquivos desta pasta (menos ele mesmo e a pasta .git)
#       para Downloads\sacolinha-app, substituindo os arquivos antigos
#    2) manda (git commit + push) as mudancas pro GitHub
#    3) MOSTRA NO PROPRIO TERMINAL o progresso (%) do build no GitHub Actions
#    4) quando o build termina, o APK novo fica publicado no GitHub (aba
#       Releases / QR code abaixo). O app NAO tem mais checagem automatica de
#       atualizacao: para atualizar o celular, basta baixar e instalar o APK
#       novo pelo QR code. Quem usa pelo navegador (PWA) ja abre atualizado.
#    5) abre a imagem do QR code (Downloads\qrcode-sacolinha.png) e fecha sozinho
# =========================================================================

$ErrorActionPreference = "Stop"

$REPO_OWNER = "elskermuryel-collab"
$REPO_NAME  = "sacolinha"

# Pasta onde este script esta (a pasta com os arquivos NOVOS/atualizados)
$origem  = $PSScriptRoot
# Pasta "de trabalho" normal, onde fica o clone do projeto que sincroniza com o GitHub
$destino = Join-Path $env:USERPROFILE "Downloads\sacolinha-app"
# Pasta onde fica a imagem do QR code
$pastaDownloads = Join-Path $env:USERPROFILE "Downloads"

function FecharComErro($msg) {
    Write-Host ""
    Write-Host "ERRO: $msg"
    Read-Host "Aperte ENTER para fechar"
    exit 1
}

# Acompanha o build no GitHub Actions e mostra uma barra de porcentagem
# no terminal, atualizando no lugar (sem ficar imprimindo linha atras de linha).
function AcompanharBuild($sha) {
    $headers = @{ "User-Agent" = "sacolinha-updater" }
    $baseUrl = "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/actions"

    Write-Host ""
    Write-Host "Procurando o build no GitHub Actions..."

    $runId = $null
    for ($i = 0; $i -lt 20 -and -not $runId; $i++) {
        Start-Sleep -Seconds 3
        try {
            $runs = Invoke-RestMethod -Uri "$baseUrl/runs?per_page=10" -Headers $headers
            $run = $runs.workflow_runs | Where-Object { $_.head_sha -eq $sha } | Select-Object -First 1
            if ($run) { $runId = $run.id }
        } catch { }
    }

    if (-not $runId) {
        Write-Host "Nao consegui achar o build ainda (as vezes o GitHub demora uns segundos pra registrar)."
        Write-Host "Acompanhe direto em: https://github.com/$REPO_OWNER/$REPO_NAME/actions"
        return
    }

    $barraTam = 30
    $concluido = $false

    while (-not $concluido) {
        try {
            $jobsResp = Invoke-RestMethod -Uri "$baseUrl/runs/$runId/jobs" -Headers $headers
            $job = $jobsResp.jobs | Select-Object -First 1

            if ($job) {
                $total  = $job.steps.Count
                $feitos = ($job.steps | Where-Object { $_.status -eq "completed" }).Count
                $pct = if ($total -gt 0) { [math]::Round(($feitos / $total) * 100) } else { 0 }

                $preenchido = [math]::Round($barraTam * $pct / 100)
                $barra = ("#" * $preenchido).PadRight($barraTam, "-")
                $etapaAtual = ($job.steps | Where-Object { $_.status -eq "in_progress" } | Select-Object -First 1).name

                Write-Host -NoNewline ("`rBuild: [{0}] {1,3}%  ({2}/{3})  {4}          " -f $barra, $pct, $feitos, $total, $etapaAtual)

                if ($job.status -eq "completed") {
                    $concluido = $true
                    Write-Host ""
                    if ($job.conclusion -eq "success") {
                        Write-Host "Build concluido com sucesso! APK novo publicado."
                    } else {
                        Write-Host "O build terminou com problema (conclusion: $($job.conclusion))."
                        Write-Host "Veja os detalhes em: https://github.com/$REPO_OWNER/$REPO_NAME/actions/runs/$runId"
                    }
                }
            }
        } catch {
            # erro passageiro de rede/API -- so tenta de novo no proximo loop
        }
        if (-not $concluido) { Start-Sleep -Seconds 6 }
    }
}

Write-Host "===================================================="
Write-Host " Atualizando Sacolinha App"
Write-Host "===================================================="
Write-Host "Origem : $origem"
Write-Host "Destino: $destino"
Write-Host ""

# ---- 1) Garante que a pasta de destino existe e ja e um repositorio git ----
if (-not (Test-Path $destino)) {
    Write-Host "A pasta $destino nao existe ainda. Clonando o projeto do GitHub..."
    git clone https://github.com/$REPO_OWNER/$REPO_NAME.git $destino
} elseif (-not (Test-Path (Join-Path $destino ".git"))) {
    FecharComErro "a pasta $destino existe mas nao e um repositorio git (nao tem pasta .git dentro). Apague essa pasta ou aponte o script pra pasta certa e tente de novo."
}

# ---- 2) Copia os arquivos novos por cima dos antigos ----
# Exclui: o proprio script (.ps1), a pasta .git (historico do git nao deve ser copiado por cima)
$nomeDoScript = Split-Path -Leaf $PSCommandPath

robocopy $origem $destino /E /XF $nomeDoScript /XD ".git" /NFL /NDL /NJH /NP | Out-Null
$codigoRobocopy = $LASTEXITCODE

# Robocopy usa codigos de 0 a 7 pra "deu tudo certo" (bit flags de arquivos copiados/pulados).
# So 8 ou mais e erro de verdade.
if ($codigoRobocopy -ge 8) {
    FecharComErro "falha ao copiar os arquivos (codigo robocopy $codigoRobocopy)."
}

Write-Host "Arquivos copiados para $destino"
Write-Host ""

# ---- 3) Confirma a atualizacao no GitHub (commit + push) ----
Set-Location $destino

# Primeiro guarda (commit) o que mudou localmente. Isso precisa vir ANTES do
# pull, porque o git recusa fazer rebase com mudancas soltas na arvore.
git add -A

$temMudancaLocal = git status --porcelain
if (-not [string]::IsNullOrWhiteSpace($temMudancaLocal)) {
    $dataHora = Get-Date -Format "dd/MM/yyyy HH:mm"
    git commit -m "Atualizacao automatica - $dataHora" | Out-Null
}

# Agora puxa qualquer mudanca que o GitHub Actions tenha mandado de volta
# (o build grava o numero da versao no version.txt e da commit sozinho).
# Sem isso, o push seguinte pode ser rejeitado com "fetch first".
git fetch origin main --quiet
git pull origin main --rebase --quiet

$temMudanca = git log origin/main..HEAD --oneline
if ([string]::IsNullOrWhiteSpace($temMudanca)) {
    Write-Host "Nenhum arquivo mudou -- nada novo pra mandar pro GitHub."
} else {
    git push origin main
    $sha = (git rev-parse HEAD).Trim()

    Write-Host ""
    Write-Host "Mandado pro GitHub!"

    AcompanharBuild -sha $sha

    Write-Host ""
    Write-Host "Pronto! Assim que o build acabar, quem ja tem o Sacolinha"
    Write-Host "instalado no celular vai ver o pop-up de atualizacao sozinho"
    Write-Host "da proxima vez que abrir (ou voltar pro) o app -- e ao"
    Write-Host "clicar 'Sim' o app baixa e abre a instalacao sozinho."
}

# ---- 4) Abre a imagem do QR code e fecha a janela sozinho ----
$qr = Get-ChildItem -Path $pastaDownloads -Filter "*.png" -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match "(?i)qr.*sacolinha|sacolinha.*qr" } |
      Select-Object -First 1

if ($qr) {
    Start-Process $qr.FullName
} else {
    Write-Host ""
    Write-Host "Aviso: nao encontrei nenhum PNG de QR code do sacolinha em $pastaDownloads"
    Write-Host "(procurei por um arquivo com 'qr' e 'sacolinha' no nome)."
    Start-Sleep -Seconds 3
}

# Da um tempinho pro visualizador de imagem abrir antes de fechar a janela
Start-Sleep -Seconds 2
exit 0


