import { useState, useEffect, useRef, useCallback } from 'react';
import type { TopologyGraph } from '../domain';
import type { TopologyGraphDto, PromqlQueriesMap } from '../domain/dto';
import { deserializeGraph } from './deserializeGraph';

// ─── Types ────────────────────────────────────────────────────────────────────

type StreamStatus = 'connecting' | 'connected' | 'disconnected';

interface UseTopologyStreamResult {
  readonly graph: TopologyGraph | undefined;
  readonly status: StreamStatus;
  readonly promqlQueries: PromqlQueriesMap;
  readonly refreshTick: number;
  readonly pollIntervalMs: number | undefined;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTopologyStream(topologyId: string): UseTopologyStreamResult {
  const [graph, setGraph] = useState<TopologyGraph | undefined>(undefined);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [refreshTick, setRefreshTick] = useState(0);
  const [pollIntervalMs, setPollIntervalMs] = useState<number | undefined>(undefined);
  const promqlQueriesRef = useRef<PromqlQueriesMap>({});
  const incrementTick = useCallback((): void => { setRefreshTick((t) => t + 1); }, []);

  useEffect((): (() => void) => {
    setGraph(undefined);
    setStatus('connecting');
    promqlQueriesRef.current = {};

    const es = new EventSource('/api/topologies/' + encodeURIComponent(topologyId) + '/stream');

    es.addEventListener('open', (): void => {
      setStatus('connected');
    });

    es.addEventListener('topology', (event: MessageEvent<string>): void => {
      const parsed: unknown = JSON.parse(event.data);
      if (typeof parsed === 'object' && parsed !== null && 'nodes' in parsed && 'edges' in parsed) {
        const dto = parsed as TopologyGraphDto; // serialization boundary
        promqlQueriesRef.current = dto.promqlQueries;
        setPollIntervalMs(dto.pollIntervalMs);
        setGraph(deserializeGraph(dto));
        incrementTick();
      }
    });

    es.addEventListener('error', (): void => {
      if (es.readyState === EventSource.CLOSED) {
        setStatus('disconnected');
      }
    });

    return (): void => {
      es.close();
      setStatus('disconnected');
    };
  }, [topologyId, incrementTick]);

  return { graph, status, promqlQueries: promqlQueriesRef.current, refreshTick, pollIntervalMs };
}
