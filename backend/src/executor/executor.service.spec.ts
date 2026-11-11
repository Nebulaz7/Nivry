import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EventProjectionService } from '../passport/event-projection.service';
import {
  ChainReaderService,
  type AgentInfoView,
} from '../verifier/chain-reader.service';
import { ExecutorService } from './executor.service';

describe('ExecutorService', () => {
  let db: DatabaseService;
  let chainReader: ChainReaderService;
  let projectionService: EventProjectionService;
  let executorService: ExecutorService;

  const registryId = 'registry.nivry.testnet';
  const treasuryId = '00000001.registry.nivry.testnet';
  const sellerExecutorId = 'exec-epoch1.nivry.testnet';
  const futureExpiryNs = (BigInt(Date.now()) + 86_400_000n) * 1_000_000n;

  function buildMockAgent(
    overrides: Partial<AgentInfoView> = {},
  ): AgentInfoView {
    return {
      token_id: '1',
      owner_id: 'seller.testnet',
      treasury_account_id: treasuryId,
      authority_epoch: 1,
      version: 1,
      ownership_change_count: 0,
      lifecycle: 'ready',
      frozen: false,
      executor_grant: {
        executor_id: sellerExecutorId,
        owner_at_grant: 'seller.testnet',
        epoch: 1,
        recipients: ['vendor.testnet'],
        per_payment_cap_yocto: '500000000000000000000000',
        total_budget_yocto: '2000000000000000000000000',
        spent_yocto: '0',
        remaining_budget_yocto: '2000000000000000000000000',
        expires_at_ns: Number(futureExpiryNs),
      },
      next_command_nonce: 1,
      pending_operation: null,
      pending_transfer_call: null,
      listing: null,
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
      ...overrides,
    };
  }

  beforeAll(() => {
    process.env.REGISTRY_CONTRACT_ID = registryId;
    db = new DatabaseService();
    chainReader = new ChainReaderService();
    projectionService = new EventProjectionService(db, chainReader);
    executorService = new ExecutorService(chainReader, projectionService, db);
  });

  beforeEach(async () => {
    await db.resetForTests();
    jest.restoreAllMocks();
    executorService.configureLocalDispatcher(sellerExecutorId, () =>
      Promise.resolve({ transaction_hash: 'tx_exec_1' }),
    );
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it('executes a bounded payment within grant limits and reconciles finalized outcome', async () => {
    jest.spyOn(chainReader, 'getAgentInfo').mockResolvedValue(buildMockAgent());
    jest.spyOn(chainReader, 'getBlockInfo').mockResolvedValue({
      height: 700,
      timestamp_ns: '1700000000000000000',
    });
    jest.spyOn(chainReader, 'getFinalTransactionOutcome').mockResolvedValue({
      transaction_hash: 'tx_exec_1',
      signer_id: sellerExecutorId,
      receiver_id: registryId,
      succeeded: true,
      events: [
        {
          receipt_id: 'rec-sched-1',
          executor_id: registryId,
          block_hash: 'blk-700',
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
        {
          receipt_id: 'rec-settle-1',
          executor_id: registryId,
          block_hash: 'blk-700',
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
      ],
      raw_outcome: {},
    });

    const outcome = await executorService.executeBoundedPayment({
      token_id: '1',
      recipient: 'vendor.testnet',
      amount_yocto: '200000000000000000000000',
    });

    expect(outcome.succeeded).toBe(true);
    expect(outcome.mode).toBe('local_key_signer');
    expect(outcome.mode_label).toBe('Local Key Signer (Testnet)');
    expect(outcome.contract_args.nonce).toBe(1);
    expect(outcome.contract_args.authority_epoch).toBe(1);
    expect(outcome.ingestion.inserted_events).toBe(2);

    const ops = await db.listOperationsForToken('1');
    expect(ops).toHaveLength(1);
    expect(ops[0].operation_id).toBe('op-1');
    expect(ops[0].status).toBe('succeeded');
  });

  it('rejects payment when agent is frozen, has a pending operation, or recipient is not allowlisted', async () => {
    jest
      .spyOn(chainReader, 'getAgentInfo')
      .mockResolvedValueOnce(buildMockAgent({ frozen: true }));

    await expect(
      executorService.executeBoundedPayment({
        token_id: '1',
        recipient: 'vendor.testnet',
        amount_yocto: '100000000000000000000000',
      }),
    ).rejects.toThrow(ForbiddenException);

    jest.spyOn(chainReader, 'getAgentInfo').mockResolvedValueOnce(
      buildMockAgent({
        pending_operation: {
          operation_id: 'op-pending',
          nonce: 1,
          kind: 'executor_payment',
          recipient: 'vendor.testnet',
          amount_yocto: '100000000000000000000000',
          epoch: 1,
        },
      }),
    );

    await expect(
      executorService.executeBoundedPayment({
        token_id: '1',
        recipient: 'vendor.testnet',
        amount_yocto: '100000000000000000000000',
      }),
    ).rejects.toThrow(ConflictException);

    jest
      .spyOn(chainReader, 'getAgentInfo')
      .mockResolvedValueOnce(buildMockAgent());

    await expect(
      executorService.executeBoundedPayment({
        token_id: '1',
        recipient: 'unapproved.testnet',
        amount_yocto: '100000000000000000000000',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects payment when amount exceeds per-payment cap or remaining budget', async () => {
    jest.spyOn(chainReader, 'getAgentInfo').mockResolvedValue(buildMockAgent());

    await expect(
      executorService.executeBoundedPayment({
        token_id: '1',
        recipient: 'vendor.testnet',
        amount_yocto: '600000000000000000000000',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects stale executor after ownership transfer (authority_epoch incremented and grant cleared)', async () => {
    // After NFT transfer to buyer.testnet, authority_epoch bumped to 2 and old grant was cleared
    jest.spyOn(chainReader, 'getAgentInfo').mockResolvedValue(
      buildMockAgent({
        owner_id: 'buyer.testnet',
        authority_epoch: 2,
        ownership_change_count: 1,
        executor_grant: null,
      }),
    );

    await expect(
      executorService.executeBoundedPayment({
        token_id: '1',
        recipient: 'vendor.testnet',
        amount_yocto: '100000000000000000000000',
        authority_epoch: 1,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
