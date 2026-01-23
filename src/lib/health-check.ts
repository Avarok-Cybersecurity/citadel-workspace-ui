import { websocketService } from './websocket-service';
import { eventEmitter } from './event-emitter';

export interface ServiceHealth {
  isHealthy: boolean;
  lastCheck: number;
  error?: string;
}

export class HealthCheckService {
  private static instance: HealthCheckService;
  private checkInterval: NodeJS.Timeout | null = null;
  private health: ServiceHealth = {
    isHealthy: false,
    lastCheck: 0
  };
  
  private constructor() {}
  
  public static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }
  
  /**
   * Perform a health check by attempting to connect to the WebSocket
   */
  public async checkHealth(): Promise<ServiceHealth> {
    try {
      // Try to initialize WebSocket connection
      const isConnected = await websocketService.isConnected();
      
      this.health = {
        isHealthy: isConnected,
        lastCheck: Date.now()
      };
      
      // Emit health status
      eventEmitter.emit('service-health', this.health);
      
      return this.health;
    } catch (error) {
      this.health = {
        isHealthy: false,
        lastCheck: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      eventEmitter.emit('service-health', this.health);
      
      return this.health;
    }
  }
  
  /**
   * Start periodic health checks
   */
  public startHealthChecks(intervalMs: number = 30000): void {
    this.stopHealthChecks();
    
    // Initial check
    (async () => {
      await this.checkHealth();
    })().catch(console.error);

    // Periodic checks
    this.checkInterval = setInterval(() => {
      (async () => {
        await this.checkHealth();
      })().catch(console.error);
    }, intervalMs);
  }
  
  /**
   * Stop periodic health checks
   */
  public stopHealthChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
  
  /**
   * Get current health status without performing a check
   */
  public getHealth(): ServiceHealth {
    return this.health;
  }
  
  /**
   * Wait for service to be healthy with timeout
   */
  public async waitForHealthy(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const health = await this.checkHealth();
      
      if (health.isHealthy) {
        return;
      }
      
      // Wait a bit before next check
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Service did not become healthy within ${timeoutMs}ms`);
  }
}

export const healthCheckService = HealthCheckService.getInstance();