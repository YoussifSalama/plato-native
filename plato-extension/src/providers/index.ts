import { DEFINITIONS } from './definitions';
import { extraProviders } from './extra';
import { createRegistry } from './registry';

export const registry = createRegistry([...DEFINITIONS, ...extraProviders]);
