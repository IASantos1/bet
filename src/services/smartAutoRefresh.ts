/**
 * Serviço de Atualização Automática Silenciosa
 * Gerencia atualizações em tempo real sem recarregar a página
 */

interface RefreshTask {
  id: string;
  fetchFn: () => Promise<any>;
  interval: number;
  priority: 'high' | 'medium' | 'low';
  lastRun: number;
  isRunning: boolean;
}

class SmartAutoRefreshService {
  private tasks: Map<string, RefreshTask> = new Map();
  private intervalId: NodeJS.Timeout | null = null;
  private isActive = false;
  private readonly BASE_INTERVAL = 1000; // 1 segundo

  /**
   * Registrar uma tarefa de atualização
   */
  registerTask(
    id: string,
    fetchFn: () => Promise<any>,
    interval: number = 3000,
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): void {
    this.tasks.set(id, {
      id,
      fetchFn,
      interval,
      priority,
      lastRun: 0,
      isRunning: false,
    });

    if (!this.isActive) {
      this.start();
    }
  }

  /**
   * Remover uma tarefa de atualização
   */
  unregisterTask(id: string): void {
    this.tasks.delete(id);

    if (this.tasks.size === 0) {
      this.stop();
    }
  }

  /**
   * Iniciar o serviço de atualização
   */
  private start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.intervalId = setInterval(() => {
      this.runTasks();
    }, this.BASE_INTERVAL);
  }

  /**
   * Parar o serviço de atualização
   */
  private stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isActive = false;
  }

  /**
   * Executar tarefas pendentes
   */
  private async runTasks(): Promise<void> {
    const now = Date.now();

    // Ordenar tarefas por prioridade
    const sortedTasks = Array.from(this.tasks.values()).sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    for (const task of sortedTasks) {
      // Verificar se é hora de executar
      if (now - task.lastRun >= task.interval && !task.isRunning) {
        this.executeTask(task);
      }
    }
  }

  /**
   * Executar uma tarefa específica
   */
  private async executeTask(task: RefreshTask): Promise<void> {
    task.isRunning = true;
    task.lastRun = Date.now();

    try {
      await task.fetchFn();
    } catch (error) {
      console.error(`[SmartAutoRefresh] Erro na tarefa ${task.id}:`, error);
    } finally {
      task.isRunning = false;
    }
  }

  /**
   * Forçar execução de uma tarefa
   */
  async forceRun(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (task && !task.isRunning) {
      await this.executeTask(task);
    }
  }

  /**
   * Obter estatísticas do serviço
   */
  getStats(): {
    activeTasks: number;
    isActive: boolean;
    tasks: Array<{ id: string; priority: string; interval: number }>;
  } {
    return {
      activeTasks: this.tasks.size,
      isActive: this.isActive,
      tasks: Array.from(this.tasks.values()).map((t) => ({
        id: t.id,
        priority: t.priority,
        interval: t.interval,
      })),
    };
  }

  /**
   * Limpar todas as tarefas
   */
  clear(): void {
    this.tasks.clear();
    this.stop();
  }
}

export const smartAutoRefreshService = new SmartAutoRefreshService();
