
import {
  NodeMetrics,
  BaseEdgeMetrics,
  HttpEdgeMetrics,
  DbConnectionMetrics,
  AmqpEdgeMetrics,
  KafkaEdgeMetrics,
  DeploymentMetrics,
  CustomMetricValue,
} from './metrics';

const NOW = new Date('2026-03-19T12:00:00Z');

describe('NodeMetrics', (): void => {
  it('stores all fields from constructor', (): void => {
    const m = new NodeMetrics({
      cpu: 42.5,
      memory: 78.1,
      lastUpdatedAt: NOW,
    });

    expect(m.cpu).toBe(42.5);
    expect(m.memory).toBe(78.1);
    expect(m.lastUpdatedAt).toBe(NOW);
  });

  it('is not an instance of BaseEdgeMetrics', (): void => {
    const m = new NodeMetrics({
      cpu: 0,
      memory: 0,
      lastUpdatedAt: NOW,
    });

    expect(m).toBeInstanceOf(NodeMetrics);
    expect(m).not.toBeInstanceOf(BaseEdgeMetrics);
  });
});

describe('HttpEdgeMetrics', (): void => {
  const params = {
    latencyP95: 120,
    rps: 5000,
    errorRate: 0.3,
    lastUpdatedAt: NOW,
  };

  it('stores base edge metrics fields', (): void => {
    const m = new HttpEdgeMetrics(params);

    expect(m.latencyP95).toBe(120);
    expect(m.rps).toBe(5000);
    expect(m.errorRate).toBe(0.3);
    expect(m.lastUpdatedAt).toBe(NOW);
  });

  it('is an instance of BaseEdgeMetrics', (): void => {
    const m = new HttpEdgeMetrics(params);

    expect(m).toBeInstanceOf(HttpEdgeMetrics);
    expect(m).toBeInstanceOf(BaseEdgeMetrics);
  });

  it('is not an instance of DbConnectionMetrics', (): void => {
    const m = new HttpEdgeMetrics(params);

    expect(m).not.toBeInstanceOf(DbConnectionMetrics);
  });
});

describe('DbConnectionMetrics', (): void => {
  const params = {
    latencyP95: 8,
    rps: 1200,
    errorRate: 0.01,
    lastUpdatedAt: NOW,
    activeConnections: 25,
    idleConnections: 5,
    avgQueryTimeMs: 3.2,
    poolHitRatePercent: 95,
    poolTimeoutsPerMin: 0.5,
    staleConnectionsPerMin: 1.2,
  };

  it('stores base and db-specific fields', (): void => {
    const m = new DbConnectionMetrics(params);

    expect(m.latencyP95).toBe(8);
    expect(m.rps).toBe(1200);
    expect(m.errorRate).toBe(0.01);
    expect(m.lastUpdatedAt).toBe(NOW);
    expect(m.activeConnections).toBe(25);
    expect(m.idleConnections).toBe(5);
    expect(m.avgQueryTimeMs).toBe(3.2);
    expect(m.poolHitRatePercent).toBe(95);
    expect(m.poolTimeoutsPerMin).toBe(0.5);
    expect(m.staleConnectionsPerMin).toBe(1.2);
  });

  it('is an instance of both DbConnectionMetrics and BaseEdgeMetrics', (): void => {
    const m = new DbConnectionMetrics(params);

    expect(m).toBeInstanceOf(DbConnectionMetrics);
    expect(m).toBeInstanceOf(BaseEdgeMetrics);
  });

  it('is not an instance of HttpEdgeMetrics', (): void => {
    const m = new DbConnectionMetrics(params);

    expect(m).not.toBeInstanceOf(HttpEdgeMetrics);
  });
});

describe('AmqpEdgeMetrics', (): void => {
  const params = {
    latencyP95: 45,
    latencyAvg: 30,
    rps: 800,
    errorRate: 0.5,
    lastUpdatedAt: NOW,
    queueResidenceTimeP95: 12,
    queueResidenceTimeAvg: 8,
    consumerProcessingTimeP95: 20,
    consumerProcessingTimeAvg: 15,
    e2eLatencyP95: 55,
    e2eLatencyAvg: 40,
    queueDepth: 150,
    consumerRps: 750,
    consumerErrorRate: 0.1,
    queueResidenceTimeP95WeekAgo: 10,
    e2eLatencyP95WeekAgo: 50,
    queueDepthWeekAgo: 120,
    consumerRpsWeekAgo: 700,
    consumerErrorRateWeekAgo: 0.2,
  };

  it('stores base and amqp-specific fields', (): void => {
    const m = new AmqpEdgeMetrics(params);

    expect(m.latencyP95).toBe(45);
    expect(m.rps).toBe(800);
    expect(m.errorRate).toBe(0.5);
    expect(m.queueResidenceTimeP95).toBe(12);
    expect(m.queueResidenceTimeAvg).toBe(8);
    expect(m.consumerProcessingTimeP95).toBe(20);
    expect(m.consumerProcessingTimeAvg).toBe(15);
    expect(m.e2eLatencyP95).toBe(55);
    expect(m.e2eLatencyAvg).toBe(40);
    expect(m.queueDepth).toBe(150);
    expect(m.consumerRps).toBe(750);
    expect(m.consumerErrorRate).toBe(0.1);
    expect(m.queueResidenceTimeP95WeekAgo).toBe(10);
    expect(m.e2eLatencyP95WeekAgo).toBe(50);
    expect(m.queueDepthWeekAgo).toBe(120);
    expect(m.consumerRpsWeekAgo).toBe(700);
    expect(m.consumerErrorRateWeekAgo).toBe(0.2);
  });

  it('is an instance of BaseEdgeMetrics', (): void => {
    const m = new AmqpEdgeMetrics(params);

    expect(m).toBeInstanceOf(AmqpEdgeMetrics);
    expect(m).toBeInstanceOf(BaseEdgeMetrics);
  });
});

describe('KafkaEdgeMetrics', (): void => {
  const params = {
    latencyP95: 35,
    latencyAvg: 25,
    rps: 1000,
    errorRate: 0.2,
    lastUpdatedAt: NOW,
    queueResidenceTimeP95: 10,
    queueResidenceTimeAvg: 7,
    consumerProcessingTimeP95: 18,
    consumerProcessingTimeAvg: 12,
    e2eLatencyP95: 50,
    e2eLatencyAvg: 35,
    consumerLag: 500,
    consumerRps: 950,
    consumerErrorRate: 0.05,
    consumerLagWeekAgo: 400,
    consumerRpsWeekAgo: 900,
    consumerErrorRateWeekAgo: 0.1,
  };

  it('stores base and kafka-specific fields', (): void => {
    const m = new KafkaEdgeMetrics(params);

    expect(m.latencyP95).toBe(35);
    expect(m.rps).toBe(1000);
    expect(m.errorRate).toBe(0.2);
    expect(m.queueResidenceTimeP95).toBe(10);
    expect(m.queueResidenceTimeAvg).toBe(7);
    expect(m.consumerProcessingTimeP95).toBe(18);
    expect(m.consumerProcessingTimeAvg).toBe(12);
    expect(m.e2eLatencyP95).toBe(50);
    expect(m.e2eLatencyAvg).toBe(35);
    expect(m.consumerLag).toBe(500);
    expect(m.consumerRps).toBe(950);
    expect(m.consumerErrorRate).toBe(0.05);
    expect(m.consumerLagWeekAgo).toBe(400);
    expect(m.consumerRpsWeekAgo).toBe(900);
    expect(m.consumerErrorRateWeekAgo).toBe(0.1);
  });

  it('is an instance of BaseEdgeMetrics', (): void => {
    const m = new KafkaEdgeMetrics(params);

    expect(m).toBeInstanceOf(KafkaEdgeMetrics);
    expect(m).toBeInstanceOf(BaseEdgeMetrics);
  });
});

describe('DeploymentMetrics', (): void => {
  it('stores all fields from constructor', (): void => {
    const m = new DeploymentMetrics({
      name: 'api',
      cpu: 45,
      memory: 60,
      readyReplicas: 3,
      desiredReplicas: 5,
      cpuWeekAgo: 40,
      memoryWeekAgo: 55,
    });

    expect(m.name).toBe('api');
    expect(m.cpu).toBe(45);
    expect(m.memory).toBe(60);
    expect(m.readyReplicas).toBe(3);
    expect(m.desiredReplicas).toBe(5);
    expect(m.cpuWeekAgo).toBe(40);
    expect(m.memoryWeekAgo).toBe(55);
    expect(m.customMetrics).toEqual([]);
  });
});

describe('CustomMetricValue', (): void => {
  it('stores all fields from constructor', (): void => {
    const m = new CustomMetricValue({
      key: 'goroutines',
      label: 'Goroutines',
      value: 120,
      valueWeekAgo: 100,
      unit: 'count',
      direction: 'lower-is-better',
      description: 'Number of goroutines',
    });

    expect(m.key).toBe('goroutines');
    expect(m.label).toBe('Goroutines');
    expect(m.value).toBe(120);
    expect(m.valueWeekAgo).toBe(100);
    expect(m.unit).toBe('count');
    expect(m.direction).toBe('lower-is-better');
    expect(m.description).toBe('Number of goroutines');
  });

  it('defaults optional fields to undefined', (): void => {
    const m = new CustomMetricValue({
      key: 'test',
      label: 'Test',
    });

    expect(m.value).toBeUndefined();
    expect(m.valueWeekAgo).toBeUndefined();
    expect(m.unit).toBeUndefined();
    expect(m.direction).toBeUndefined();
    expect(m.description).toBeUndefined();
  });
});
