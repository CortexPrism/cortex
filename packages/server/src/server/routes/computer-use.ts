import { type RouteHandler, json, listComputerScreenshots, listComputerActions } from './_helpers.ts';
import { loadConfig } from '../../../../../src/config/config.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/computer\/screenshots$/,
    handler: async () => {
      const screenshots = await listComputerScreenshots();
      return json({ screenshots });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/computer\/actions$/,
    handler: async () => {
      const actions = await listComputerActions();
      return json(actions);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/computer\/config$/,
    handler: async () => {
      const { isComputerUseAvailable } = await import('../../computer-use/display.ts');
      const available = await isComputerUseAvailable();
      const config = await loadConfig();
      const cu = config.computerUse;
      return json({
        available,
        resolution: `${cu?.displayWidth ?? 1024}x${cu?.displayHeight ?? 768}`,
        dpi: 96,
        displayWidth: cu?.displayWidth ?? 1024,
        displayHeight: cu?.displayHeight ?? 768,
        runtime: cu?.runtime ?? 'native',
      });
    },
  },
];
