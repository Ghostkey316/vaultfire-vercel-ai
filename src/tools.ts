/**
 * Vaultfire AI SDK tool definitions
 *
 * Provides `createVaultfireTools()` which returns an object of named tools
 * compatible with the Vercel AI SDK's `tool()` function format.
 *
 * Usage:
 *   import { createVaultfireTools } from '@vaultfire/vercel-ai';
 *   const tools = createVaultfireTools({ chain: 'base' });
 *
 *   // With Vercel AI SDK generateText:
 *   const result = await generateText({ model, tools, prompt });
 */

import { z } from 'zod';
import { VaultfireClient } from './client';
import type { SupportedChain } from './chains';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface CreateVaultfireToolsOptions {
  /** Target chain (default: 'base') */
  chain?: SupportedChain;
  /** Private key for write tools — use process.env.PRIVATE_KEY */
  privateKey?: string;
  /** Override RPC URL */
  rpcUrl?: string;
}

// ─── Tool schema types (compatible with AI SDK) ───────────────────────────────

export interface VaultfireTool<TParams extends z.ZodSchema, TResult> {
  description: string;
  parameters: TParams;
  execute: (params: z.infer<TParams>) => Promise<TResult>;
}

// ─── createVaultfireTools ─────────────────────────────────────────────────────

/**
 * Returns a record of Vaultfire tools ready to pass to the Vercel AI SDK.
 * Each tool object matches the shape expected by `tool()` from the `ai` package.
 *
 * Read-only tools (7): verifyAgent, getStreetCred, getAgent, getBonds,
 *                       getReputation, discoverAgents, protocolStats
 * Write tools (2, requires privateKey): registerAgent, createBond
 */
export function createVaultfireTools(options: CreateVaultfireToolsOptions = {}) {
  const chain = options.chain ?? 'base';
  const client = new VaultfireClient({
    chain,
    privateKey: options.privateKey,
    rpcUrl: options.rpcUrl,
  });

  // ── 1. verifyAgent ─────────────────────────────────────────────────────────
  const verifyAgent = {
    description:
      'Perform a full on-chain trust verification of an AI agent address. Returns Street Cred score, tier (Unranked/Bronze/Silver/Gold/Platinum), registration status, bond count, capabilities, and a human-readable trust summary.',
    parameters: z.object({
      address: z
        .string()
        .describe('Ethereum address of the agent to verify (0x...)'),
    }),
    execute: async ({ address }: { address: string }) => {
      const result = await client.verifyAgent(address);
      return {
        address: result.address,
        isRegistered: result.isRegistered,
        streetCred: result.streetCred,
        tier: result.tier,
        trustworthy: result.trustworthy,
        summary: result.summary,
        agentName: result.agent?.name,
        agentRole: result.agent?.role,
        capabilities: result.agent?.capabilities ?? [],
        activeBonds: result.bonds?.filter((b) => b.active).length ?? 0,
        chain,
      };
    },
  } satisfies VaultfireTool<z.ZodObject<{ address: z.ZodString }>, unknown>;

  // ── 2. getStreetCred ───────────────────────────────────────────────────────
  const getStreetCred = {
    description:
      'Fetch the Street Cred score (0–95) for an agent address. Street Cred is a composite trust score derived from identity verification (30 pts), partnership bonds (25 pts), accountability history (15 pts), activity level (20 pts), and protocol longevity (5 pts).',
    parameters: z.object({
      address: z.string().describe('Ethereum address of the agent'),
    }),
    execute: async ({ address }: { address: string }) => {
      const [score, tier] = await Promise.all([
        client.getStreetCred(address),
        client.getTier(address).catch(() => undefined),
      ]);
      return { address, streetCred: score, tier: tier ?? 'Unranked', chain };
    },
  } satisfies VaultfireTool<z.ZodObject<{ address: z.ZodString }>, unknown>;

  // ── 3. getAgent ────────────────────────────────────────────────────────────
  const getAgent = {
    description:
      'Retrieve on-chain identity data for an agent: name, role, capabilities list, registration timestamp, and active status.',
    parameters: z.object({
      address: z.string().describe('Ethereum address of the agent'),
    }),
    execute: async ({ address }: { address: string }) => {
      const [registered, agentData] = await Promise.all([
        client.isRegistered(address).catch(() => false),
        client.getAgent(address).catch(() => null),
      ]);
      if (!registered || !agentData) {
        return { address, registered: false, chain };
      }
      return {
        address,
        registered: true,
        name: agentData.name,
        role: agentData.role,
        capabilities: agentData.capabilities,
        registeredAt: Number(agentData.registeredAt),
        active: agentData.active,
        chain,
      };
    },
  } satisfies VaultfireTool<z.ZodObject<{ address: z.ZodString }>, unknown>;

  // ── 4. getBonds ────────────────────────────────────────────────────────────
  const getBonds = {
    description:
      'List all partnership bonds for an agent. Each bond includes partner address, strength (0–100), creation timestamp, and active status. Bonds indicate trusted partnerships between AI agents.',
    parameters: z.object({
      address: z.string().describe('Ethereum address of the agent'),
    }),
    execute: async ({ address }: { address: string }) => {
      const bonds = await client.getBonds(address);
      return {
        address,
        totalBonds: bonds.length,
        activeBonds: bonds.filter((b) => b.active).length,
        bonds: bonds.map((b) => ({
          partner: b.agent1.toLowerCase() === address.toLowerCase() ? b.agent2 : b.agent1,
          strength: Number(b.strength),
          createdAt: Number(b.createdAt),
          active: b.active,
        })),
        chain,
      };
    },
  } satisfies VaultfireTool<z.ZodObject<{ address: z.ZodString }>, unknown>;

  // ── 5. getReputation ───────────────────────────────────────────────────────
  const getReputation = {
    description:
      'Get the full reputation breakdown for an agent: Street Cred score, tier, component scores (identity, partnership, accountability, activity, longevity), and positive/negative action counts.',
    parameters: z.object({
      address: z.string().describe('Ethereum address of the agent'),
    }),
    execute: async ({ address }: { address: string }) => {
      const [streetCred, fullRep, repData] = await Promise.all([
        client.getStreetCred(address).catch(() => 0),
        client.getFullReputation(address).catch(() => null),
        client.getReputation(address).catch(() => null),
      ]);
      return {
        address,
        streetCred,
        tier: fullRep?.tier ?? 'Unranked',
        breakdown: fullRep
          ? {
              identityScore:       Number(fullRep.identityScore),
              partnershipScore:    Number(fullRep.partnershipScore),
              accountabilityScore: Number(fullRep.accountabilityScore),
              activityScore:       Number(fullRep.activityScore),
              longevityScore:      Number(fullRep.longevityScore),
            }
          : null,
        accountabilityHistory: repData
          ? {
              positiveActions: Number(repData.positiveActions),
              negativeActions: Number(repData.negativeActions),
              netScore:        Number(repData.score),
              lastUpdated:     Number(repData.lastUpdated),
            }
          : null,
        chain,
      };
    },
  } satisfies VaultfireTool<z.ZodObject<{ address: z.ZodString }>, unknown>;

  // ── 6. discoverAgents ──────────────────────────────────────────────────────
  const discoverAgents = {
    description:
      'Discover registered AI agents by capability (e.g. "trading", "analysis", "summarization"). Returns a list of agent addresses that have declared that capability.',
    parameters: z.object({
      capability: z
        .string()
        .describe('Capability string to search for (e.g. "trading", "analysis")'),
    }),
    execute: async ({ capability }: { capability: string }) => {
      const addresses = await client.getAgentsByCapability(capability);
      return {
        capability,
        count: addresses.length,
        agents: addresses,
        chain,
      };
    },
  } satisfies VaultfireTool<z.ZodObject<{ capability: z.ZodString }>, unknown>;

  // ── 7. protocolStats ───────────────────────────────────────────────────────
  const protocolStats = {
    description:
      'Get protocol-level statistics: total registered agents, total bonds created, total reputation events, and protocol deployment timestamp.',
    parameters: z.object({}),
    execute: async () => {
      const stats = await client.protocolStats();
      return {
        totalAgents:           Number(stats.totalAgents),
        totalBonds:            Number(stats.totalBonds),
        totalReputationEvents: Number(stats.totalReputationEvents),
        deployedAt:            Number(stats.deployedAt),
        chain,
      };
    },
  } satisfies VaultfireTool<z.ZodObject<Record<string, never>>, unknown>;

  // ── 8. registerAgent (write) ───────────────────────────────────────────────
  const registerAgent = {
    description:
      'Register an AI agent on the Vaultfire Protocol. Requires a private key. Records the agent\'s name, role, and capabilities on-chain. Returns the transaction hash.',
    parameters: z.object({
      name:         z.string().describe('Human-readable name for the agent'),
      role:         z.string().describe('Agent role (e.g. "trader", "analyst", "assistant")'),
      capabilities: z
        .array(z.string())
        .describe('List of capabilities this agent has (e.g. ["trading", "analysis"])'),
    }),
    execute: async ({
      name,
      role,
      capabilities,
    }: {
      name: string;
      role: string;
      capabilities: string[];
    }) => {
      const txHash = await client.registerAgent(name, role, capabilities);
      return {
        success: true,
        txHash,
        message: `Agent "${name}" (${role}) registered on ${chain}. Tx: ${txHash}`,
        chain,
      };
    },
  } satisfies VaultfireTool<
    z.ZodObject<{
      name: z.ZodString;
      role: z.ZodString;
      capabilities: z.ZodArray<z.ZodString>;
    }>,
    unknown
  >;

  // ── 9. createBond (write) ──────────────────────────────────────────────────
  const createBond = {
    description:
      'Create a partnership bond between the caller\'s agent and another agent. Requires a private key. Bond strength should be between 1 and 100. Returns the transaction hash.',
    parameters: z.object({
      partnerAddress: z
        .string()
        .describe('Ethereum address of the partner agent'),
      strength: z
        .number()
        .min(1)
        .max(100)
        .describe('Bond strength from 1 (weak) to 100 (strong)'),
    }),
    execute: async ({
      partnerAddress,
      strength,
    }: {
      partnerAddress: string;
      strength: number;
    }) => {
      const txHash = await client.createBond(partnerAddress, strength);
      return {
        success: true,
        txHash,
        message: `Bond created with ${partnerAddress} (strength: ${strength}/100) on ${chain}. Tx: ${txHash}`,
        chain,
      };
    },
  } satisfies VaultfireTool<
    z.ZodObject<{
      partnerAddress: z.ZodString;
      strength: z.ZodNumber;
    }>,
    unknown
  >;

  return {
    verifyAgent,
    getStreetCred,
    getAgent,
    getBonds,
    getReputation,
    discoverAgents,
    protocolStats,
    registerAgent,
    createBond,
  };
}

export type VaultfireTools = ReturnType<typeof createVaultfireTools>;

/**
 * Wrap Vaultfire tools with the AI SDK's `tool()` function.
 * Call this if you have the `ai` package installed.
 *
 * @example
 * import { tool } from 'ai';
 * const tools = wrapWithAiSdk(createVaultfireTools({ chain: 'base' }), tool);
 */
export function wrapWithAiSdk<T extends Record<string, VaultfireTool<z.ZodSchema, unknown>>>(
  tools: T,
  toolFn: (def: VaultfireTool<z.ZodSchema, unknown>) => unknown,
): Record<keyof T, unknown> {
  return Object.fromEntries(
    Object.entries(tools).map(([name, def]) => [name, toolFn(def)]),
  ) as Record<keyof T, unknown>;
}
