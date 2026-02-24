import { startIndexer } from './indexer.js';
import { startYieldSnapshotter } from './yieldSnapshotter.js';

console.log('t2000 indexer starting...');

startIndexer();
startYieldSnapshotter();

process.on('SIGTERM', () => {
  console.log('[indexer] Shutting down...');
  process.exit(0);
});
