/**
 * Contract ABIs for Vaultfire Protocol
 */

export const IDENTITY_ABI = [
  // Read
  'function getAgent(address agent) view returns (tuple(address addr, string name, string role, string[] capabilities, uint256 registeredAt, bool active))',
  'function isRegistered(address agent) view returns (bool)',
  'function getAgentsByCapability(string capability) view returns (address[])',
  'function totalAgents() view returns (uint256)',
  // Write
  'function registerAgent(string name, string role, string[] capabilities) returns (bool)',
  // Events
  'event AgentRegistered(address indexed agent, string name, string role)',
] as const;

export const PARTNERSHIP_ABI = [
  // Read
  'function getBond(address agent1, address agent2) view returns (tuple(address agent1, address agent2, uint256 strength, uint256 createdAt, bool active))',
  'function getBonds(address agent) view returns (tuple(address agent1, address agent2, uint256 strength, uint256 createdAt, bool active)[])',
  'function getBondStrength(address agent1, address agent2) view returns (uint256)',
  'function totalBonds() view returns (uint256)',
  // Write
  'function createBond(address partner, uint256 strength) returns (bool)',
  // Events
  'event BondCreated(address indexed agent1, address indexed agent2, uint256 strength)',
] as const;

export const ACCOUNTABILITY_ABI = [
  // Read
  'function getReputation(address agent) view returns (tuple(address agent, int256 score, uint256 positiveActions, uint256 negativeActions, uint256 lastUpdated))',
  'function getReputationScore(address agent) view returns (int256)',
  'function totalReputationEvents() view returns (uint256)',
] as const;

export const REPUTATION_ABI = [
  // Read
  'function getStreetCred(address agent) view returns (uint256)',
  'function getTier(address agent) view returns (string)',
  'function getFullReputation(address agent) view returns (tuple(uint256 streetCred, string tier, uint256 identityScore, uint256 partnershipScore, uint256 accountabilityScore, uint256 activityScore, uint256 longevityScore))',
  'function protocolStats() view returns (tuple(uint256 totalAgents, uint256 totalBonds, uint256 totalReputationEvents, uint256 deployedAt))',
] as const;

// Scoring breakdown:
// Identity verification:    max 30 pts
// Partnership bonds:        max 25 pts
// Accountability/history:   max 15 pts
// Activity level:           max 20 pts
// Protocol longevity:       max  5 pts
//                           ────────────
// Total Street Cred:        max 95 pts
//
// Tiers:
//   Unranked  :  0 – 19
//   Bronze    : 20 – 39
//   Silver    : 40 – 59
//   Gold      : 60 – 79
//   Platinum  : 80 – 95
