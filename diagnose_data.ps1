$ErrorActionPreference = "Stop"

Write-Host "🔍 Diagnosticando Estado dos Dados..." -ForegroundColor Cyan

# 1. Verificar Status do Banco via API (mais confiável que query direta se o worker estiver segurando lock)
try {
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:8788/api/dev/db-status" -Method Get
    Write-Host "📊 Status do Banco (Via API):" -ForegroundColor Green
    $status | Format-List
} catch {
    Write-Host "❌ Falha ao consultar status do banco: $_" -ForegroundColor Red
}

# 2. Tentar disparar Force Import e ver resposta
Write-Host "`n🚀 Disparando Force Import..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:8788/api/dev/force-import" -Method Post
    Write-Host "✅ Resposta do Force Import:" -ForegroundColor Green
    $response | Format-List
} catch {
    Write-Host "❌ Falha ao disparar Force Import: $_" -ForegroundColor Red
}

# 3. Verificar se evento de teste está lá
Write-Host "`n👀 Verificando Evento de Teste..." -ForegroundColor Cyan
try {
    $event = Invoke-RestMethod -Uri "http://127.0.0.1:8788/api/events/by-sport?sport=soccer" -Method Get | Select-Object -First 1
    if ($event) {
        Write-Host "✅ Evento encontrado:" -ForegroundColor Green
        Write-Host "   ID: $($event.id)"
        Write-Host "   Match: $($event.home_team) vs $($event.away_team)"
        Write-Host "   League: $($event.league)"
    } else {
        Write-Host "⚠️ Nenhum evento retornado pela API." -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Falha ao buscar eventos: $_" -ForegroundColor Red
}
