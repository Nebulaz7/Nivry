import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as cryptoVerify,
} from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import {
  ChainReaderService,
  decodeBase58,
  type AgentInfoView,
} from '../verifier/chain-reader.service';

/** RFC 8410 SubjectPublicKeyInfo DER prefix for a 32-byte Ed25519 public key. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** NEP-413 tag: 2**31 + 413 = 2147484061 (little-endian u32). */
const NEP413_TAG = 2147484061;

const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000;

export interface IssuedChallengeView {
  challenge_id: string;
  account_id: string;
  nonce: string;
  recipient: string;
  message: string;
  expires_at: string;
}

export interface VerifyChallengeInput {
  challenge_id: string;
  account_id?: string;
  public_key: string;
  signature: string;
  callback_url?: string;
}

export interface AuthenticatedSession {
  account_id: string;
  public_key: string;
  challenge_id: string;
  expires_at: string;
}

export interface VerifiedSessionView extends AuthenticatedSession {
  session_token: string;
}

/**
 * Serializes a NEP-413 payload with Borsh and returns its 32-byte SHA-256 digest.
 */
export function computeNep413Digest(params: {
  message: string;
  nonce32Bytes: Buffer;
  recipient: string;
  callbackUrl?: string;
}): Buffer {
  if (params.nonce32Bytes.length !== 32) {
    throw new Error('NEP-413 nonce must be exactly 32 bytes');
  }
  const tagBuf = Buffer.alloc(4);
  tagBuf.writeUInt32LE(NEP413_TAG, 0);

  const encodeString = (str: string): Buffer => {
    const bytes = Buffer.from(str, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(bytes.length, 0);
    return Buffer.concat([len, bytes]);
  };

  const callbackPart =
    typeof params.callbackUrl === 'string'
      ? Buffer.concat([Buffer.from([1]), encodeString(params.callbackUrl)])
      : Buffer.from([0]);

  const borshPayload = Buffer.concat([
    encodeString(params.message),
    params.nonce32Bytes,
    encodeString(params.recipient),
    callbackPart,
  ]);

  return createHash('sha256')
    .update(Buffer.concat([tagBuf, borshPayload]))
    .digest();
}

/**
 * Parses an `ed25519:<base58>` NEAR public key into a 32-byte raw key buffer.
 */
export function parseEd25519PublicKey(publicKey: string): Buffer {
  if (typeof publicKey !== 'string' || !publicKey.startsWith('ed25519:')) {
    throw new UnauthorizedException(
      'public_key must be formatted as "ed25519:<base58>"',
    );
  }
  const raw = decodeBase58(publicKey.slice('ed25519:'.length));
  if (!raw || raw.length !== 32) {
    throw new UnauthorizedException(
      'Invalid ed25519 public_key length (expected 32 bytes)',
    );
  }
  return raw;
}

/**
 * Parses an Ed25519 signature from `ed25519:<base58>`, raw base58, hex, or base64 into 64 bytes.
 */
export function parseEd25519Signature(signature: string): Buffer {
  if (!signature || typeof signature !== 'string') {
    throw new UnauthorizedException('signature is required');
  }
  const trimmed = signature.startsWith('ed25519:')
    ? signature.slice('ed25519:'.length)
    : signature;

  if (/^[0-9a-fA-F]{128}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  const fromB58 = decodeBase58(trimmed);
  if (fromB58 && fromB58.length === 64) {
    return fromB58;
  }

  const fromB64 = Buffer.from(trimmed, 'base64');
  if (fromB64.length === 64) {
    return fromB64;
  }

  throw new UnauthorizedException(
    'Invalid ed25519 signature encoding (expected 64-byte base58, base64, or hex)',
  );
}

@Injectable()
export class SessionService {
  private readonly sessionSecret: Buffer;

  constructor(
    private readonly db: DatabaseService,
    private readonly chainReader: ChainReaderService,
  ) {
    const configuredSecret = process.env.SESSION_HMAC_SECRET;
    this.sessionSecret = configuredSecret
      ? createHash('sha256').update(configuredSecret).digest()
      : randomBytes(32);
  }

  /**
   * Issues a one-use expiring wallet challenge stored in `session_challenges` (PLAN.md §13).
   */
  async issueChallenge(accountId: string): Promise<IssuedChallengeView> {
    if (
      !accountId ||
      typeof accountId !== 'string' ||
      accountId.length < 2 ||
      accountId.length > 64 ||
      !/^[a-z0-9._-]+$/.test(accountId)
    ) {
      throw new BadRequestException(
        'Valid NEAR account_id (2..=64 lowercase characters) is required',
      );
    }

    const challengeId = `chal_${randomBytes(16).toString('hex')}`;
    const nonce = randomBytes(32).toString('hex');
    const recipient = this.chainReader.getRegistryContractId();
    const expiresAt = new Date(Date.now() + DEFAULT_CHALLENGE_TTL_MS);

    const message = [
      'Nivry Wallet Session Challenge',
      `challenge_id: ${challengeId}`,
      `account_id: ${accountId}`,
      `recipient: ${recipient}`,
      `nonce: ${nonce}`,
      `expires_at: ${expiresAt.toISOString()}`,
    ].join('\n');

    await this.db.createSessionChallenge({
      challenge_id: challengeId,
      account_id: accountId,
      nonce,
      message,
      expires_at: expiresAt,
    });

    return {
      challenge_id: challengeId,
      account_id: accountId,
      nonce,
      recipient,
      message,
      expires_at: expiresAt.toISOString(),
    };
  }

  /**
   * Verifies a signed challenge against the account's on-chain NEAR access keys,
   * atomically consumes the challenge, and returns a bearer session token (`ISSUES.md` #1).
   */
  async verifyChallenge(
    input: VerifyChallengeInput,
  ): Promise<VerifiedSessionView> {
    if (!input?.challenge_id || typeof input.challenge_id !== 'string') {
      throw new BadRequestException('challenge_id is required');
    }

    const challenge = await this.db.getSessionChallenge(input.challenge_id);
    if (!challenge) {
      throw new UnauthorizedException('Unknown challenge_id');
    }
    if (challenge.used) {
      throw new UnauthorizedException('Challenge has already been used');
    }
    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedException('Challenge has expired');
    }
    if (
      input.account_id !== undefined &&
      input.account_id !== challenge.account_id
    ) {
      throw new UnauthorizedException(
        `Challenge belongs to "${challenge.account_id}", not "${input.account_id}"`,
      );
    }

    const rawPubKey = parseEd25519PublicKey(input.public_key);
    const sigBytes = parseEd25519Signature(input.signature);
    const keyObject = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, rawPubKey]),
      format: 'der',
      type: 'spki',
    });

    const recipient = this.chainReader.getRegistryContractId();
    const nonce32Bytes = Buffer.from(challenge.nonce, 'hex');
    const nep413Digest = computeNep413Digest({
      message: challenge.message,
      nonce32Bytes,
      recipient,
      callbackUrl: input.callback_url,
    });
    const utf8MessageBytes = Buffer.from(challenge.message, 'utf8');

    const validNep413 = cryptoVerify(null, nep413Digest, keyObject, sigBytes);
    const validRawMessage =
      validNep413 || cryptoVerify(null, utf8MessageBytes, keyObject, sigBytes);

    if (!validRawMessage) {
      throw new UnauthorizedException(
        'Invalid Ed25519 signature for challenge',
      );
    }

    const hasOnChainKey = await this.chainReader.verifyAccountAccessKey(
      challenge.account_id,
      input.public_key,
    );
    if (!hasOnChainKey) {
      throw new UnauthorizedException(
        `Public key ${input.public_key} is not an active authorized access key on ${challenge.account_id}`,
      );
    }

    const consumed = await this.db.consumeSessionChallenge(
      challenge.challenge_id,
    );
    if (!consumed) {
      throw new UnauthorizedException(
        'Challenge expired or was already consumed',
      );
    }

    const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS);
    const session: AuthenticatedSession = {
      account_id: challenge.account_id,
      public_key: input.public_key,
      challenge_id: challenge.challenge_id,
      expires_at: expiresAt.toISOString(),
    };

    return {
      ...session,
      session_token: this.signSessionToken(session),
    };
  }

  /**
   * Validates an `Authorization: Bearer <token>` header or raw session token.
   */
  verifySessionToken(
    authHeaderOrToken: string | undefined,
  ): AuthenticatedSession {
    if (!authHeaderOrToken || typeof authHeaderOrToken !== 'string') {
      throw new UnauthorizedException(
        'Missing Authorization Bearer session token',
      );
    }
    const token = authHeaderOrToken.startsWith('Bearer ')
      ? authHeaderOrToken.slice('Bearer '.length).trim()
      : authHeaderOrToken.trim();

    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'nivry_sess') {
      throw new UnauthorizedException('Malformed session token');
    }

    const [, payloadB64, sigB64] = parts;
    const expectedMac = createHmac('sha256', this.sessionSecret)
      .update(`${parts[0]}.${payloadB64}`)
      .digest();
    const providedMac = Buffer.from(sigB64, 'base64url');

    if (
      providedMac.length !== expectedMac.length ||
      !timingSafeEqual(providedMac, expectedMac)
    ) {
      throw new UnauthorizedException('Invalid session token signature');
    }

    let parsed: AuthenticatedSession;
    try {
      parsed = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      ) as AuthenticatedSession;
    } catch {
      throw new UnauthorizedException('Invalid session token payload');
    }

    if (
      !parsed?.account_id ||
      !parsed?.public_key ||
      !parsed?.challenge_id ||
      !parsed?.expires_at
    ) {
      throw new UnauthorizedException('Incomplete session token claims');
    }

    if (new Date(parsed.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedException('Session token has expired');
    }

    return parsed;
  }

  /**
   * Re-reads fresh finalized on-chain `agent_info` and verifies that `session.account_id`
   * matches either the current `owner_id` or (when allowed) the active `executor_grant.executor_id`
   * at the current `authority_epoch` (`PLAN.md` §13 & `ISSUES.md` #1).
   */
  async assertAgentOwnerOrExecutor(
    tokenId: string,
    session: AuthenticatedSession,
    options: { allowExecutor?: boolean } = { allowExecutor: true },
  ): Promise<AgentInfoView> {
    const agent = await this.chainReader.getAgentInfo(tokenId);
    if (agent.owner_id !== null) {
      await this.db.upsertAgent(agent);
    }

    if (agent.owner_id !== null && session.account_id === agent.owner_id) {
      return agent;
    }

    const allowExecutor = options.allowExecutor ?? true;
    const grant = agent.executor_grant;
    if (
      allowExecutor &&
      grant !== null &&
      agent.owner_id !== null &&
      grant.executor_id === session.account_id &&
      grant.epoch === agent.authority_epoch &&
      grant.owner_at_grant === agent.owner_id &&
      BigInt(grant.expires_at_ns) > BigInt(Date.now()) * 1_000_000n
    ) {
      return agent;
    }

    throw new ForbiddenException(
      `Account "${session.account_id}" is neither the current owner nor the active authorized executor for agent ${tokenId}`,
    );
  }

  private signSessionToken(session: AuthenticatedSession): string {
    const payloadB64 = Buffer.from(JSON.stringify(session), 'utf8').toString(
      'base64url',
    );
    const macB64 = createHmac('sha256', this.sessionSecret)
      .update(`nivry_sess.${payloadB64}`)
      .digest('base64url');
    return `nivry_sess.${payloadB64}.${macB64}`;
  }
}
