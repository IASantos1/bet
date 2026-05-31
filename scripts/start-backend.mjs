import jiti from 'jiti';

const require = jiti(import.meta.url, { interopDefault: true, esmResolve: true });

require('../server/index.ts');
