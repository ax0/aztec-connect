import { PooledPedersen } from '@aztec/barretenberg/crypto';
import { PooledFftFactory } from '@aztec/barretenberg/fft';
import { PooledPippenger } from '@aztec/barretenberg/pippenger';
import { ServerRollupProvider } from '@aztec/barretenberg/rollup_provider';
import { BarretenbergWasm, WorkerPool } from '@aztec/barretenberg/wasm';
import { PooledNoteDecryptor } from '@aztec/barretenberg/note_algorithms';
import isNode from 'detect-node';
import { mkdirSync } from 'fs';
import levelup, { LevelUp } from 'levelup';
import { createConnection } from 'typeorm';
import { CoreSdk, CoreSdkOptions } from '../../core_sdk';
import { DexieDatabase, getOrmConfig, SQLDatabase } from '../../database';
import { getNumWorkers } from '../get_num_workers';
import { createDebugLogger } from '@aztec/barretenberg/log';

const debug = createDebugLogger('bb:create_vanilla_core_sdk');

export function getLevelDb(memoryDb = false, identifier?: string): LevelUp {
  if (isNode) {
    const folder = identifier ? `/${identifier}` : '';
    const dbPath = `./data${folder}`;
    if (memoryDb) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return levelup(require('memdown')());
    } else {
      mkdirSync(dbPath, { recursive: true });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return levelup(require('leveldown')(`${dbPath}/aztec2-sdk.db`));
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return levelup(require('level-js')(`aztec2-sdk`));
  }
}

export async function getDb(memoryDb = false, identifier?: string) {
  if (isNode) {
    const config = getOrmConfig(memoryDb, identifier);
    const connection = await createConnection(config);
    return new SQLDatabase(connection);
  } else {
    return new DexieDatabase();
  }
}

export interface VanillaCoreSdkOptions extends CoreSdkOptions {
  memoryDb?: boolean; // node only
  identifier?: string; // node only
  numWorkers?: number;
}

/**
 * Construct a vanilla version of the CodeSdk.
 * This is used in backend node apps.
 * Dapps should use either strawberry or chocolate.
 */
export async function createVanillaCoreSdk(options: VanillaCoreSdkOptions) {
  debug('creating vanilla core sdk...');
  const { numWorkers = getNumWorkers() } = options;
  const wasm = await BarretenbergWasm.new();
  const workerPool = await WorkerPool.new(wasm, numWorkers);
  const noteDecryptor = new PooledNoteDecryptor(workerPool);
  const pedersen = new PooledPedersen(wasm, workerPool);
  const pippenger = new PooledPippenger(workerPool);
  const fftFactory = new PooledFftFactory(workerPool);
  const { memoryDb, identifier, serverUrl, pollInterval } = options;

  const leveldb = getLevelDb(memoryDb, identifier);
  const db = await getDb(memoryDb, identifier);

  const host = new URL(serverUrl);
  const rollupProvider = new ServerRollupProvider(host, pollInterval);

  const coreSdk = new CoreSdk(
    leveldb,
    db,
    rollupProvider,
    wasm,
    noteDecryptor,
    pedersen,
    pippenger,
    fftFactory,
    workerPool,
  );
  await coreSdk.init(options);
  return coreSdk;
}
