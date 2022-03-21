import { AccountId } from '@aztec/barretenberg/account_id';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { Note } from '../../note';
import { bigintTransformer, accountIdTransformer } from './transformer';

@Entity({ name: 'note' })
export class NoteDao implements Note {
  @PrimaryColumn()
  public commitment!: Buffer;

  @Column()
  public secret!: Buffer;

  @Index({ unique: true })
  @Column()
  public nullifier!: Buffer;

  @Index({ unique: false })
  @Column()
  public nullified!: boolean;

  @Column('blob', { transformer: [accountIdTransformer] })
  public owner!: AccountId;

  @Column()
  public creatorPubKey!: Buffer;

  @Column()
  public inputNullifier!: Buffer;

  @Column()
  public index!: number;

  @Column()
  public assetId!: number;

  @Column('text', { transformer: [bigintTransformer] })
  public value!: bigint;

  @Column()
  public allowChain!: boolean;

  @Index({ unique: false })
  @Column()
  public pending!: boolean;
}