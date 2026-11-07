import { NotFoundException } from '@nestjs/common';
import { ChainReaderService } from './chain-reader.service';

describe('ChainReaderService', () => {
  let service: ChainReaderService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.NEAR_RPC_URL = 'https://rpc.testnet.near.org';
    process.env.REGISTRY_CONTRACT_ID = 'registry.nivry.testnet';
    service = new ChainReaderService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('calls call_function with finality="final" and base64-encoded arguments', async () => {
    const mockAgentInfo = {
      token_id: '1',
      owner_id: 'alice.testnet',
      treasury_account_id: '00000001.registry.nivry.testnet',
      authority_epoch: 1,
      ownership_change_count: 0,
      lifecycle: 'ready',
      frozen: false,
      executor_grant: null,
      next_command_nonce: 1,
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
    };

    const encodedBytes = Array.from(
      Buffer.from(JSON.stringify(mockAgentInfo), 'utf8'),
    );
    let capturedBody: Record<string, unknown> | null = null;

    global.fetch = jest
      .fn()
      .mockImplementation((_url: unknown, init?: RequestInit) => {
        const bodyStr = typeof init?.body === 'string' ? init.body : '{}';
        capturedBody = JSON.parse(bodyStr) as Record<string, unknown>;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              jsonrpc: '2.0',
              id: 'nivry-chain-reader',
              result: {
                result: encodedBytes,
                block_height: 100,
                block_hash: 'blockhash1',
              },
            }),
        });
      });

    const info = await service.getAgentInfo('1');
    expect(info.token_id).toBe('1');
    expect(info.owner_id).toBe('alice.testnet');
    expect(capturedBody).not.toBeNull();
    const params = (
      capturedBody as unknown as { params: Record<string, unknown> }
    ).params;
    expect(params.finality).toBe('final');
    expect(params.account_id).toBe('registry.nivry.testnet');
    expect(params.method_name).toBe('agent_info');
    expect(
      Buffer.from(params.args_base64 as string, 'base64').toString('utf8'),
    ).toBe('{"token_id":"1"}');
  });

  it('verifies keyless locked account state vs development/unverified state', async () => {
    let mockKeys: unknown[] = [];

    global.fetch = jest
      .fn()
      .mockImplementation((_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(
          typeof init?.body === 'string' ? init.body : '{}',
        ) as { params?: { request_type?: string } };
        if (body.params?.request_type === 'view_account') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                result: {
                  amount: '50000000000000000000000',
                  storage_usage: 280000,
                  code_hash: '99999999999999999999999999999999',
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              result: { keys: mockKeys },
            }),
        });
      });

    const locked = await service.verifyAccountLockState(
      '00000001.registry.nivry.testnet',
    );
    expect(locked.is_keyless).toBe(true);
    expect(locked.verification_label).toBe('locked_release');

    mockKeys = [
      { public_key: 'ed25519:abc', access_key: { permission: 'FullAccess' } },
    ];
    const unlocked = await service.verifyAccountLockState(
      'registry.nivry.testnet',
    );
    expect(unlocked.is_keyless).toBe(false);
    expect(unlocked.verification_label).toBe('development/unverified');
  });

  it('extracts NEP-297 EVENT_JSON logs with exact receipt_id and log_index', () => {
    const events = service.extractNep297Events([
      {
        id: 'receipt-1',
        block_hash: 'block-1',
        outcome: {
          executor_id: '00000001.registry.nivry.testnet',
          logs: [
            'plain diagnostic log',
            'EVENT_JSON:{"standard":"nivry","version":"1.0.0","event":"payment_received","data":{"payer":"bob.testnet","amount_yocto":"1000000000000000000000000","observed_authority_epoch":1}}',
          ],
        },
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].receipt_id).toBe('receipt-1');
    expect(events[0].log_index).toBe(1);
    expect(events[0].standard).toBe('nivry');
    expect(events[0].event).toBe('payment_received');
  });

  it('throws NotFoundException when contract reports unknown token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          error: {
            message: 'wasm execution failed',
            data: 'Smart contract panicked: unknown token',
          },
        }),
    });

    await expect(service.getAgentInfo('999')).rejects.toThrow(
      NotFoundException,
    );
  });
});
