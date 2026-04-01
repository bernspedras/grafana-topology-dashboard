import { useState, useEffect } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TopologyListItem {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface UseTopologiesResult {
  readonly topologies: readonly TopologyListItem[];
  readonly loading: boolean;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useTopologies(): UseTopologiesResult {
  const [topologies, setTopologies] = useState<readonly TopologyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect((): void => {
    const fetchTopologies = async (): Promise<void> => {
      try {
        const response = await fetch('/api/topologies');
        if (response.ok) {
          const data = (await response.json()) as readonly TopologyListItem[];
          setTopologies(data);
        }
      } catch {
        // silent — will show empty list
      } finally {
        setLoading(false);
      }
    };
    void fetchTopologies();
  }, []);

  return { topologies, loading };
}
