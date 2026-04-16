/**
 * @vaultfire/vercel-ai
 *
 * Vercel AI SDK integration for Vaultfire Protocol.
 * Trust-gating middleware and on-chain verification tools for any AI provider.
 *
 * Works with OpenAI · Anthropic · Google · Mistral and any AI SDK provider.
 */

// ─── Chain configuration ──────────────────────────────────────────────────────
export { CHAINS, getChainConfig } from './chains';
export type { SupportedChain, ChainConfig, ContractAddresses } from './chains';

// ─── ABIs ─────────────────────────────────────────────────────────────────────
export {
  IDENTITY_ABI,
  PARTNERSHIP_ABI,
  ACCOUNTABILITY_ABI,
  REPUTATION_ABI,
} from './abis';

// ─── VaultfireClient ──────────────────────────────────────────────────────────
export { VaultfireClient, getTierFromScore } from './client';
export type {
  VaultfireClientOptions,
  AgentData,
  BondData,
  ReputationData,
  FullReputation,
  ProtocolStats,
  TrustVerification,
} from './client';

// ─── AI SDK Tools ─────────────────────────────────────────────────────────────
export { createVaultfireTools, wrapWithAiSdk } from './tools';
export type { CreateVaultfireToolsOptions, VaultfireTools, VaultfireTool } from './tools';

// ─── Middleware ───────────────────────────────────────────────────────────────
export {
  vaultfireTrustMiddleware,
  vaultfireTrustMiddlewareFromEnv,
} from './middleware';
export type {
  TrustMiddlewareOptions,
  LanguageModelV1Middleware,
} from './middleware';
