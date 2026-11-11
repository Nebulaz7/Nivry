import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import {
  ChainReaderService,
  type AgentInfoView,
} from '../verifier/chain-reader.service';
import { computeNep413Digest, SessionService } from './session.service';

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes: Buffer): string {
  let num = 0n;
  for (const b of bytes) {
    num = num * 256n + BigInt(b);
  }
  let out = '';
  while (num > 0n) {
    const rem = Number(num % 58n);
    out = BASE58_ALPHABET[rem] + out;
    num = num / 58n;
  }
  for (const b of bytes) {
    if (b === 0) out = '1' + out;
    else break;
  }
  return out || '1';
}

function generateTestNearKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const rawPubKey32 = spki.subarray(12);
  const nearPublicKey = `ed25519:${encodeBase58(rawPubKey32)}`;
  return { nearPublicKey, privateKey };
}

describe('SessionService', () => {
  let db: DatabaseService;
  let chainReader: ChainReaderService;
  let service: SessionService;

  beforeEach(async () => {
    process.env.REGISTRY_CONTRACT_ID = 'nivry.testnet';
    db = new DatabaseService();
    await db.resetForTests();
    chainReader = new ChainReaderService();
    service = new SessionService(db, chainReader);
  });

  afterEach(async () => {
    await db.onModuleDestroy();
  });

  it('issues a challenge, verifies a NEP-413 Ed25519 signature against on-chain access keys, and blocks replay', async () => {
    const { nearPublicKey, privateKey } = generateTestNearKeyPair();

    jest.spyOn(chainReader, 'getAccessKeyList').mockResolvedValue([
      {
        public_key: nearPublicKey,
        access_key: {
          nonce: 1,
          permission: 'FullAccess',
        },
      },
    ]);

    const challenge = await service.issueChallenge('alice.testnet');
    expect(challenge.account_id).toBe('alice.testnet');
    expect(challenge.recipient).toBe('nivry.testnet');

    const digest = computeNep413Digest({
      message: challenge.message,
      nonce32Bytes: Buffer.from(challenge.nonce, 'hex'),
      recipient: challenge.recipient,
    });
    const sigBytes = cryptoSign(null, digest, privateKey);
    const sigBase64 = sigBytes.toString('base64');

    const verified = await service.verifyChallenge({
      challenge_id: challenge.challenge_id,
      account_id: 'alice.testnet',
      public_key: nearPublicKey,
      signature: sigBase64,
    });

    expect(verified.account_id).toBe('alice.testnet');
    expect(verified.public_key).toBe(nearPublicKey);

    const claims = service.verifySessionToken(
      `Bearer ${verified.session_token}`,
    );
    expect(claims.account_id).toBe('alice.testnet');

    // Replay of the same challenge must fail closed
    await expect(
      service.verifyChallenge({
        challenge_id: challenge.challenge_id,
        account_id: 'alice.testnet',
        public_key: nearPublicKey,
        signature: sigBase64,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects valid signatures when the public key is not an authorized on-chain access key', async () => {
    const { nearPublicKey, privateKey } = generateTestNearKeyPair();

    // Key is scoped to a foreign contract, not nivry.testnet
    jest.spyOn(chainReader, 'getAccessKeyList').mockResolvedValue([
      {
        public_key: nearPublicKey,
        access_key: {
          nonce: 1,
          permission: {
            FunctionCall: {
              allowance: '1000',
              receiver_id: 'other-contract.testnet',
              method_names: [],
            },
          },
        },
      },
    ]);

    const challenge = await service.issueChallenge('alice.testnet');
    const sigBytes = cryptoSign(
      null,
      Buffer.from(challenge.message, 'utf8'),
      privateKey,
    );

    await expect(
      service.verifyChallenge({
        challenge_id: challenge.challenge_id,
        public_key: nearPublicKey,
        signature: sigBytes.toString('hex'),
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('enforces on-chain owner_id and active executor_grant.executor_id across authority epochs', async () => {
    const futureExpiryNs = Number(BigInt(Date.now() + 600_000) * 1_000_000n);
    const baseAgent: AgentInfoView = {
      token_id: '1',
      owner_id: 'seller.testnet',
      treasury_account_id: '00000001.nivry.testnet',
      authority_epoch: 1,
      version: 1,
      ownership_change_count: 0,
      lifecycle: 'ready',
      frozen: false,
      executor_grant: {
        executor_id: 'exec-seller.testnet',
        owner_at_grant: 'seller.testnet',
        epoch: 1,
        recipients: ['vendor.testnet'],
        per_payment_cap_yocto: '1000000',
        total_budget_yocto: '5000000',
        spent_yocto: '0',
        remaining_budget_yocto: '5000000',
        expires_at_ns: futureExpiryNs,
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
    };

    const getAgentSpy = jest
      .spyOn(chainReader, 'getAgentInfo')
      .mockResolvedValue(baseAgent);

    const expiresAt = new Date(Date.now() + 3600_000).toISOString();

    // 1. Current owner is authorized
    await expect(
      service.assertAgentOwnerOrExecutor('1', {
        account_id: 'seller.testnet',
        public_key: 'ed25519:111',
        challenge_id: 'chal_1',
        expires_at: expiresAt,
      }),
    ).resolves.toMatchObject({ owner_id: 'seller.testnet' });

    // 2. Active executor at epoch 1 is authorized when allowExecutor=true
    await expect(
      service.assertAgentOwnerOrExecutor('1', {
        account_id: 'exec-seller.testnet',
        public_key: 'ed25519:222',
        challenge_id: 'chal_2',
        expires_at: expiresAt,
      }),
    ).resolves.toMatchObject({ authority_epoch: 1 });

    // 3. After sale to buyer.testnet (epoch 2), seller and seller's executor are rejected
    getAgentSpy.mockResolvedValue({
      ...baseAgent,
      owner_id: 'buyer.testnet',
      authority_epoch: 2,
      version: 2,
      ownership_change_count: 1,
      executor_grant: null,
    });

    await expect(
      service.assertAgentOwnerOrExecutor('1', {
        account_id: 'seller.testnet',
        public_key: 'ed25519:111',
        challenge_id: 'chal_1',
        expires_at: expiresAt,
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.assertAgentOwnerOrExecutor('1', {
        account_id: 'exec-seller.testnet',
        public_key: 'ed25519:222',
        challenge_id: 'chal_2',
        expires_at: expiresAt,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
