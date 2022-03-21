import { AccountId, AliasHash } from '@aztec/barretenberg/account_id';
import { EthAddress, GrumpkinAddress } from '@aztec/barretenberg/address';
import { BridgeId } from '@aztec/barretenberg/bridge_id';
import { ProofId } from '@aztec/barretenberg/client_proofs';
import { TxId } from '@aztec/barretenberg/tx_id';
import Dexie from 'dexie';
import { CoreAccountTx, CoreClaimTx, CoreDefiTx, CorePaymentTx } from '../core_tx';
import { Note } from '../note';
import { UserData } from '../user';
import { Alias, Database, SigningKey } from './database';

const MAX_BYTE_LENGTH = 100000000;

const toSubKeyName = (name: string, index: number) => `${name}__${index}`;

class DexieNote {
  constructor(
    public assetId: number,
    public value: string,
    public commitment: Uint8Array,
    public secret: Uint8Array,
    public nullifier: Uint8Array,
    public nullified: 0 | 1,
    public owner: Uint8Array,
    public creatorPubKey: Uint8Array,
    public inputNullifier: Uint8Array,
    public index: number,
    public allowChain: boolean,
    public pending: 0 | 1,
  ) {}
}

const noteToDexieNote = (note: Note) =>
  new DexieNote(
    note.assetId,
    note.value.toString(),
    note.commitment,
    note.secret,
    note.nullifier,
    note.nullified ? 1 : 0,
    new Uint8Array(note.owner.toBuffer()),
    new Uint8Array(note.creatorPubKey),
    new Uint8Array(note.inputNullifier),
    note.index,
    note.allowChain,
    note.pending ? 1 : 0,
  );

const dexieNoteToNote = ({
  value,
  commitment,
  secret,
  nullifier,
  nullified,
  owner,
  creatorPubKey,
  inputNullifier,
  pending,
  ...rest
}: DexieNote): Note => ({
  ...rest,
  value: BigInt(value),
  commitment: Buffer.from(commitment),
  secret: Buffer.from(secret),
  nullifier: Buffer.from(nullifier),
  nullified: !!nullified,
  owner: AccountId.fromBuffer(Buffer.from(owner)),
  creatorPubKey: Buffer.from(creatorPubKey),
  inputNullifier: Buffer.from(inputNullifier),
  pending: !!pending,
});

class DexieKey {
  constructor(public name: string, public value: Uint8Array, public size: number, public count?: number) {}
}

class DexieUser {
  constructor(
    public id: Uint8Array,
    public privateKey: Uint8Array,
    public syncedToRollup: number,
    public aliasHash?: Uint8Array,
  ) {}
}

const userToDexieUser = ({ id, privateKey, aliasHash, syncedToRollup }: UserData) =>
  new DexieUser(
    new Uint8Array(id.toBuffer()),
    new Uint8Array(privateKey),
    syncedToRollup,
    aliasHash ? new Uint8Array(aliasHash.toBuffer()) : undefined,
  );

const dexieUserToUser = (user: DexieUser): UserData => {
  const id = AccountId.fromBuffer(Buffer.from(user.id));
  return {
    id,
    publicKey: id.publicKey,
    nonce: id.accountNonce,
    privateKey: Buffer.from(user.privateKey),
    syncedToRollup: user.syncedToRollup,
    aliasHash: user.aliasHash ? new AliasHash(Buffer.from(user.aliasHash)) : undefined,
  };
};

class DexieUserTx {
  constructor(
    public txId: Uint8Array,
    public userId: Uint8Array,
    public proofId: number,
    public created: Date,
    public settled: number,
  ) {}
}

class DexiePaymentTx implements DexieUserTx {
  constructor(
    public txId: Uint8Array,
    public userId: Uint8Array,
    public proofId: number,
    public assetId: number,
    public publicValue: string,
    public privateInput: string,
    public recipientPrivateOutput: string,
    public senderPrivateOutput: string,
    public isRecipient: boolean,
    public isSender: boolean,
    public txRefNo: number,
    public created: Date,
    public settled: number, // dexie does not sort a column correctly if some values are undefined
    public publicOwner?: Uint8Array,
  ) {}
}

const toDexiePaymentTx = (tx: CorePaymentTx) =>
  new DexiePaymentTx(
    new Uint8Array(tx.txId.toBuffer()),
    new Uint8Array(tx.userId.toBuffer()),
    tx.proofId,
    tx.assetId,
    tx.publicValue.toString(),
    tx.privateInput.toString(),
    tx.recipientPrivateOutput.toString(),
    tx.senderPrivateOutput.toString(),
    tx.isRecipient,
    tx.isSender,
    tx.txRefNo,
    tx.created,
    tx.settled ? tx.settled.getTime() : 0,
    tx.publicOwner ? new Uint8Array(tx.publicOwner.toBuffer()) : undefined,
  );

const fromDexiePaymentTx = ({
  txId,
  userId,
  proofId,
  assetId,
  publicValue,
  publicOwner,
  privateInput,
  recipientPrivateOutput,
  senderPrivateOutput,
  isRecipient,
  isSender,
  txRefNo,
  created,
  settled,
}: DexiePaymentTx) =>
  new CorePaymentTx(
    new TxId(Buffer.from(txId)),
    AccountId.fromBuffer(Buffer.from(userId)),
    proofId,
    assetId,
    BigInt(publicValue),
    publicOwner ? new EthAddress(Buffer.from(publicOwner)) : undefined,
    BigInt(privateInput),
    BigInt(recipientPrivateOutput),
    BigInt(senderPrivateOutput),
    isRecipient,
    isSender,
    txRefNo,
    created,
    settled ? new Date(settled) : undefined,
  );

class DexieAccountTx implements DexieUserTx {
  constructor(
    public txId: Uint8Array,
    public userId: Uint8Array,
    public proofId: number,
    public aliasHash: Uint8Array,
    public migrated: boolean,
    public txRefNo: number,
    public created: Date,
    public settled: number,
    public newSigningPubKey1?: Uint8Array,
    public newSigningPubKey2?: Uint8Array,
  ) {}
}

const toDexieAccountTx = (tx: CoreAccountTx) =>
  new DexieAccountTx(
    new Uint8Array(tx.txId.toBuffer()),
    new Uint8Array(tx.userId.toBuffer()),
    ProofId.ACCOUNT,
    new Uint8Array(tx.aliasHash.toBuffer()),
    tx.migrated,
    tx.txRefNo,
    tx.created,
    tx.settled ? tx.settled.getTime() : 0,
    tx.newSigningPubKey1 ? new Uint8Array(tx.newSigningPubKey1) : undefined,
    tx.newSigningPubKey2 ? new Uint8Array(tx.newSigningPubKey2) : undefined,
  );

const fromDexieAccountTx = ({
  txId,
  userId,
  aliasHash,
  newSigningPubKey1,
  newSigningPubKey2,
  migrated,
  txRefNo,
  created,
  settled,
}: DexieAccountTx) =>
  new CoreAccountTx(
    new TxId(Buffer.from(txId)),
    AccountId.fromBuffer(Buffer.from(userId)),
    new AliasHash(Buffer.from(aliasHash)),
    newSigningPubKey1 ? Buffer.from(newSigningPubKey1) : undefined,
    newSigningPubKey2 ? Buffer.from(newSigningPubKey2) : undefined,
    migrated,
    txRefNo,
    created,
    settled ? new Date(settled) : undefined,
  );

class DexieDefiTx implements DexieUserTx {
  constructor(
    public txId: Uint8Array,
    public userId: Uint8Array,
    public proofId: number,
    public bridgeId: Uint8Array,
    public depositValue: string,
    public txFee: string,
    public partialStateSecret: Uint8Array,
    public outputValueA: string,
    public outputValueB: string,
    public txRefNo: number,
    public created: Date,
    public result: boolean | undefined,
    public settled: number,
    public interactionNonce?: number
  ) {}
}

const toDexieDefiTx = (tx: CoreDefiTx) =>
  new DexieDefiTx(
    new Uint8Array(tx.txId.toBuffer()),
    new Uint8Array(tx.userId.toBuffer()),
    ProofId.DEFI_DEPOSIT,
    new Uint8Array(tx.bridgeId.toBuffer()),
    tx.depositValue.toString(),
    tx.txFee.toString(),
    new Uint8Array(tx.partialStateSecret),
    tx.outputValueA.toString(),
    tx.outputValueB.toString(),
    tx.txRefNo,
    tx.created,
    tx.result,
    tx.settled ? tx.settled.getTime() : 0,
    tx.interactionNonce
  );

const fromDexieDefiTx = ({
  txId,
  userId,
  bridgeId,
  depositValue,
  txFee,
  partialStateSecret,
  outputValueA,
  outputValueB,
  txRefNo,
  created,
  result,
  settled,
  interactionNonce,
}: DexieDefiTx) =>
  new CoreDefiTx(
    new TxId(Buffer.from(txId)),
    AccountId.fromBuffer(Buffer.from(userId)),
    BridgeId.fromBuffer(Buffer.from(bridgeId)),
    BigInt(depositValue),
    BigInt(txFee),
    Buffer.from(partialStateSecret),
    txRefNo,
    created,
    BigInt(outputValueA),
    BigInt(outputValueB),
    result,
    settled ? new Date(settled) : undefined,
    interactionNonce
  );

class DexieClaimTx {
  constructor(
    public nullifier: Uint8Array,
    public txId: Uint8Array,
    public userId: Uint8Array,
    public secret: Uint8Array,
  ) {}
}

const toDexieClaimTx = (claim: CoreClaimTx) =>
  new DexieClaimTx(
    new Uint8Array(claim.nullifier),
    new Uint8Array(claim.txId.toBuffer()),
    new Uint8Array(claim.userId.toBuffer()),
    new Uint8Array(claim.secret),
  );

const fromDexieClaimTx = ({ nullifier, txId, userId, secret }: DexieClaimTx): CoreClaimTx => ({
  nullifier: Buffer.from(nullifier),
  txId: new TxId(Buffer.from(txId)),
  userId: AccountId.fromBuffer(Buffer.from(userId)),
  secret: Buffer.from(secret),
});

class DexieUserKey {
  constructor(public accountId: Uint8Array, public key: Uint8Array, public treeIndex: number) {}
}

const dexieUserKeyToSigningKey = (userKey: DexieUserKey): SigningKey => ({
  ...userKey,
  accountId: AccountId.fromBuffer(Buffer.from(userKey.accountId)),
  key: Buffer.from(userKey.key),
});

class DexieAlias {
  constructor(public aliasHash: Uint8Array, public address: Uint8Array, public latestNonce: number) {}
}

const dexieAliasToAlias = ({ aliasHash, address, latestNonce }: DexieAlias): Alias => ({
  aliasHash: new AliasHash(Buffer.from(aliasHash)),
  address: new GrumpkinAddress(Buffer.from(address)),
  latestNonce,
});

const sortUserTxs = (txs: DexieUserTx[]) => {
  const unsettled = txs.filter(tx => !tx.settled).sort((a, b) => (a.created < b.created ? 1 : -1));
  const settled = txs.filter(tx => tx.settled);
  return [...unsettled, ...settled];
};

export class DexieDatabase implements Database {
  private dexie!: Dexie;
  private user!: Dexie.Table<DexieUser, number>;
  private userKeys!: Dexie.Table<DexieUserKey, string>;
  private userTx!: Dexie.Table<DexieUserTx, string>;
  private note!: Dexie.Table<DexieNote, number>;
  private claimTx!: Dexie.Table<DexieClaimTx, number>;
  private key!: Dexie.Table<DexieKey, string>;
  private alias!: Dexie.Table<DexieAlias, number>;

  constructor(private dbName = 'hummus', private version = 6) {}

  async init() {
    this.createTables();

    try {
      // Try to do something with indexedDB.
      // If it fails (with UpgradeError), then the schema has changed significantly that we need to recreate the entire db.
      await this.getUsers();
    } catch (e) {
      await this.dexie.delete();
      this.createTables();
    }
  }

  private createTables() {
    this.dexie = new Dexie(this.dbName);
    this.dexie.version(this.version).stores({
      alias: '&[aliasHash+address], aliasHash, address, latestNonce',
      claimTx: '&nullifier',
      key: '&name',
      note: '++commitment, [owner+nullified], [owner+pending], nullifier, owner',
      user: '&id',
      userKeys: '&[accountId+key], accountId',
      userTx:
        '&[txId+userId], txId, [txId+proofId], [userId+proofId], proofId, settled, [userId+proofId+interactionNonce]',
    });

    this.alias = this.dexie.table('alias');
    this.key = this.dexie.table('key');
    this.note = this.dexie.table('note');
    this.user = this.dexie.table('user');
    this.userKeys = this.dexie.table('userKeys');
    this.userTx = this.dexie.table('userTx');
    this.claimTx = this.dexie.table('claimTx');
  }

  async close() {
    await this.dexie.close();
  }

  async clear() {
    for (const table of this.dexie.tables) {
      await table.clear();
    }
  }

  async addNote(note: Note) {
    await this.note.put(noteToDexieNote(note));
  }

  async getNote(commitment: Buffer) {
    const note = await this.note.get({ commitment: new Uint8Array(commitment) });
    return note ? dexieNoteToNote(note) : undefined;
  }

  async getNoteByNullifier(nullifier: Buffer) {
    const note = await this.note.get({ nullifier: new Uint8Array(nullifier) });
    return note ? dexieNoteToNote(note) : undefined;
  }

  async nullifyNote(nullifier: Buffer) {
    await this.note.where({ nullifier: new Uint8Array(nullifier) }).modify({ nullified: 1 });
  }

  async addClaimTx(tx: CoreClaimTx) {
    await this.claimTx.put(toDexieClaimTx(tx));
  }

  async getClaimTx(nullifier: Buffer) {
    const tx = await this.claimTx.get({ nullifier: new Uint8Array(nullifier) });
    return tx ? fromDexieClaimTx(tx) : undefined;
  }

  async getUserNotes(userId: AccountId) {
    return (await this.note.where({ owner: new Uint8Array(userId.toBuffer()), nullified: 0 }).toArray()).map(
      dexieNoteToNote,
    );
  }

  async getUserPendingNotes(userId: AccountId) {
    return (await this.note.where({ owner: new Uint8Array(userId.toBuffer()), pending: 1 }).toArray()).map(
      dexieNoteToNote,
    );
  }

  async removeNote(nullifier: Buffer) {
    await this.note.where({ nullifier: new Uint8Array(nullifier) }).delete();
  }

  async getUser(userId: AccountId) {
    const user = await this.user.get(new Uint8Array(userId.toBuffer()));
    return user ? dexieUserToUser(user) : undefined;
  }

  async getUsers() {
    return (await this.user.toArray()).map(dexieUserToUser);
  }

  async addUser(user: UserData) {
    await this.user.put(userToDexieUser(user));
  }

  async updateUser(user: UserData) {
    await this.user.where({ id: new Uint8Array(user.id.toBuffer()) }).modify(userToDexieUser(user));
  }

  async addPaymentTx(tx: CorePaymentTx) {
    await this.userTx.put(toDexiePaymentTx(tx));
  }

  async getPaymentTx(txId: TxId, userId: AccountId) {
    const tx = await this.userTx.get({
      txId: new Uint8Array(txId.toBuffer()),
      userId: new Uint8Array(userId.toBuffer()),
    });
    return tx && [ProofId.DEPOSIT, ProofId.WITHDRAW, ProofId.SEND].includes(tx.proofId)
      ? fromDexiePaymentTx(tx as DexiePaymentTx)
      : undefined;
  }

  async getPaymentTxs(userId: AccountId) {
    const txs = (
      await this.userTx
        .where({ userId: new Uint8Array(userId.toBuffer()) })
        .reverse()
        .sortBy('settled')
    ).filter(p => [ProofId.DEPOSIT, ProofId.WITHDRAW, ProofId.SEND].includes(p.proofId));
    return (sortUserTxs(txs) as DexiePaymentTx[]).map(fromDexiePaymentTx);
  }

  async settlePaymentTx(txId: TxId, userId: AccountId, settled: Date) {
    await this.userTx
      .where({
        txId: new Uint8Array(txId.toBuffer()),
        userId: new Uint8Array(userId.toBuffer()),
      })
      .modify({ settled });
  }

  async addAccountTx(tx: CoreAccountTx) {
    await this.userTx.put(toDexieAccountTx(tx));
  }

  async getAccountTx(txId: TxId) {
    const tx = await this.userTx.get({
      txId: new Uint8Array(txId.toBuffer()),
      proofId: ProofId.ACCOUNT,
    });
    return tx ? fromDexieAccountTx(tx as DexieAccountTx) : undefined;
  }

  async getAccountTxs(userId: AccountId) {
    const txs = await this.userTx
      .where({ userId: new Uint8Array(userId.toBuffer()), proofId: ProofId.ACCOUNT })
      .reverse()
      .sortBy('settled');
    return (sortUserTxs(txs) as DexieAccountTx[]).map(fromDexieAccountTx);
  }

  async settleAccountTx(txId: TxId, settled: Date) {
    await this.userTx.where({ txId: new Uint8Array(txId.toBuffer()), proofId: ProofId.ACCOUNT }).modify({ settled });
  }

  async addDefiTx(tx: CoreDefiTx) {
    await this.userTx.put(toDexieDefiTx(tx));
  }

  async getDefiTx(txId: TxId) {
    const tx = await this.userTx.get({
      txId: new Uint8Array(txId.toBuffer()),
      proofId: ProofId.DEFI_DEPOSIT,
    });
    return tx ? fromDexieDefiTx(tx as DexieDefiTx) : undefined;
  }

  async getDefiTxs(userId: AccountId) {
    const txs = await this.userTx
      .where({ userId: new Uint8Array(userId.toBuffer()), proofId: ProofId.DEFI_DEPOSIT })
      .reverse()
      .sortBy('settled');
    return (sortUserTxs(txs) as DexieDefiTx[]).map(fromDexieDefiTx);
  }

  async getDefiTxsByNonce(userId: AccountId, interactionNonce: number) {
    const txs = (await this.userTx
      .where({ userId: new Uint8Array(userId.toBuffer()), proofId: ProofId.DEFI_DEPOSIT, interactionNonce })
      .reverse()
      .sortBy('settled')) as DexieDefiTx[];
      return (sortUserTxs(txs) as DexieDefiTx[]).map(fromDexieDefiTx);
  }

  async updateDefiTxWithNonce(txId: TxId, interactionNonce: number): Promise<void> {
    await this.userTx
      .where({ txId: new Uint8Array(txId.toBuffer()), proofId: ProofId.DEFI_DEPOSIT })
      .modify({ interactionNonce });
  }

  async updateDefiTx(txId: TxId, outputValueA: bigint, outputValueB: bigint, result: boolean) {
    await this.userTx
      .where({ txId: new Uint8Array(txId.toBuffer()), proofId: ProofId.DEFI_DEPOSIT })
      .modify({ outputValueA, outputValueB, result });
  }

  async settleDefiTx(txId: TxId, settled: Date) {
    await this.userTx
      .where({ txId: new Uint8Array(txId.toBuffer()), proofId: ProofId.DEFI_DEPOSIT })
      .modify({ settled });
  }

  async getUserTxs(userId: AccountId) {
    const txs = await this.userTx
      .where({ userId: new Uint8Array(userId.toBuffer()) })
      .reverse()
      .sortBy('settled');
    return sortUserTxs(txs).map(tx => {
      switch (tx.proofId) {
        case ProofId.ACCOUNT:
          return fromDexieAccountTx(tx as DexieAccountTx);
        case ProofId.DEFI_DEPOSIT:
          return fromDexieDefiTx(tx as DexieDefiTx);
        default:
          return fromDexiePaymentTx(tx as DexiePaymentTx);
      }
    });
  }

  async isUserTxSettled(txId: TxId) {
    const txs = await this.userTx.where({ txId: new Uint8Array(txId.toBuffer()) }).toArray();
    return txs.length > 0 && txs.every(tx => tx.settled);
  }

  async getUnsettledUserTxs(userId: AccountId) {
    const unsettledTxs = await this.userTx.where({ settled: 0 }).toArray();
    return unsettledTxs
      .flat()
      .filter(tx => AccountId.fromBuffer(Buffer.from(tx.userId)).equals(userId))
      .map(({ txId }) => new TxId(Buffer.from(txId)));
  }

  async removeUserTx(txId: TxId, userId: AccountId) {
    await this.userTx
      .where({ txId: new Uint8Array(txId.toBuffer()), userId: new Uint8Array(userId.toBuffer()) })
      .delete();
  }

  async removeUser(userId: AccountId) {
    const user = await this.getUser(userId);
    if (!user) return;

    const id = new Uint8Array(userId.toBuffer());
    await this.userTx.where({ userId: id }).delete();
    await this.userKeys.where({ accountId: id }).delete();
    await this.note.where({ owner: id }).delete();
    await this.user.where({ id }).delete();
  }

  async resetUsers() {
    await this.note.clear();
    await this.userTx.clear();
    await this.userKeys.clear();
    await this.alias.clear();
    await this.user.toCollection().modify({ syncedToRollup: -1 });
  }

  async deleteKey(name: string) {
    const key = await this.key.get(name);
    if (!key) {
      return;
    }

    for (let i = 0; i < key.count!; ++i) {
      await this.key.where({ name: toSubKeyName(name, i) }).delete();
    }
    await this.key.where({ name }).delete();
  }

  async addKey(name: string, value: Buffer) {
    const size = value.byteLength;
    if (size <= MAX_BYTE_LENGTH) {
      await this.key.put({ name, value, size });
    } else {
      await this.deleteKey(name);

      const count = Math.ceil(size / MAX_BYTE_LENGTH);
      for (let i = 0; i < count; ++i) {
        const subValue = new Uint8Array(value.buffer.slice(MAX_BYTE_LENGTH * i, MAX_BYTE_LENGTH * (i + 1)));
        await this.key.add({
          name: toSubKeyName(name, i),
          value: subValue,
          size: subValue.byteLength,
        });
      }
      await this.key.add({ name, value: new Uint8Array(), size, count });
    }
  }

  async getKey(name: string) {
    const key = await this.key.get(name);
    if (!key || !key.size) {
      return undefined;
    }

    if (!key.count) {
      return Buffer.from(key.value);
    }

    const subKeyNames = [...Array(key.count)].map((_, i) => toSubKeyName(name, i));
    const subKeys = await this.key.bulkGet(subKeyNames);
    if (subKeys.some(k => !k)) {
      return undefined;
    }

    const value = Buffer.alloc(key.size);
    let prevSize = 0;
    for (let i = 0; i < key.count; ++i) {
      value.set(subKeys[i]!.value, prevSize);
      prevSize += subKeys[i]!.value.byteLength;
    }

    return value;
  }

  async addUserSigningKey({ accountId, key, treeIndex }: SigningKey) {
    await this.userKeys.put(new DexieUserKey(new Uint8Array(accountId.toBuffer()), new Uint8Array(key), treeIndex));
  }

  async addUserSigningKeys(signingKeys: SigningKey[]) {
    const dbKeys = signingKeys.map(
      key => new DexieUserKey(new Uint8Array(key.accountId.toBuffer()), new Uint8Array(key.key), key.treeIndex),
    );
    await this.userKeys.bulkPut(dbKeys);
  }

  async getUserSigningKeys(accountId: AccountId) {
    const userKeys = await this.userKeys.where({ accountId: new Uint8Array(accountId.toBuffer()) }).toArray();
    return userKeys.map(dexieUserKeyToSigningKey);
  }

  async getUserSigningKeyIndex(accountId: AccountId, signingKey: GrumpkinAddress) {
    const userKey = await this.userKeys.get({
      accountId: new Uint8Array(accountId.toBuffer()),
      key: new Uint8Array(signingKey.toBuffer().slice(0, 32)),
    });
    return userKey ? userKey.treeIndex : undefined;
  }

  async removeUserSigningKeys(accountId: AccountId) {
    await this.userKeys.where({ accountId: new Uint8Array(accountId.toBuffer()) }).delete();
  }

  async setAlias(alias: Alias) {
    return this.setAliases([alias]);
  }

  async setAliases(aliases: Alias[]) {
    const dbAliases = aliases.map(
      ({ aliasHash, address, latestNonce }) =>
        new DexieAlias(new Uint8Array(aliasHash.toBuffer()), new Uint8Array(address.toBuffer()), latestNonce),
    );
    await this.alias.bulkPut(dbAliases);
  }

  async getAlias(aliasHash: AliasHash, address: GrumpkinAddress) {
    const alias = await this.alias.get({
      aliasHash: new Uint8Array(aliasHash.toBuffer()),
      address: new Uint8Array(address.toBuffer()),
    });
    return alias ? dexieAliasToAlias(alias) : undefined;
  }

  async getAliases(aliasHash: AliasHash) {
    const aliases = await this.alias.where({ aliasHash: new Uint8Array(aliasHash.toBuffer()) }).toArray();
    return aliases.map(alias => dexieAliasToAlias(alias));
  }

  async getLatestNonceByAddress(address: GrumpkinAddress) {
    const aliases = await this.alias
      .where({
        address: new Uint8Array(address.toBuffer()),
      })
      .reverse()
      .sortBy('latestNonce');
    return aliases[0]?.latestNonce;
  }

  async getLatestNonceByAliasHash(aliasHash: AliasHash) {
    const aliases = await this.alias
      .where({
        aliasHash: new Uint8Array(aliasHash.toBuffer()),
      })
      .reverse()
      .sortBy('latestNonce');
    return aliases[0]?.latestNonce;
  }

  async getAliasHashByAddress(address: GrumpkinAddress, nonce?: number) {
    const collection = this.alias
      .where({
        address: new Uint8Array(address.toBuffer()),
      })
      .filter(a => nonce === undefined || a.latestNonce >= nonce);
    if (nonce === undefined) {
      collection.reverse();
    }
    const aliases = await collection.sortBy('latestNonce');
    return aliases.length ? new AliasHash(Buffer.from(aliases[0].aliasHash)) : undefined;
  }

  async getAccountId(aliasHash: AliasHash, nonce?: number) {
    const collection = this.alias
      .where({
        aliasHash: new Uint8Array(aliasHash.toBuffer()),
      })
      .filter(a => nonce === undefined || a.latestNonce >= nonce);
    if (nonce === undefined) {
      collection.reverse();
    }
    const [alias] = await collection.sortBy('latestNonce');
    return alias
      ? new AccountId(new GrumpkinAddress(Buffer.from(alias.address)), nonce ?? alias.latestNonce)
      : undefined;
  }
}