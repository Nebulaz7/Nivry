import { ChainReaderService } from '../verifier/chain-reader.service';
import { DatabaseService } from '../database/database.service';
import { EventProjectionService } from './event-projection.service';

describe('EventProjectionService', () => {
  let db: DatabaseService;
  let chainReader: ChainReaderService;
  let service: EventProjectionService;

  beforeEach(() => {
    db = new DatabaseService();
    chainReader = new ChainReaderService();
    service = new EventProjectionService(db, chainReader);
  });

  it('ingests NEP-297 events idempotently without duplicating on replay', () => {
    const eventInput = {
      tokenId: '1',
      blockHeight: 500,
      blockTimestampNs: '1700000000000000000',
      transactionHash: 'tx-abc',
      event: {
        receipt_id: 'rec-100',
        executor_id: '00000001.registry.nivry.testnet',
        block_hash: 'blk-100',
        log_index: 0,
        standard: 'nivry',
        version: '1.0.0',
        event: 'payment_received',
        data: {
          payer: 'customer.testnet',
          amount_yocto: '2500000000000000000000000',
          payment_reference_hash: 'b'.repeat(64),
          observed_authority_epoch: 1,
        },
      },
    };

    const first = service.ingestNep297Event(eventInput);
    const replay = service.ingestNep297Event(eventInput);

    expect(first.inserted).toBe(true);
    expect(replay.inserted).toBe(false);
    expect(db.listEventsForToken('1')).toHaveLength(1);
  });

  it('separates plain owner deposits from customer service payments and attributes history by authority_epoch', async () => {
    // Epoch 1: Owner deposit + Customer service payment + Executor payout
    service.ingestNep297Event({
      tokenId: '1',
      blockHeight: 10,
      blockTimestampNs: '100',
      transactionHash: 'tx-1',
      event: {
        receipt_id: 'rec-1',
        executor_id: '00000001.registry.nivry.testnet',
        block_hash: 'b1',
        log_index: 0,
        standard: 'nivry',
        version: '1.0.0',
        event: 'deposit_received',
        data: {
          payer: 'seller.testnet',
          amount_yocto: '5000000000000000000000000',
          authority_epoch: 1,
        },
      },
    });

    service.ingestNep297Event({
      tokenId: '1',
      blockHeight: 11,
      blockTimestampNs: '110',
      transactionHash: 'tx-2',
      event: {
        receipt_id: 'rec-2',
        executor_id: '00000001.registry.nivry.testnet',
        block_hash: 'b2',
        log_index: 0,
        standard: 'nivry',
        version: '1.0.0',
        event: 'payment_received',
        data: {
          payer: 'customer.testnet',
          amount_yocto: '1000000000000000000000000',
          observed_authority_epoch: 1,
        },
      },
    });

    service.ingestNep297Event({
      tokenId: '1',
      blockHeight: 12,
      blockTimestampNs: '120',
      transactionHash: 'tx-3',
      event: {
        receipt_id: 'rec-3',
        executor_id: 'registry.nivry.testnet',
        block_hash: 'b3',
        log_index: 0,
        standard: 'nivry',
        version: '1.0.0',
        event: 'dispatch_settled',
        data: {
          operation_id: 'op-1',
          sequence: 1,
          authority_epoch: 1,
          kind: 'executor_payment',
          recipient: 'vendor.testnet',
          amount_yocto: '200000000000000000000000',
          status: 'succeeded',
        },
      },
    });

    // Epoch 2 (after ownership transfer to buyer.testnet)
    service.ingestNep297Event({
      tokenId: '1',
      blockHeight: 20,
      blockTimestampNs: '200',
      transactionHash: 'tx-4',
      event: {
        receipt_id: 'rec-4',
        executor_id: 'registry.nivry.testnet',
        block_hash: 'b4',
        log_index: 0,
        standard: 'nivry',
        version: '1.0.0',
        event: 'dispatch_settled',
        data: {
          operation_id: 'op-2',
          sequence: 2,
          authority_epoch: 2,
          kind: 'executor_payment',
          recipient: 'vendor2.testnet',
          amount_yocto: '300000000000000000000000',
          status: 'succeeded',
        },
      },
    });

    jest.spyOn(chainReader, 'getAgentInfo').mockResolvedValue({
      token_id: '1',
      owner_id: 'buyer.testnet',
      treasury_account_id: '00000001.registry.nivry.testnet',
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
      manifest_hash: '047e40193f92744a8b439ce91b8fb58bbb4a0de8f76d6e33513b864430235763',
    });

    jest.spyOn(chainReader, 'getTreasuryInfo').mockResolvedValue({
      registry: 'registry.nivry.testnet',
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
      account_id: '00000001.registry.nivry.testnet',
      amount_yocto: '5500000000000000000000000',
      storage_usage: 28000,
      code_hash: 'ce3b675e2b3d9ab5a11d8840f0e1cd48471438f6a418ddc3bafce21fca4d8e5e',
      key_count: 0,
      is_keyless: true,
      verification_label: 'locked_release',
    });

    const passport = await service.getAgentPassport('1');
    expect(passport.agent.owner_id).toBe('buyer.testnet');
    expect(passport.agent.authority_epoch).toBe(2);
    expect(passport.totals.recorded_service_payment_count).toBe(1);
    expect(passport.totals.recorded_service_payment_amount_yocto).toBe('1000000000000000000000000');
    expect(passport.totals.owner_deposit_count).toBe(1);
    expect(passport.totals.owner_deposit_amount_yocto).toBe('5000000000000000000000000');

    expect(passport.history_by_epoch).toHaveLength(2);
    expect(passport.history_by_epoch[0].authority_epoch).toBe(1);
    expect(passport.history_by_epoch[0].service_payments).toHaveLength(1);
    expect(passport.history_by_epoch[0].owner_deposits).toHaveLength(1);
    expect(passport.history_by_epoch[0].outbound_operations).toHaveLength(1);

    expect(passport.history_by_epoch[1].authority_epoch).toBe(2);
    expect(passport.history_by_epoch[1].outbound_operations).toHaveLength(1);
    expect(passport.history_by_epoch[1].outbound_operations[0].recipient).toBe('vendor2.testnet');
  });
});

