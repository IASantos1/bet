# Script para iniciar todo o ambiente de desenvolvimento (Backend + Frontend)
# Resolve problemas de permissão do Wrangler definindo diretórios locais

$ErrorActionPreference = "Stop"
$projectRoot = Get-Location

Write-Host "🚀 Iniciando ambiente de desenvolvimento BET62..." -ForegroundColor Cyan

# 1. Definir variáveis de ambiente para o Wrangler (Cloudflare Worker)
# Isso força o Wrangler a usar uma pasta local (.wrangler-home) em vez de C:\Users\User\.wrangler
# Evitando erros de permissão (EPERM) e log (ENOENT)
$localWranglerHome = "$projectRoot\.wrangler-home"
$env:WRANGLER_HOME = $localWranglerHome
$env:XDG_CONFIG_HOME = $localWranglerHome
$env:XDG_DATA_HOME = $localWranglerHome
$env:XDG_CACHE_HOME = $localWranglerHome
# Algumas versões do Wrangler usam USERPROFILE para buscar configs globais
$env:USERPROFILE = "$localWranglerHome\user" 

Write-Host "📂 Configurando diretórios locais do Wrangler em: $localWranglerHome" -ForegroundColor Gray

# Criar diretórios necessários se não existirem
if (-not (Test-Path "$localWranglerHome\user")) { New-Item -ItemType Directory -Force -Path "$localWranglerHome\user" | Out-Null }
if (-not (Test-Path "$localWranglerHome\logs")) { New-Item -ItemType Directory -Force -Path "$localWranglerHome\logs" | Out-Null }
if (-not (Test-Path "$localWranglerHome\registry")) { New-Item -ItemType Directory -Force -Path "$localWranglerHome\registry" | Out-Null }

# 2. Parar processos Node.js antigos para liberar portas (8788, 5173, 9101)
Write-Host "🛑 Parando processos Node.js antigos..." -ForegroundColor Yellow
try {
    Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
} catch {
    # Ignorar erro se não houver processos
}

# 3. Iniciar Realtime Server (Porta 9101) em segundo plano
Write-Host "📡 Iniciando Realtime Server (Porta 9101)..." -ForegroundColor Green
Start-Process -FilePath "npm.cmd" -ArgumentList "run", "realtime" -WorkingDirectory $projectRoot -NoNewWindow 

# Aguardar um pouco para o Realtime subir
Start-Sleep -Seconds 3

# 4. Iniciar Worker (Porta 8788) em uma nova janela (para ver logs)
# Usamos 'start' (cmd) ou Start-Process para abrir nova janela
Write-Host "⚙️ Iniciando Cloudflare Worker (Porta 8788)..." -ForegroundColor Green
# O comando abaixo abre uma nova janela do PowerShell rodando o worker com as variáveis de ambiente herdadas
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& { 
    `$env:WRANGLER_HOME = '$localWranglerHome'; 
    `$env:XDG_CONFIG_HOME = '$localWranglerHome'; 
    `$env:XDG_DATA_HOME = '$localWranglerHome'; 
    `$env:XDG_CACHE_HOME = '$localWranglerHome'; 
    `$env:USERPROFILE = '$localWranglerHome\user'; 
    Write-Host 'Worker iniciando...'; 
    npm.cmd run worker 
}"

# 5. Iniciar Frontend (Porta 5173)
Write-Host "🎨 Iniciando Frontend (Vite)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm.cmd run dev"

Write-Host "✅ Todos os serviços foram iniciados!" -ForegroundColor Cyan
Write-Host "👉 Frontend: http://localhost:5173"
Write-Host "👉 Worker API: http://127.0.0.1:8788"
Write-Host "👉 Realtime: http://localhost:9101"
