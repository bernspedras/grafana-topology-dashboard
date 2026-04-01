import { getTopologyList, getSeedData, resolveTopologiesFromSettings } from './topologyRegistry';
import type { AppSettings } from '../../../module';

describe('topologyRegistry', () => {
  it('getSeedData returns empty arrays by default', () => {
    const seed = getSeedData();
    expect(seed.flows).toEqual([]);
    expect(seed.nodeTemplates).toEqual([]);
    expect(seed.edgeTemplates).toEqual([]);
    expect(seed.datasources).toEqual([]);
  });

  it('getTopologyList returns an empty array by default', () => {
    expect(getTopologyList()).toEqual([]);
  });

  it('resolveTopologiesFromSettings returns empty for empty settings', () => {
    expect(resolveTopologiesFromSettings({})).toEqual([]);
  });

  it('resolveTopologiesFromSettings resolves topologies from settings', () => {
    const settings: AppSettings = {
      topologies: [
        {
          id: 'example-flow',
          name: 'Example Flow',
          definition: { nodes: [], edges: [] },
        },
      ],
      nodeTemplates: [],
      edgeTemplates: [],
    } as unknown as AppSettings;

    const topologies = resolveTopologiesFromSettings(settings);
    expect(topologies.length).toBe(1);
    expect(topologies[0].id).toBe('example-flow');
    expect(topologies[0].name).toBe('Example Flow');
  });
});
