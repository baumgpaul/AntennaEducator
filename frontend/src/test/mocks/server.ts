/**
 * Mock Service Worker Server Setup
 * Used for testing in Vitest
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
