
import { useState, useMemo } from 'react';
import { useBets } from './useBets';
import { useTransactions } from './useTransactions';

export interface GamblingAlert {
  id: string;
  type: 'warning' | 'danger' | 'critical';
  category: 'frequency' | 'losses' | 'chasing' | 'time' | 'deposit' | 'behavior';
  title: string;
  description: string;
  recommendation: string;
  detectedAt: Date;
  dismissed: boolean;
}

interface PatternAnalysis {
  alerts: GamblingAlert[];
  riskScore: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
}

export const useGamblingAlerts = () => {
  const { bets } = useBets();
  const { transactions } = useTransactions();
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  // Analisar padrões nos últimos 7 dias
  const last7DaysBets = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return bets.filter(bet => new Date(bet.created_at) >= sevenDaysAgo);
  }, [bets]);

  // Analisar padrões nas últimas 24 horas
  const last24HoursBets = useMemo(() => {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    return bets.filter(bet => new Date(bet.created_at) >= oneDayAgo);
  }, [bets]);

  // Transações dos últimos 7 dias
  const last7DaysTransactions = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return transactions.filter(t => new Date(t.created_at) >= sevenDaysAgo);
  }, [transactions]);

  const analyzePatterns = useMemo((): PatternAnalysis => {
    const alerts: GamblingAlert[] = [];
    let riskScore = 0;

    // 1. FREQUÊNCIA EXCESSIVA - Mais de 20 apostas em 24h
    if (last24HoursBets.length > 20) {
      alerts.push({
        id: 'freq-24h-high',
        type: 'danger',
        category: 'frequency',
        title: 'Frequência Muito Alta',
        description: `Fez ${last24HoursBets.length} apostas nas últimas 24 horas.`,
        recommendation: 'Considere fazer uma pausa. Apostar com muita frequência pode indicar perda de controlo.',
        detectedAt: new Date(),
        dismissed: false
      });
      riskScore += 25;
    } else if (last24HoursBets.length > 10) {
      alerts.push({
        id: 'freq-24h-moderate',
        type: 'warning',
        category: 'frequency',
        title: 'Frequência Elevada',
        description: `Fez ${last24HoursBets.length} apostas nas últimas 24 horas.`,
        recommendation: 'Tente espaçar mais as suas apostas ao longo do tempo.',
        detectedAt: new Date(),
        dismissed: false
      });
      riskScore += 10;
    }

    // 2. PERDAS CONSECUTIVAS - Mais de 5 perdas seguidas
    const recentSettledBets = bets
      .filter(b => b.status !== 'pending')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
    
    let consecutiveLosses = 0;
    for (const bet of recentSettledBets) {
      if (bet.status === 'lost') {
        consecutiveLosses++;
      } else {
        break;
      }
    }

    if (consecutiveLosses >= 7) {
      alerts.push({
        id: 'losses-consecutive-critical',
        type: 'critical',
        category: 'losses',
        title: 'Série de Perdas Crítica',
        description: `Perdeu ${consecutiveLosses} apostas consecutivas.`,
        recommendation: 'Recomendamos fortemente que faça uma pausa. Continuar a apostar após muitas perdas pode agravar a situação.',
        detectedAt: new Date(),
        dismissed: false
      });
      riskScore += 35;
    } else if (consecutiveLosses >= 5) {
      alerts.push({
        id: 'losses-consecutive-high',
        type: 'danger',
        category: 'losses',
        title: 'Várias Perdas Consecutivas',
        description: `Perdeu ${consecutiveLosses} apostas seguidas.`,
        recommendation: 'Considere parar por hoje. Apostar para recuperar perdas raramente funciona.',
        detectedAt: new Date(),
        dismissed: false
      });
      riskScore += 20;
    }

    // 3. CHASING LOSSES - Aumentar apostas após perdas
    const recentBetsWithStakes = bets
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(-10);
    
    let chasingDetected = false;
    for (let i = 1; i < recentBetsWithStakes.length; i++) {
      const prevBet = recentBetsWithStakes[i - 1];
      const currBet = recentBetsWithStakes[i];
      
      if (prevBet.status === 'lost' && Number(currBet.stake) > Number(prevBet.stake) * 1.5) {
        chasingDetected = true;
        break;
      }
    }

    if (chasingDetected) {
      alerts.push({
        id: 'chasing-losses',
        type: 'danger',
        category: 'chasing',
        title: 'Padrão de Recuperação Detetado',
        description: 'Está a aumentar significativamente as apostas após perdas.',
        recommendation: 'Este é um comportamento de risco. Nunca tente recuperar perdas aumentando as apostas.',
        detectedAt: new Date(),
        dismissed: false
      });
      riskScore += 30;
    }

    // 4. DEPÓSITOS FREQUENTES - Mais de 3 depósitos em 24h
    const last24HoursDeposits = last7DaysTransactions.filter(t => {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      return t.type === 'deposit' && t.status === 'completed' && new Date(t.created_at) >= oneDayAgo;
    });

    if (last24HoursDeposits.length >= 5) {
      alerts.push({
        id: 'deposits-frequent-critical',
        type: 'critical',
        category: 'deposit',
        title: 'Depósitos Muito Frequentes',
        description: `Fez ${last24HoursDeposits.length} depósitos nas últimas 24 horas.`,
        recommendation: 'Depositar frequentemente pode indicar que está a gastar mais do que planeou. Considere definir limites.',
        detectedAt: new Date(),
        dismissed: false
      });
      riskScore += 30;
    } else if (last24HoursDeposits.length >= 3) {
      alerts.push({
        id: 'deposits-frequent',
        type: 'warning',
        category: 'deposit',
        title: 'Múltiplos Depósitos',
        description: `Fez ${last24HoursDeposits.length} depósitos nas últimas 24 horas.`,
        recommendation: 'Considere depositar um valor maior de uma só vez para evitar impulsos.',
        detectedAt: new Date(),
        dismissed: false
      });
      riskScore += 15;
    }

    // 5. PERDAS ELEVADAS - Perdeu mais de 50% do saldo em 7 dias
    const totalLost7Days = last7DaysBets
      .filter(b => b.status === 'lost')
      .reduce((sum, b) => sum + Number(b.stake), 0);
    
    const totalDeposited7Days = last7DaysTransactions
      .filter(t => t.type === 'deposit' && t.status === 'completed')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    if (totalDeposited7Days > 0 && totalLost7Days > totalDeposited7Days * 0.8) {
      alerts.push({
        id: 'losses-high-critical',
        type: 'critical',
        category: 'losses',
        title: 'Perdas Muito Elevadas',
        description: `Perdeu €${totalLost7Days.toFixed(2)} nos últimos 7 dias (${((totalLost7Days / totalDeposited7Days) * 100).toFixed(0)}% dos depósitos).`,
        recommendation: 'As suas perdas são muito elevadas. Recomendamos uma pausa prolongada.',
        detectedAt: new Date(),
        dismissed: false
      });
      riskScore += 40;
    } else if (totalDeposited7Days > 0 && totalLost7Days > totalDeposited7Days * 0.5) {
      alerts.push({
        id: 'losses-high',
        type: 'danger',
        category: 'losses',
        title: 'Perdas Significativas',
        description: `Perdeu €${totalLost7Days.toFixed(2)} nos últimos 7 dias.`,
        recommendation: 'Considere reduzir o valor das suas apostas ou fazer uma pausa.',
        detectedAt: new Date(),
        dismissed: false
      });
      riskScore += 20;
    }

    // 6. APOSTAS EM HORÁRIOS TARDIOS - Muitas apostas entre 00h-06h
    const lateNightBets = last7DaysBets.filter(bet => {
      const hour = new Date(bet.created_at).getHours();
      return hour >= 0 && hour < 6;
    });

    if (lateNightBets.length >= 10) {
      alerts.push({
        id: 'late-night-betting',
        type: 'warning',
        category: 'time',
        title: 'Apostas em Horários Tardios',
        description: `Fez ${lateNightBets.length} apostas entre as 00h e 06h esta semana.`,
        recommendation: 'Apostar de madrugada pode afetar o seu sono e decisões. Tente apostar em horários regulares.',
        detectedAt: new Date(),
        dismissed: false
      });
      riskScore += 15;
    }

    // 7. AUMENTO PROGRESSIVO DE STAKES
    const weeklyStakes = last7DaysBets.map(b => Number(b.stake));
    if (weeklyStakes.length >= 5) {
      const firstHalf = weeklyStakes.slice(0, Math.floor(weeklyStakes.length / 2));
      const secondHalf = weeklyStakes.slice(Math.floor(weeklyStakes.length / 2));
      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      if (avgSecond > avgFirst * 2) {
        alerts.push({
          id: 'stakes-increasing',
          type: 'danger',
          category: 'behavior',
          title: 'Aumento de Valores Apostados',
          description: 'Os valores das suas apostas duplicaram recentemente.',
          recommendation: 'Aumentar progressivamente as apostas pode ser um sinal de alerta. Mantenha valores consistentes.',
          detectedAt: new Date(),
          dismissed: false
        });
        riskScore += 25;
      }
    }

    // Calcular nível de risco
    let riskLevel: 'low' | 'moderate' | 'high' | 'critical' = 'low';
    if (riskScore >= 80) {
      riskLevel = 'critical';
    } else if (riskScore >= 50) {
      riskLevel = 'high';
    } else if (riskScore >= 25) {
      riskLevel = 'moderate';
    }

    return {
      alerts: alerts.filter(a => !dismissedAlerts.includes(a.id)),
      riskScore: Math.min(riskScore, 100),
      riskLevel
    };
  }, [bets, last7DaysBets, last24HoursBets, last7DaysTransactions, dismissedAlerts]);

  const dismissAlert = (alertId: string) => {
    setDismissedAlerts(prev => [...prev, alertId]);
  };

  const dismissAllAlerts = () => {
    setDismissedAlerts(analyzePatterns.alerts.map(a => a.id));
  };

  const getActiveAlerts = () => analyzePatterns.alerts;
  const getCriticalAlerts = () => analyzePatterns.alerts.filter(a => a.type === 'critical');
  const getDangerAlerts = () => analyzePatterns.alerts.filter(a => a.type === 'danger');
  const getWarningAlerts = () => analyzePatterns.alerts.filter(a => a.type === 'warning');

  return {
    alerts: analyzePatterns.alerts,
    riskScore: analyzePatterns.riskScore,
    riskLevel: analyzePatterns.riskLevel,
    dismissAlert,
    dismissAllAlerts,
    getActiveAlerts,
    getCriticalAlerts,
    getDangerAlerts,
    getWarningAlerts,
    hasAlerts: analyzePatterns.alerts.length > 0,
    hasCriticalAlerts: getCriticalAlerts().length > 0
  };
};
