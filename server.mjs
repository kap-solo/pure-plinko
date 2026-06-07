import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSukiHost, resolveSukiPackageDir } from '@kap-solo/suki-engine/server/host.mjs';
import { createPlinkoMockRgs } from './server/plinko-rgs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

createSukiHost({
  rootDir: __dirname,
  rgs: createPlinkoMockRgs(),
  sukiPackageDir: resolveSukiPackageDir(__dirname),
  label: 'Pure Plinko',
}).listen();
