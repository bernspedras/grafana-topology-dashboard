import pluginJson from './plugin.json';

export const PLUGIN_ID: string = pluginJson.id;
export const PLUGIN_BASE_URL = `/a/${PLUGIN_ID}`;

export enum ROUTES {
  Topology = 'topology',
}
