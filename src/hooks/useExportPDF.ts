
import { useBets } from './useBets';
import { useTransactions } from './useTransactions';
import { useProfile } from './useProfile';

export const useExportPDF = () => {
  const { bets } = useBets();
  const { transactions } = useTransactions();
  const { profile } = useProfile();

  const generateBetsHTML = (filteredBets: typeof bets, dateRange: string) => {
    const totalStaked = filteredBets.reduce((sum, b) => sum + Number(b.stake), 0);
    const totalWon = filteredBets.filter(b => b.status === 'won').reduce((sum, b) => sum + Number(b.potential_win), 0);
    const wonCount = filteredBets.filter(b => b.status === 'won').length;
    const lostCount = filteredBets.filter(b => b.status === 'lost').length;
    const pendingCount = filteredBets.filter(b => b.status === 'pending').length;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Histórico de Apostas - ${profile?.full_name || 'Utilizador'}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; line-height: 1.5; padding: 40px; }
          .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #f59e0b; }
          .logo { font-size: 28px; font-weight: bold; color: #f59e0b; margin-bottom: 8px; }
          .subtitle { color: #6b7280; font-size: 14px; }
          .user-info { background: #fef3c7; padding: 20px; border-radius: 12px; margin-bottom: 30px; }
          .user-info h3 { color: #92400e; margin-bottom: 10px; }
          .user-info p { font-size: 14px; color: #78350f; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
          .stat-card { background: #f9fafb; padding: 15px; border-radius: 10px; text-align: center; border: 1px solid #e5e7eb; }
          .stat-value { font-size: 24px; font-weight: bold; color: #1f2937; }
          .stat-label { font-size: 12px; color: #6b7280; margin-top: 4px; }
          .stat-card.green .stat-value { color: #059669; }
          .stat-card.red .stat-value { color: #dc2626; }
          .stat-card.amber .stat-value { color: #d97706; }
          .section-title { font-size: 18px; font-weight: bold; color: #1f2937; margin: 30px 0 15px; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #f3f4f6; padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
          td { padding: 10px 8px; border-bottom: 1px solid #f3f4f6; }
          tr:hover { background: #fafafa; }
          .status { padding: 4px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
          .status-won { background: #d1fae5; color: #065f46; }
          .status-lost { background: #fee2e2; color: #991b1b; }
          .status-pending { background: #fef3c7; color: #92400e; }
          .amount-positive { color: #059669; font-weight: 600; }
          .amount-negative { color: #dc2626; font-weight: 600; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 11px; }
          .warning-box { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 10px; margin-top: 30px; }
          .warning-box h4 { color: #991b1b; margin-bottom: 8px; }
          .warning-box p { color: #7f1d1d; font-size: 12px; }
          @media print { body { padding: 20px; } .stats-grid { grid-template-columns: repeat(2, 1fr); } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">🎰 BetPlatform</div>
          <div class="subtitle">Histórico de Apostas - ${dateRange}</div>
        </div>

        <div class="user-info">
          <h3>Informações do Utilizador</h3>
          <p><strong>Nome:</strong> ${profile?.full_name || 'N/A'}</p>
          <p><strong>Email:</strong> ${profile?.email || 'N/A'}</p>
          <p><strong>Data de Exportação:</strong> ${new Date().toLocaleString('pt-PT')}</p>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${filteredBets.length}</div>
            <div class="stat-label">Total de Apostas</div>
          </div>
          <div class="stat-card green">
            <div class="stat-value">€${totalWon.toFixed(2)}</div>
            <div class="stat-label">Total Ganho</div>
          </div>
          <div class="stat-card red">
            <div class="stat-value">€${totalStaked.toFixed(2)}</div>
            <div class="stat-label">Total Apostado</div>
          </div>
          <div class="stat-card amber">
            <div class="stat-value">${filteredBets.length > 0 ? ((wonCount / (wonCount + lostCount)) * 100).toFixed(1) : 0}%</div>
            <div class="stat-label">Taxa de Vitória</div>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card green">
            <div class="stat-value">${wonCount}</div>
            <div class="stat-label">Ganhas</div>
          </div>
          <div class="stat-card red">
            <div class="stat-value">${lostCount}</div>
            <div class="stat-label">Perdidas</div>
          </div>
          <div class="stat-card amber">
            <div class="stat-value">${pendingCount}</div>
            <div class="stat-label">Pendentes</div>
          </div>
          <div class="stat-card ${(totalWon - totalStaked) >= 0 ? 'green' : 'red'}">
            <div class="stat-value">${(totalWon - totalStaked) >= 0 ? '+' : ''}€${(totalWon - totalStaked).toFixed(2)}</div>
            <div class="stat-label">Lucro/Prejuízo</div>
          </div>
        </div>

        <h2 class="section-title">Detalhes das Apostas</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Seleções</th>
              <th>Odd</th>
              <th>Valor</th>
              <th>Ganho Potencial</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${filteredBets.map(bet => {
              const selections = bet.selections || [];
              const totalOdd = selections.reduce((acc: number, sel: any) => acc * (sel.odd || 1), 1);
              return `
                <tr>
                  <td>${new Date(bet.created_at).toLocaleString('pt-PT')}</td>
                  <td>${bet.type === 'single' ? 'Simples' : 'Múltipla'}</td>
                  <td>${selections.map((s: any) => `${s.home_team} vs ${s.away_team}: ${s.selection}`).join('<br>')}</td>
                  <td>${totalOdd.toFixed(2)}</td>
                  <td class="amount-negative">€${Number(bet.stake).toFixed(2)}</td>
                  <td class="amount-positive">€${Number(bet.potential_win).toFixed(2)}</td>
                  <td><span class="status status-${bet.status}">${
                    bet.status === 'won' ? 'GANHA' :
                    bet.status === 'lost' ? 'PERDIDA' : 'PENDENTE'
                  }</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="warning-box">
          <h4>⚠️ Jogue com Responsabilidade</h4>
          <p>Este documento é apenas para fins informativos. Se sente que o jogo está a afetar negativamente a sua vida, procure ajuda profissional. Linha de Apoio: 800 200 134 (gratuito) | www.jogadoresseguros.pt</p>
        </div>

        <div class="footer">
          <p>Documento gerado automaticamente em ${new Date().toLocaleString('pt-PT')}</p>
          <p>Este documento é confidencial e destinado apenas ao titular da conta.</p>
        </div>
      </body>
      </html>
    `;
  };

  const generateTransactionsHTML = (filteredTransactions: typeof transactions, dateRange: string) => {
    const deposits = filteredTransactions.filter(t => t.type === 'deposit' && t.status === 'completed');
    const withdrawals = filteredTransactions.filter(t => t.type === 'withdrawal' && t.status === 'completed');
    const totalDeposits = deposits.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalWithdrawals = withdrawals.reduce((sum, t) => sum + Number(t.amount), 0);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Histórico de Transações - ${profile?.full_name || 'Utilizador'}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; line-height: 1.5; padding: 40px; }
          .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #f59e0b; }
          .logo { font-size: 28px; font-weight: bold; color: #f59e0b; margin-bottom: 8px; }
          .subtitle { color: #6b7280; font-size: 14px; }
          .user-info { background: #fef3c7; padding: 20px; border-radius: 12px; margin-bottom: 30px; }
          .user-info h3 { color: #92400e; margin-bottom: 10px; }
          .user-info p { font-size: 14px; color: #78350f; }
          .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px; }
          .stat-card { background: #f9fafb; padding: 15px; border-radius: 10px; text-align: center; border: 1px solid #e5e7eb; }
          .stat-value { font-size: 24px; font-weight: bold; color: #1f2937; }
          .stat-label { font-size: 12px; color: #6b7280; margin-top: 4px; }
          .stat-card.green .stat-value { color: #059669; }
          .stat-card.blue .stat-value { color: #2563eb; }
          .section-title { font-size: 18px; font-weight: bold; color: #1f2937; margin: 30px 0 15px; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #f3f4f6; padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
          td { padding: 10px 8px; border-bottom: 1px solid #f3f4f6; }
          tr:hover { background: #fafafa; }
          .status { padding: 4px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
          .status-completed { background: #d1fae5; color: #065f46; }
          .status-pending { background: #fef3c7; color: #92400e; }
          .status-failed { background: #fee2e2; color: #991b1b; }
          .amount-positive { color: #059669; font-weight: 600; }
          .amount-negative { color: #2563eb; font-weight: 600; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 11px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">🎰 BetPlatform</div>
          <div class="subtitle">Histórico de Transações - ${dateRange}</div>
        </div>

        <div class="user-info">
          <h3>Informações do Utilizador</h3>
          <p><strong>Nome:</strong> ${profile?.full_name || 'N/A'}</p>
          <p><strong>Email:</strong> ${profile?.email || 'N/A'}</p>
          <p><strong>Data de Exportação:</strong> ${new Date().toLocaleString('pt-PT')}</p>
        </div>

        <div class="stats-grid">
          <div class="stat-card green">
            <div class="stat-value">€${totalDeposits.toFixed(2)}</div>
            <div class="stat-label">Total Depositado</div>
          </div>
          <div class="stat-card blue">
            <div class="stat-value">€${totalWithdrawals.toFixed(2)}</div>
            <div class="stat-label">Total Levantado</div>
          </div>
          <div class="stat-card ${(totalDeposits - totalWithdrawals) >= 0 ? 'green' : 'blue'}">
            <div class="stat-value">${(totalDeposits - totalWithdrawals) >= 0 ? '+' : ''}€${(totalDeposits - totalWithdrawals).toFixed(2)}</div>
            <div class="stat-label">Fluxo Líquido</div>
          </div>
        </div>

        <h2 class="section-title">Detalhes das Transações</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Método</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${filteredTransactions.map(t => `
              <tr>
                <td>${new Date(t.created_at).toLocaleString('pt-PT')}</td>
                <td>${
                  t.type === 'deposit' ? 'Depósito' :
                  t.type === 'withdrawal' ? 'Levantamento' :
                  t.type === 'bet' ? 'Aposta' :
                  t.type === 'win' ? 'Ganho' : t.type
                }</td>
                <td>${(t as any).method || '-'}</td>
                <td>${t.description || '-'}</td>
                <td class="${['deposit', 'win'].includes(t.type) ? 'amount-positive' : 'amount-negative'}">
                  ${['deposit', 'win'].includes(t.type) ? '+' : '-'}€${Number(t.amount).toFixed(2)}
                </td>
                <td><span class="status status-${t.status}">${
                  t.status === 'completed' ? 'CONCLUÍDO' :
                  t.status === 'pending' ? 'PENDENTE' : 'FALHADO'
                }</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>Documento gerado automaticamente em ${new Date().toLocaleString('pt-PT')}</p>
          <p>Este documento é confidencial e destinado apenas ao titular da conta.</p>
        </div>
      </body>
      </html>
    `;
  };

  const exportToPDF = async (
    type: 'bets' | 'transactions' | 'all',
    dateFilter?: { start: Date; end: Date }
  ) => {
    let filteredBets = bets;
    let filteredTransactions = transactions;
    let dateRange = 'Todo o Histórico';

    if (dateFilter) {
      filteredBets = bets.filter(b => {
        const date = new Date(b.created_at);
        return date >= dateFilter.start && date <= dateFilter.end;
      });
      filteredTransactions = transactions.filter(t => {
        const date = new Date(t.created_at);
        return date >= dateFilter.start && date <= dateFilter.end;
      });
      dateRange = `${dateFilter.start.toLocaleDateString('pt-PT')} - ${dateFilter.end.toLocaleDateString('pt-PT')}`;
    }

    let html = '';

    if (type === 'bets') {
      html = generateBetsHTML(filteredBets, dateRange);
    } else if (type === 'transactions') {
      html = generateTransactionsHTML(filteredTransactions, dateRange);
    } else {
      // Combinar ambos
      html = generateBetsHTML(filteredBets, dateRange);
    }

    // Abrir em nova janela para impressão/PDF
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      
      // Aguardar carregamento e imprimir
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 250);
      };
    }
  };

  const exportToCSV = (type: 'bets' | 'transactions') => {
    let csv = '';
    let filename = '';

    if (type === 'bets') {
      csv = 'Data,Tipo,Valor,Odd Total,Ganho Potencial,Estado,Seleções\n';
      bets.forEach(bet => {
        const selections = bet.selections || [];
        const totalOdd = selections.reduce((acc: number, sel: any) => acc * (sel.odd || 1), 1);
        const selectionsStr = selections.map((s: any) => `${s.home_team} vs ${s.away_team}: ${s.selection}`).join(' | ');
        csv += `"${new Date(bet.created_at).toLocaleString('pt-PT')}","${bet.type}","€${Number(bet.stake).toFixed(2)}","${totalOdd.toFixed(2)}","€${Number(bet.potential_win).toFixed(2)}","${bet.status}","${selectionsStr}"\n`;
      });
      filename = `apostas-${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      csv = 'Data,Tipo,Método,Valor,Estado,Descrição\n';
      transactions.forEach(t => {
        csv += `"${new Date(t.created_at).toLocaleString('pt-PT')}","${t.type}","${(t as any).method || ''}","€${Number(t.amount).toFixed(2)}","${t.status}","${t.description || ''}"\n`;
      });
      filename = `transacoes-${new Date().toISOString().split('T')[0]}.csv`;
    }

    // Download CSV
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  return {
    exportToPDF,
    exportToCSV,
    betsCount: bets.length,
    transactionsCount: transactions.length
  };
};
