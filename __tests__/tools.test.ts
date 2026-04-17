/**
 * @vaultfire/vercel-ai — Unit Tests
 *
 * Tests tool creation, schema validation, chain configuration,
 * scoring logic, and middleware factory without live RPC calls.
 */

import { z } from 'zod';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock ethers so we don't need a live RPC
jest.mock('ethers', () => {
  const mockContract = {
    isRegistered: jest.fn().mockResolvedValue(true),
    getAgent: jest.fn().mockResolvedValue({
      addr: '0xA054f831B562e729F8D268291EBde1B2EDcFb84F',
      name: 'TestAgent',
      role: 'analyst',
      capabilities: ['analysis', 'summarization'],
      registeredAt: BigInt(1700000000),
      active: true,
    }),
    getStreetCred: jest.fn().mockResolvedValue(BigInt(65)),
    getTier: jest.fn().mockResolvedValue('Gold'),
    getFullReputation: jest.fn().mockResolvedValue({
      streetCred: BigInt(65),
      tier: 'Gold',
      identityScore: BigInt(28),
      partnershipScore: BigInt(20),
      accountabilityScore: BigInt(10),
      activityScore: BigInt(5),
      longevityScore: BigInt(2),
    }),
    getReputation: jest.fn().mockResolvedValue({
      agent: '0xA054f831B562e729F8D268291EBde1B2EDcFb84F',
      score: BigInt(42),
      positiveActions: BigInt(15),
      negativeActions: BigInt(2),
      lastUpdated: BigInt(1710000000),
    }),
    getBonds: jest.fn().mockResolvedValue([
      {
        agent1: '0xA054f831B562e729F8D268291EBde1B2EDcFb84F',
        agent2: '0x1234567890123456789012345678901234567890',
        strength: BigInt(80),
        createdAt: BigInt(1705000000),
        active: true,
      },
    ]),
    getBondStrength: jest.fn().mockResolvedValue(BigInt(80)),
    getAgentsByCapability: jest.fn().mockResolvedValue([
      '0xA054f831B562e729F8D268291EBde1B2EDcFb84F',
    ]),
    protocolStats: jest.fn().mockResolvedValue({
      totalAgents: BigInt(142),
      totalBonds: BigInt(89),
      totalReputationEvents: BigInt(1203),
      deployedAt: BigInt(1690000000),
    }),
    registerAgent: jest.fn().mockResolvedValue({ wait: async () => ({ hash: '0xabc123' }) }),
    createBond:    jest.fn().mockResolvedValue({ wait: async () => ({ hash: '0xdef456' }) }),
  };

  return {
    ethers: {
      JsonRpcProvider: jest.fn().mockImplementation(() => ({})),
      Wallet: jest.fn().mockImplementation(() => mockContract),
      Contract: jest.fn().mockImplementation(() => mockContract),
    },
  };
});

// ─── Imports after mocking ────────────────────────────────────────────────────

import { CHAINS, getChainConfig } from '../src/chains';
import { VaultfireClient, getTierFromScore } from '../src/client';
import { createVaultfireTools } from '../src/tools';
import { vaultfireTrustMiddleware } from '../src/middleware';

// ─── chains.ts ────────────────────────────────────────────────────────────────

describe('chains', () => {
  test('exports all four chains', () => {
    expect(Object.keys(CHAINS)).toEqual(['base', 'avalanche', 'arbitrum', 'polygon']);
  });

  test('base chain has correct chainId and contracts', () => {
    const cfg = CHAINS.base;
    expect(cfg.chainId).toBe(8453);
    expect(cfg.contracts.identity).toBe('0x35978DB675576598F0781dA2133E94cdCf4858bC');
    expect(cfg.contracts.partnership).toBe('0x01C479F0c039fEC40c0Cf1c5C921bab457d57441');
  });

  test('avalanche chain has correct chainId', () => {
    expect(CHAINS.avalanche.chainId).toBe(43114);
  });

  test('arbitrum chain has correct chainId', () => {
    expect(CHAINS.arbitrum.chainId).toBe(42161);
  });

  test('polygon chain has correct chainId', () => {
    expect(CHAINS.polygon.chainId).toBe(137);
  });

  test('getChainConfig returns config for valid chain', () => {
    const cfg = getChainConfig('base');
    expect(cfg.name).toBe('Base');
  });

  test('getChainConfig throws for invalid chain', () => {
    expect(() => getChainConfig('invalid' as never)).toThrow(/Unsupported chain/);
  });
});

// ─── client.ts ────────────────────────────────────────────────────────────────

describe('getTierFromScore', () => {
  test.each([
    [0,  'Unranked'],
    [19, 'Unranked'],
    [20, 'Bronze'],
    [39, 'Bronze'],
    [40, 'Silver'],
    [59, 'Silver'],
    [60, 'Gold'],
    [79, 'Gold'],
    [80, 'Platinum'],
    [95, 'Platinum'],
  ])('score %i => %s', (score, expected) => {
    expect(getTierFromScore(score)).toBe(expected);
  });
});

describe('VaultfireClient', () => {
  const ADDRESS = '0xA054f831B562e729F8D268291EBde1B2EDcFb84F';

  test('constructs without error', () => {
    expect(() => new VaultfireClient({ chain: 'base' })).not.toThrow();
  });

  test('isRegistered returns true for mock', async () => {
    const client = new VaultfireClient({ chain: 'base' });
    const result = await client.isRegistered(ADDRESS);
    expect(result).toBe(true);
  });

  test('getStreetCred returns numeric score', async () => {
    const client = new VaultfireClient({ chain: 'base' });
    const score = await client.getStreetCred(ADDRESS);
    expect(typeof score).toBe('number');
    expect(score).toBe(65);
  });

  test('verifyAgent returns full trust object', async () => {
    const client = new VaultfireClient({ chain: 'base' });
    const result = await client.verifyAgent(ADDRESS);
    expect(result.address).toBe(ADDRESS);
    expect(result.isRegistered).toBe(true);
    expect(result.streetCred).toBe(65);
    expect(result.tier).toBe('Gold');
    expect(result.trustworthy).toBe(true);
    expect(result.summary).toContain('Street Cred');
  });

  test('registerAgent throws without private key', async () => {
    const client = new VaultfireClient({ chain: 'base' });
    await expect(
      client.registerAgent('TestAgent', 'analyst', ['analysis'])
    ).rejects.toThrow(/private key/i);
  });
});

// ─── tools.ts ────────────────────────────────────────────────────────────────

describe('createVaultfireTools', () => {
  const ADDRESS = '0xA054f831B562e729F8D268291EBde1B2EDcFb84F';

  test('returns all 9 tool objects', () => {
    const tools = createVaultfireTools({ chain: 'base' });
    const names = Object.keys(tools);
    expect(names).toContain('verifyAgent');
    expect(names).toContain('getStreetCred');
    expect(names).toContain('getAgent');
    expect(names).toContain('getBonds');
    expect(names).toContain('getReputation');
    expect(names).toContain('discoverAgents');
    expect(names).toContain('protocolStats');
    expect(names).toContain('registerAgent');
    expect(names).toContain('createBond');
    expect(names.length).toBe(9);
  });

  test('each tool has description, parameters, and execute', () => {
    const tools = createVaultfireTools({ chain: 'base' });
    for (const [name, tool] of Object.entries(tools)) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.execute).toBe('function');
      // Parameters should be a zod schema
      expect(tool.parameters).toHaveProperty('_def');
    }
  });

  test('verifyAgent.execute returns trust data', async () => {
    const tools = createVaultfireTools({ chain: 'base' });
    const result = await tools.verifyAgent.execute({ address: ADDRESS }) as Record<string, unknown>;
    expect(result.streetCred).toBe(65);
    expect(result.tier).toBe('Gold');
    expect(result.trustworthy).toBe(true);
    expect(result.chain).toBe('base');
  });

  test('getStreetCred.execute returns score and tier', async () => {
    const tools = createVaultfireTools({ chain: 'base' });
    const result = await tools.getStreetCred.execute({ address: ADDRESS }) as Record<string, unknown>;
    expect(result.streetCred).toBe(65);
    expect(result.tier).toBe('Gold');
  });

  test('getAgent.execute returns agent data', async () => {
    const tools = createVaultfireTools({ chain: 'base' });
    const result = await tools.getAgent.execute({ address: ADDRESS }) as Record<string, unknown>;
    expect(result.name).toBe('TestAgent');
    expect(result.role).toBe('analyst');
    expect(result.registered).toBe(true);
  });

  test('getBonds.execute returns bond list', async () => {
    const tools = createVaultfireTools({ chain: 'base' });
    const result = await tools.getBonds.execute({ address: ADDRESS }) as Record<string, unknown>;
    expect(result.totalBonds).toBe(1);
    expect(result.activeBonds).toBe(1);
  });

  test('getReputation.execute returns reputation data', async () => {
    const tools = createVaultfireTools({ chain: 'base' });
    const result = await tools.getReputation.execute({ address: ADDRESS }) as Record<string, unknown>;
    expect(result.streetCred).toBe(65);
    expect(result.breakdown).toBeTruthy();
  });

  test('discoverAgents.execute returns addresses', async () => {
    const tools = createVaultfireTools({ chain: 'base' });
    const result = await tools.discoverAgents.execute({ capability: 'analysis' }) as Record<string, unknown>;
    expect(result.capability).toBe('analysis');
    expect(Array.isArray(result.agents)).toBe(true);
  });

  test('protocolStats.execute returns stats', async () => {
    const tools = createVaultfireTools({ chain: 'base' });
    const result = await tools.protocolStats.execute({}) as Record<string, unknown>;
    expect(result.totalAgents).toBe(142);
    expect(result.totalBonds).toBe(89);
  });

  test('parameters are valid zod schemas', () => {
    const tools = createVaultfireTools({ chain: 'base' });
    // verifyAgent params: { address: string }
    const parsed = tools.verifyAgent.parameters.safeParse({ address: '0xabc' });
    expect(parsed.success).toBe(true);
    const bad = tools.verifyAgent.parameters.safeParse({ address: 123 });
    expect(bad.success).toBe(false);
  });

  test('works with avalanche chain', () => {
    const tools = createVaultfireTools({ chain: 'avalanche' });
    expect(tools).toBeDefined();
    expect(Object.keys(tools).length).toBe(9);
  });
});

// ─── middleware.ts ────────────────────────────────────────────────────────────

describe('vaultfireTrustMiddleware', () => {
  const ADDRESS = '0xA054f831B562e729F8D268291EBde1B2EDcFb84F';

  test('returns middleware with wrapGenerate and wrapStream', () => {
    const mw = vaultfireTrustMiddleware({
      chain: 'base',
      agentAddress: ADDRESS,
      minScore: 40,
    });
    expect(typeof mw.wrapGenerate).toBe('function');
    expect(typeof mw.wrapStream).toBe('function');
  });

  test('wrapGenerate passes when score meets minimum', async () => {
    const mw = vaultfireTrustMiddleware({
      chain: 'base',
      agentAddress: ADDRESS,
      minScore: 40, // score is 65, should pass
    });

    const mockDoGenerate = jest.fn().mockResolvedValue({ text: 'Hello!' });
    const params = { system: 'You are a helpful assistant.' };

    const result = await mw.wrapGenerate!({
      doGenerate: mockDoGenerate,
      params,
    });

    expect(mockDoGenerate).toHaveBeenCalled();
    expect(result).toEqual({ text: 'Hello!' });
  });

  test('wrapGenerate throws when score is below minimum', async () => {
    // Override mock to return low score
    const { ethers } = require('ethers');
    const mockLowScoreContract = {
      ...ethers.Contract.mock.results[0]?.value,
      isRegistered: jest.fn().mockResolvedValue(true),
      getStreetCred: jest.fn().mockResolvedValue(BigInt(10)),
      getTier: jest.fn().mockResolvedValue('Unranked'),
      getFullReputation: jest.fn().mockResolvedValue({
        streetCred: BigInt(10),
        tier: 'Unranked',
        identityScore: BigInt(5),
        partnershipScore: BigInt(3),
        accountabilityScore: BigInt(1),
        activityScore: BigInt(1),
        longevityScore: BigInt(0),
      }),
      getReputation: jest.fn().mockResolvedValue(null),
      getBonds: jest.fn().mockResolvedValue([]),
      getAgent: jest.fn().mockResolvedValue({
        addr: ADDRESS,
        name: 'LowTrustAgent',
        role: 'unknown',
        capabilities: [],
        registeredAt: BigInt(1700000000),
        active: true,
      }),
    };
    ethers.Contract.mockImplementationOnce(() => mockLowScoreContract)
                   .mockImplementationOnce(() => mockLowScoreContract)
                   .mockImplementationOnce(() => mockLowScoreContract)
                   .mockImplementationOnce(() => mockLowScoreContract);

    const mw = vaultfireTrustMiddleware({
      chain: 'base',
      agentAddress: ADDRESS,
      minScore: 40,
      injectContext: false,
    });

    const mockDoGenerate = jest.fn().mockResolvedValue({ text: 'Hello!' });
    await expect(
      mw.wrapGenerate!({ doGenerate: mockDoGenerate, params: {} })
    ).rejects.toThrow(/Trust gate blocked/);

    expect(mockDoGenerate).not.toHaveBeenCalled();
  });

  test('onTrustFailure callback can allow blocked calls', async () => {
    const { ethers } = require('ethers');
    const mockLowScoreContract = {
      isRegistered: jest.fn().mockResolvedValue(true),
      getStreetCred: jest.fn().mockResolvedValue(BigInt(5)),
      getTier: jest.fn().mockResolvedValue('Unranked'),
      getFullReputation: jest.fn().mockResolvedValue({
        streetCred: BigInt(5),
        tier: 'Unranked',
        identityScore: BigInt(5),
        partnershipScore: BigInt(0),
        accountabilityScore: BigInt(0),
        activityScore: BigInt(0),
        longevityScore: BigInt(0),
      }),
      getReputation: jest.fn().mockResolvedValue(null),
      getBonds: jest.fn().mockResolvedValue([]),
      getAgent: jest.fn().mockResolvedValue({
        addr: ADDRESS,
        name: 'Override',
        role: 'unknown',
        capabilities: [],
        registeredAt: BigInt(1700000000),
        active: true,
      }),
    };
    ethers.Contract.mockImplementation(() => mockLowScoreContract);

    const onTrustFailure = jest.fn().mockReturnValue(true); // allow anyway

    const mw = vaultfireTrustMiddleware({
      chain: 'base',
      agentAddress: ADDRESS,
      minScore: 40,
      onTrustFailure,
      injectContext: false,
    });

    const mockDoGenerate = jest.fn().mockResolvedValue({ text: 'Allowed!' });
    const result = await mw.wrapGenerate!({ doGenerate: mockDoGenerate, params: {} });

    expect(onTrustFailure).toHaveBeenCalled();
    expect(mockDoGenerate).toHaveBeenCalled();
    expect(result).toEqual({ text: 'Allowed!' });
  });

  test('injects trust context into system prompt', async () => {
    // Reset mock to high-score
    const { ethers } = require('ethers');
    ethers.Contract.mockImplementation(() => ({
      isRegistered: jest.fn().mockResolvedValue(true),
      getStreetCred: jest.fn().mockResolvedValue(BigInt(65)),
      getTier: jest.fn().mockResolvedValue('Gold'),
      getFullReputation: jest.fn().mockResolvedValue({
        streetCred: BigInt(65),
        tier: 'Gold',
        identityScore: BigInt(28),
        partnershipScore: BigInt(20),
        accountabilityScore: BigInt(10),
        activityScore: BigInt(5),
        longevityScore: BigInt(2),
      }),
      getReputation: jest.fn().mockResolvedValue(null),
      getBonds: jest.fn().mockResolvedValue([]),
      getAgent: jest.fn().mockResolvedValue({
        addr: ADDRESS,
        name: 'TrustAgent',
        role: 'analyst',
        capabilities: ['analysis'],
        registeredAt: BigInt(1700000000),
        active: true,
      }),
    }));

    const mw = vaultfireTrustMiddleware({
      chain: 'base',
      agentAddress: ADDRESS,
      minScore: 40,
      injectContext: true,
    });

    const mockDoGenerate = jest.fn().mockResolvedValue({});
    const params = { system: 'Original system prompt.' };

    await mw.wrapGenerate!({ doGenerate: mockDoGenerate, params });

    expect(params.system).toContain('[Vaultfire Trust Context]');
    expect(params.system).toContain('Street Cred');
    expect(params.system).toContain('Original system prompt.');
  });
});
