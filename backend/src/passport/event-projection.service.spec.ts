import { ChainReaderService } from '../verifier/chain-reader.service';
import { DatabaseService } from '../database/database.service';
import { EventProjectionService } from './event-projection.service';

describe('EventProjectionService', () => {
  let db: DatabaseService;
  let chainReader: ChainReaderService;
  let service: EventProjectionService;

  const treasuryId = '00000001.registry.nivry.testnet';
  const registryId = 'registry.nivry.testnet';

  beforeAll(() => {
    process.env.REGISTRY_CONTRACT_ID = registryId;
    db = new DatabaseService();
    chainReader = new ChainReaderService();
    service = new EventProjectionService(db, chainReader);
  });

  beforeEach(async () => {
    await db.resetForTests();
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it('ingests NEP-297 events idempotently without duplicating on replay', async () => {
    const eventInput = {
      tokenId: '1',
      treasuryAccountId: treasuryId,
      blockHeight: 500,
      blockTimestampNs: '1700000000000000000',
      transactionHash: 'tx-abc',
      event: {
        receipt_id: 'rec-100',
        executor_id: treasuryId,
        block_hash: 'blk-100',
        log_index: 0,
        standard: 'nivry',
        version: '1.0.0',
        event: 'payment_recorded',
        data: {
          payer: 'customer.testnet',
          amount_yocto: '2500000000000000000000000',
          payment_reference_hash: 'b'.repeat(64),
          observed_authority_epoch: 1,
        },
      },
    };

    const first = await service.ingestNep297Event(eventInput);
    const replay = await service.ingestNep297Event(eventInput);

    expect(first.outcome).toBe('inserted');
    expect(replay.outcome).toBe('duplicate');
    expect(await db.listEventsForToken('1')).toHaveLength(1);
  });

  it('rejects foreign emitters, wrong standards, mismatched token_id, and incomplete operation payloads', async () => {
    const foreignEmitter = await service.ingestNep297Event({
      tokenId: '1',
      treasuryAccountId: treasuryId,
      blockHeight: 10,
      blockTimestampNs: '100',
      transactionHash: 'tx-spoof',
      event: {
        receipt_id: 'rec-spoof-1',
        executor_id: 'attacker.testnet',
        block_hash: 'b1',
        log_index: 0,
        standard: 'nivry',
        version: '1.0.0',
        event: 'payment_recorded',
        data: {
          payer: 'attacker.testnet',
          amount_yocto: '9999999999999999999999999',
          observed_authority_epoch: 1,
        },
      },
    });
    expect(foreignEmitter).toEqual({
      outcome: 'rejected',
      reason: 'foreign_emitter:attacker.testnet',
    });

    const wrongToken = await service.ingestNep297Event({
      tokenId: '1',
      treasuryAccountId: treasuryId,
      blockHeight: 11,
      blockTimestampNs: '110',
      transactionHash: 'tx-other',
      event: {
        receipt_id: 'rec-other',
        executor_id: registryId,
        block_hash: 'b2',
        log_index: 0,
        standard: 'nivry',
        version: '1.0.0',
        event: 'ownership_changed',
        data: {
          token_id: '2',
          from: 'alice.testnet',
          to: 'bob.testnet',
          authority_epoch: 2,
        },
      },
    });
    expect(wrongToken).toEqual({
      outcome: 'rejected',
      reason: 'event_for_other_token',
    });

    const incompleteOp = await service.ingestNep297Event({
      tokenId: '1',
      treasuryAccountId: treasuryId,
      blockHeight: 12,
      blockTimestampNs: '120',
      transactionHash: 'tx-incomplete',
      event: {
        receipt_id: 'rec-incomplete',
        executor_id: registryId,
        block_hash: 'b3',
        log_index: 0,
        standard: 'nivry',
        version: '1.0.0',
        event: 'dispatch_scheduled',
        data: {
          token_id: '1',
          operation_id: 'op-missing-fields',
        },
      },
    });
    expect(incompleteOp).toEqual({
      outcome: 'rejected',
      reason: 'incomplete_dispatch_scheduled',
    });

    expect(await db.listEventsForToken('1')).toHaveLength(0);
  });

  it('separates plain owner deposits from customer service payments and attributes history by authority_epoch', async () => {
    // Epoch 1: Owner deposit + Customer service payment + Executor payout (scheduled + settled)
    await service.ingestNep297Event({
      tokenId: '1',
      treasuryAccountId: treasuryId,
      blockHeight: 10,
      blockTimestampNs: '100',
      transactionHash: 'tx-1',
      event: {
        receipt_id: 'rec-1',
        executor_id: treasuryId,
        block_hash: 'b1',
        log_index: 0,
        standard: 'nivry',
        version: '1.0.0',
        event: 'deposit_received',
        data: {
          payer: 'seller.testnet',
          amount_yocto: '5000000000000000000000000',
        },
      },
    });

    await service.ingestNep297Event({
      tokenId: '1',
      treasuryAccountId: treasuryId,
      blockHeight: 11,
      blockTimestampNs: '110',
      transactionHash: 'tx-2',
      event: {
        receipt_id: 'rec-2',
        executor_id: treasuryId,
        block_hash: 'b2',
        log_index: 0,
        standard: 'nivry',
        version: '1.0.0',
        event: 'payment_recorded',
        data: {
          payer: 'customer.testnet',
          amount_yocto: '1000000000000000000000000',
          observed_authority_epoch: 1,
        },
      },
    });

    await service.ingestNep297Event({
      tokenId: '1',
      treasuryAccountId: treasuryId,
      pendingOperation: {
        operation_id: 'op-1',
        nonce: 1,
        kind: 'executor_payment',
        recipient: 'vendor.testnet',
        amount_yocto: '200000000000000000000000',
        epoch: 1,
      },
      blockHeight: 12,
      blockTimestampNs: '120',
      transactionHash: 'tx-3',
      event: {
        receipt_id: 'rec-3a',
        executor_id: registryId,
        block_hash: 'b3',
        log_index: 0,
        standard: 'nivry',
        version: '1.0.0',
        event: 'dispatch_scheduled',
        data: {
          token_id: '1',
          operation_id: 'op-1',
          nonce: 1,
          authority_epoch: 1,
          recipient: 'vendor.testnet',
          amount_yocto: '200000000000000000000000',
        },
      },
    });

    await service.ingestNep297Event({
      tokenId: '1',
      treasuryAccountId: treasuryId,
      blockHeight: 13,
      blockTimestampNs: '130',
      transactionHash: 'tx-3',
      event: {
        receipt_id: 'rec-3b',
        executor_id: registryId,
        block_hash: 'b3',
        log_index: 1,
        standard: 'nivry',
        version: '1.0.0',
        event: 'dispatch_settled',
        data: {
          token_id: '1',
          operation_id: 'op-1',
          status: 'succeeded',
          recipient: 'vendor.testnet',
          amount_yocto: '200000000000000000000000',
        },
      },
    });

    // Epoch 2 (after ownership transfer to buyer.testnet)
    await service.ingestNep297Event({
      tokenId: '1',
      treasuryAccountId: treasuryId,
      pendingOperation: {
        operation_id: 'op-2',
        nonce: 2,
        kind: 'executor_payment',
        recipient: 'vendor2.testnet',
        amount_yocto: '300000000000000000000000',
        epoch: 2,
      },
      blockHeight: 20,
      blockTimestampNs: '200',
      transactionHash: 'tx-4',
      event: {
        receipt_id: 'rec-4a',
        executor_id: registryId,
        block_hash: 'b4',
        log_index: 0,
        standard: 'nivry',
        version: '1.0.0',
        event: 'dispatch_scheduled',
        data: {
          token_id: '1',
          operation_id: 'op-2',
          nonce: 2,
          authority_epoch: 2,
          recipient: 'vendor2.testnet',
          amount_yocto: '300000000000000000000000',
        },
      },
    });

    await service.ingestNep297Event({
      tokenId: '1',
      treasuryAccountId: treasuryId,
      blockHeight: 21,
      blockTimestampNs: '210',
      transactionHash: 'tx-4',
      event: {
        receipt_id: 'rec-4b',
        executor_id: registryId,
        block_hash: 'b4',
        log_index: 1,
        standard: 'nivry',
        version: '1.0.0',
        event: 'dispatch_settled',
        data: {
          token_id: '1',
          operation_id: 'op-2',
          status: 'succeeded',
          recipient: 'vendor2.testnet',
          amount_yocto: '300000000000000000000000',
        },
      },
    });

    jest.spyOn(chainReader, 'getAgentInfo').mockResolvedValue({
      token_id: '1',
      owner_id: 'buyer.testnet',
      treasury_account_id: treasuryId,
      authority_epoch: 2,
      ownership_change_count: 1,
      lifecycle: 'ready',
      frozen: false,
      executor_grant: null,
      next_command_nonce: 3,
      pending_operation: null,
      manifest: {
        schema_version: '1',
        name: 'Docs Reporter',
        description: 'Produces a repository documentation report.',
        runtime_hint: 'hermes',
        bundle_sha256: 'a'.repeat(64),
        task_kind: 'docs_report_v1',
        manifest_uri: 'https://example.invalid/bundles/docs-reporter.tar.gz',
      },
      manifest_hash:
        '047e40193f92744a8b439ce91b8fb58bbb4a0de8f76d6e33513b864430235763',
    });

    jest.spyOn(chainReader, 'getTreasuryInfo').mockResolvedValue({
      registry: registryId,
      token_id: '1',
      balance_yocto: '5500000000000000000000000',
      storage_reserve_yocto: '100000000000000000000000',
      spendable_yocto: '5400000000000000000000000',
      pending: false,
      next_sequence: 3,
      last_operation: null,
      recorded_payment_count: 1,
      recorded_payment_amount_yocto: '1000000000000000000000000',
    });

    jest.spyOn(chainReader, 'verifyAccountLockState').mockResolvedValue({
      account_id: treasuryId,
      amount_yocto: '5500000000000000000000000',
      storage_usage: 28000,
      code_hash:
        'ce3b675e2b3d9ab5a11d8840f0e1cd48471438f6a418ddc3bafce21fca4d8e5e',
      key_count: 0,
      is_keyless: true,
      verification_label: 'locked_release',
    });

    const passport = await service.getAgentPassport('1');
    expect(passport.agent.owner_id).toBe('buyer.testnet');
    expect(passport.agent.authority_epoch).toBe(2);
    expect(passport.totals.recorded_service_payment_count).toBe(1);
    expect(passport.totals.recorded_service_payment_amount_yocto).toBe(
      '1000000000000000000000000',
    );
    expect(passport.totals.owner_deposit_count).toBe(1);
    expect(passport.totals.owner_deposit_amount_yocto).toBe(
      '5000000000000000000000000',
    );

    expect(passport.history_by_epoch).toHaveLength(2);
    expect(passport.history_by_epoch[0].authority_epoch).toBe(1);
    expect(passport.history_by_epoch[0].service_payments).toHaveLength(1);
    expect(passport.history_by_epoch[0].owner_deposits).toHaveLength(1);
    expect(passport.history_by_epoch[0].outbound_operations).toHaveLength(1);
    expect(passport.history_by_epoch[0].outbound_operations[0].status).toBe(
      'succeeded',
    );

    expect(passport.history_by_epoch[1].authority_epoch).toBe(2);
    expect(passport.history_by_epoch[1].outbound_operations).toHaveLength(1);
    expect(passport.history_by_epoch[1].outbound_operations[0].recipient).toBe(
      'vendor2.testnet',
    );
    expect(passport.history_by_epoch[1].outbound_operations[0].status).toBe(
      'succeeded',
    );
  });
});
