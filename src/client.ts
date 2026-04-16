/**
 * VaultfireClient — ethers.js wrapper for Vaultfire Protocol contracts
 */

import { ethers } from 'ethers';
import { getChainConfig, SupportedChain } from './chains';
import {
  IDENTITY_ABI,
  PARTNERSHIP_ABI,
  ACCOUNTABILITY_ABI,
  REPUTATION_ABI,
} from './abis';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentData {
  addr: string;
  name: string;
  role: string;
  capabilities: string[];
  registeredAt: bigint;
  active: boolean;
}

export interface BondData {
  agent1: string;
  agent2: string;
  strength: bigint;
  createdAt: bigint;
  active: boolean;
}

export interface ReputationData {
  agent: string;
  score: bigint;
  positiveActions: bigint;
  negativeActions: bigint;
  lastUpdated: bigint;
}

export interface FullReputation {
  streetCred: bigint;
  tier: string;
  identityScore: bigint;
  partnershipScore: bigint;
  accountabilityScore: bigint;
  activityScore: bigint;
  longevityScore: bigint;
}

export interface ProtocolStats {
  totalAgents: bigint;
  totalBonds: bigint;
  totalReputationEvents: bigint;
  deployedAt: bigint;
}

export interface TrustVerification {
  address: string;
  isRegistered: boolean;
  streetCred: number;
  tier: string;
  fullReputation?: FullReputation;
  agent?: AgentData;
  bonds?: BondData[];
  trustworthy: boolean;
  summary: string;
}

// ─── Score helpers ─────────────────────────────────────────────────────────────

export function getTierFromScore(score: number): string {
  if (score >= 80) return 'Platinum';
  if (score >= 60) return 'Gold';
  if (score >= 40) return 'Silver';
  if (score >= 20) return 'Bronze';
  return 'Unranked';
}

// ─── Client ───────────────────────────────────────────────────────────────────

export interface VaultfireClientOptions {
  chain: SupportedChain;
  /** Optional private key for write operations (use process.env.PRIVATE_KEY) */
  privateKey?: string;
  /** Override RPC URL */
  rpcUrl?: string;
}

export class VaultfireClient {
  public readonly chain: SupportedChain;
  private provider: ethers.JsonRpcProvider;
  private signer?: ethers.Wallet;

  private identityContract: ethers.Contract;
  private partnershipContract: ethers.Contract;
  private accountabilityContract: ethers.Contract;
  private reputationContract: ethers.Contract;

  constructor(options: VaultfireClientOptions) {
    const chainConfig = getChainConfig(options.chain);
    this.chain = options.chain;

    const rpcUrl = options.rpcUrl ?? chainConfig.rpcUrl;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    if (options.privateKey) {
      this.signer = new ethers.Wallet(options.privateKey, this.provider);
    }

    const runner = this.signer ?? this.provider;

    this.identityContract = new ethers.Contract(
      chainConfig.contracts.identity,
      IDENTITY_ABI,
      runner,
    );
    this.partnershipContract = new ethers.Contract(
      chainConfig.contracts.partnership,
      PARTNERSHIP_ABI,
      runner,
    );
    this.accountabilityContract = new ethers.Contract(
      chainConfig.contracts.accountability,
      ACCOUNTABILITY_ABI,
      runner,
    );
    this.reputationContract = new ethers.Contract(
      chainConfig.contracts.reputation,
      REPUTATION_ABI,
      runner,
    );
  }

  // ─── Read operations ─────────────────────────────────────────────────────

  async isRegistered(address: string): Promise<boolean> {
    return this.identityContract.isRegistered(address);
  }

  async getAgent(address: string): Promise<AgentData> {
    return this.identityContract.getAgent(address);
  }

  async getStreetCred(address: string): Promise<number> {
    const score: bigint = await this.reputationContract.getStreetCred(address);
    return Number(score);
  }

  async getTier(address: string): Promise<string> {
    return this.reputationContract.getTier(address);
  }

  async getFullReputation(address: string): Promise<FullReputation> {
    return this.reputationContract.getFullReputation(address);
  }

  async getReputation(address: string): Promise<ReputationData> {
    return this.accountabilityContract.getReputation(address);
  }

  async getBonds(address: string): Promise<BondData[]> {
    return this.partnershipContract.getBonds(address);
  }

  async getBondStrength(agent1: string, agent2: string): Promise<number> {
    const strength: bigint = await this.partnershipContract.getBondStrength(agent1, agent2);
    return Number(strength);
  }

  async getAgentsByCapability(capability: string): Promise<string[]> {
    return this.identityContract.getAgentsByCapability(capability);
  }

  async protocolStats(): Promise<ProtocolStats> {
    return this.reputationContract.protocolStats();
  }

  /**
   * Full trust verification — aggregates all available on-chain data
   */
  async verifyAgent(address: string): Promise<TrustVerification> {
    const [registered, streetCred] = await Promise.all([
      this.isRegistered(address).catch(() => false),
      this.getStreetCred(address).catch(() => 0),
    ]);

    if (!registered) {
      return {
        address,
        isRegistered: false,
        streetCred: 0,
        tier: 'Unranked',
        trustworthy: false,
        summary: `Agent ${address} is not registered on the Vaultfire Protocol (${this.chain}).`,
      };
    }

    const [agent, bonds, fullReputation] = await Promise.all([
      this.getAgent(address).catch(() => undefined),
      this.getBonds(address).catch(() => []),
      this.getFullReputation(address).catch(() => undefined),
    ]);

    const tier = getTierFromScore(streetCred);
    const trustworthy = streetCred >= 40;

    const activeBonds = bonds.filter((b) => b.active);
    const summary = [
      `Agent: ${agent?.name ?? address} (${agent?.role ?? 'unknown role'})`,
      `Street Cred: ${streetCred}/95 — ${tier}`,
      `Active bonds: ${activeBonds.length}`,
      `Capabilities: ${agent?.capabilities?.join(', ') ?? 'none listed'}`,
      `Trust status: ${trustworthy ? 'TRUSTED' : 'NOT TRUSTED'}`,
    ].join(' | ');

    return {
      address,
      isRegistered: true,
      streetCred,
      tier,
      fullReputation,
      agent,
      bonds,
      trustworthy,
      summary,
    };
  }

  // ─── Write operations (require privateKey) ───────────────────────────────

  private requireSigner(): ethers.Wallet {
    if (!this.signer) {
      throw new Error(
        'Write operations require a private key. Pass privateKey: process.env.PRIVATE_KEY to VaultfireClient.',
      );
    }
    return this.signer;
  }

  async registerAgent(
    name: string,
    role: string,
    capabilities: string[],
  ): Promise<string> {
    this.requireSigner();
    const tx = await this.identityContract.registerAgent(name, role, capabilities);
    const receipt = await tx.wait();
    return receipt.hash as string;
  }

  async createBond(partnerAddress: string, strength: number): Promise<string> {
    this.requireSigner();
    const tx = await this.partnershipContract.createBond(partnerAddress, strength);
    const receipt = await tx.wait();
    return receipt.hash as string;
  }
}
