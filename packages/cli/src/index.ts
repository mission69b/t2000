#!/usr/bin/env node
import process from 'node:process';

const _origEmit = process.emit;
// @ts-expect-error -- suppress Node 25 DEP0169 from bundled deps (url.parse in axios/combined-stream)
process.emit = function (event: string, ...args: unknown[]) {
  if (event === 'warning' && typeof args[0] === 'object' && args[0] !== null && (args[0] as { name?: string }).name === 'DeprecationWarning' && (args[0] as { code?: string }).code === 'DEP0169') {
    return false;
  }
  return _origEmit.apply(this, [event, ...args] as Parameters<typeof _origEmit>);
};

import { createProgram } from './program.js';

const program = createProgram();
program.parse();
