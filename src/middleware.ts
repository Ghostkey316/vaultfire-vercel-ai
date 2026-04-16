/**
 * vaultfireTrustMiddleware — Vercel AI SDK language model middleware
 *
 * Gates AI responses based on on-chain Vaultfire trust scores.
 * Wraps any AI SDK language model via `wrapLanguageModel`.
 *
 * @example
 * import { wrapLanguageModel } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 * import { vaultfireTrustMiddleware } from '@vaultfire/vercel-ai';
 *
 * const trustedModel = wrapLanguageModel({
 *   model: openai('gpt-4o'),
 *   middleware: vaultfireTrustMiddleware({
 *     chain: 'base',
 *     agentAddress: '0xYourAgentAddress',
 *     minScore: 40,
 *   }),
 * });
 */

import { VaultfireClient, TrustVerification } from './client';
import type { SupportedChain } from './chains';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrustMiddlewareOptions {
  /** Chain to verify on (default: 'base') */
  chain?: SupportedChain;
  /** Agent address to verify */
  agentAddress: string;
  /** Minimum Street Cred score required (0–95, default: 40 = Silver tier) */
  minScore?: number;
  /** Override RPC URL */
  rpcUrl?: string;
  /**
   * Called when trust verification fails.
   * Return true to allow the call anyway, false/undefined to block.
   */
  onTrustFailure?: (verification: TrustVerification) => boolean | Promise<boolean>;
  /** Inject trust context into the system prompt (default: true) */
  injectContext?: boolean;
}

// AI SDK LanguageModelV1Middleware interface (reproduced to avoid hard dep)
interface LanguageModelV1CallOptions {
  prompt?: Array<{ role: string; content: unknown }>;
  system?: string;
  [key: string]: unknown;
}

type WrapDoGenerateFn = (options: {
  doGenerate: () => Promise<unknown>;
  params: LanguageModelV1CallOptions;
}) => Promise<unknown>;

type WrapDoStreamFn = (options: {
  doStream: () => Promise<unknown>;
  params: LanguageModelV1CallOptions;
}) => Promise<unknown>;

export interface LanguageModelV1Middleware {
  wrapGenerate?: WrapDoGenerateFn;
  wrapStream?: WrapDoStreamFn;
  transformParams?: (options: { params: LanguageModelV1CallOptions }) => Promise<LanguageModelV1CallOptions>;
}

// ─── Helper: build trust context string ──────────────────────────────────────

function buildTrustContextMessage(
  verification: TrustVerification,
  minScore: number,
): string {
  const lines: string[] = [
    `[Vaultfire Trust Context]`,
    `Agent: ${verification.address}`,
    `Street Cred: ${verification.streetCred}/95 (required: ${minScore}+)`,
    `Tier: ${verification.tier}`,
    `Status: ${verification.trustworthy ? 'TRUSTED' : 'UNTRUSTED'}`,
  ];

  if (verification.agent) {
    lines.push(`Name: ${verification.agent.name}`);
    lines.push(`Role: ${verification.agent.role}`);
    if (verification.agent.capabilities.length > 0) {
      lines.push(`Capabilities: ${verification.agent.capabilities.join(', ')}`);
    }
  }

  if (verification.bonds !== undefined) {
    const active = verification.bonds.filter((b) => b.active).length;
    lines.push(`Active bonds: ${active}`);
  }

  lines.push(`[End Trust Context]`);
  return lines.join('\n');
}

// ─── Middleware factory ────────────────────────────────────────────────────────

/**
 * Creates a Vaultfire trust-gating middleware for use with the Vercel AI SDK.
 *
 * The middleware:
 * 1. Before each model call, verifies the agent's on-chain Street Cred score
 * 2. If the score is below minScore, throws an error (or calls onTrustFailure)
 * 3. If injectContext is true (default), prepends trust context to the system prompt
 */
export function vaultfireTrustMiddleware(
  options: TrustMiddlewareOptions,
): LanguageModelV1Middleware {
  const chain        = options.chain ?? 'base';
  const minScore     = options.minScore ?? 40;
  const injectCtx    = options.injectContext !== false;

  const client = new VaultfireClient({
    chain,
    rpcUrl: options.rpcUrl,
  });

  /** Cache the verification for 60 s to avoid hammering RPC */
  let cachedVerification: TrustVerification | null = null;
  let cacheExpiry = 0;

  async function getVerification(): Promise<TrustVerification> {
    const now = Date.now();
    if (cachedVerification && now < cacheExpiry) {
      return cachedVerification;
    }
    const verification = await client.verifyAgent(options.agentAddress);
    cachedVerification = verification;
    cacheExpiry = now + 60_000; // 60 s TTL
    return verification;
  }

  async function checkTrust(): Promise<TrustVerification> {
    const verification = await getVerification();

    if (verification.streetCred < minScore) {
      const allowed =
        options.onTrustFailure
          ? await options.onTrustFailure(verification)
          : false;

      if (!allowed) {
        throw new Error(
          `[Vaultfire] Trust gate blocked: agent ${options.agentAddress} has Street Cred ` +
          `${verification.streetCred}/${minScore} required on ${chain}. ` +
          `Tier: ${verification.tier}. ${verification.summary}`,
        );
      }
    }

    return verification;
  }

  async function buildInjectedParams(
    params: LanguageModelV1CallOptions,
    verification: TrustVerification,
  ): Promise<LanguageModelV1CallOptions> {
    if (!injectCtx) return params;

    const trustContext = buildTrustContextMessage(verification, minScore);
    const existingSystem = params.system ?? '';

    return {
      ...params,
      system: existingSystem
        ? `${trustContext}\n\n${existingSystem}`
        : trustContext,
    };
  }

  return {
    wrapGenerate: async ({ doGenerate, params }) => {
      const verification = await checkTrust();
      const injectedParams = await buildInjectedParams(params, verification);
      // Pass injected params by reassigning (AI SDK passes params by reference context)
      Object.assign(params, injectedParams);
      return doGenerate();
    },

    wrapStream: async ({ doStream, params }) => {
      const verification = await checkTrust();
      const injectedParams = await buildInjectedParams(params, verification);
      Object.assign(params, injectedParams);
      return doStream();
    },
  };
}

// ─── Convenience: factory with env-based config ───────────────────────────────

/**
 * Creates a trust middleware pre-configured from environment variables.
 *
 * Reads: VAULTFIRE_CHAIN, VAULTFIRE_AGENT_ADDRESS, VAULTFIRE_MIN_SCORE
 */
export function vaultfireTrustMiddlewareFromEnv(
  overrides: Partial<TrustMiddlewareOptions> = {},
): LanguageModelV1Middleware {
  const chain        = (process.env['VAULTFIRE_CHAIN'] ?? 'base') as SupportedChain;
  const agentAddress = process.env['VAULTFIRE_AGENT_ADDRESS'] ?? '';
  const minScore     = parseInt(process.env['VAULTFIRE_MIN_SCORE'] ?? '40', 10);

  if (!agentAddress) {
    throw new Error(
      '[Vaultfire] VAULTFIRE_AGENT_ADDRESS environment variable is required.',
    );
  }

  return vaultfireTrustMiddleware({
    chain,
    agentAddress,
    minScore,
    ...overrides,
  });
}
