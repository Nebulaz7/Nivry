/**
 * Nivry protocol constants and limits (PLAN.md §4, §5, and contracts/README.md).
 */

export const MANIFEST_SCHEMA_VERSION = '1';

export const MAX_NAME_LEN = 64;
export const MAX_DESCRIPTION_LEN = 256;
export const MAX_RUNTIME_HINT_LEN = 32;
export const MAX_TASK_KIND_LEN = 32;
export const MAX_URI_LEN = 256;
export const BUNDLE_SHA256_HEX_LEN = 64;

export const MAX_RECIPIENTS = 8;
export const MAX_IDENTIFIER_LEN = 64;
export const MAX_CALLBACK_RESULT_BYTES = 256;
export const MAX_PAGE_SIZE = 100;

/** 90 days in nanoseconds */
export const MAX_GRANT_LIFETIME_NS = 90n * 24n * 60n * 60n * 1_000_000_000n;

/** 1 yoctoNEAR security deposit for standard transfers */
export const ONE_YOCTO = '1';
export const ZERO_YOCTO = '0';

/** 50 milliNEAR initial balance for fresh keyless treasury child accounts */
export const WALLET_INITIAL_BALANCE_YOCTO = '50000000000000000000000';

/** 30 milliNEAR storage deposit retained by registry for agent record storage */
export const REGISTRY_STORAGE_ALLOWANCE_YOCTO = '30000000000000000000000';

/** 0.1 NEAR non-spendable operational reserve for treasury gas float */
export const TREASURY_OPERATING_RESERVE_YOCTO = '100000000000000000000000';

