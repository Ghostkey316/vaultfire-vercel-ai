/**
 * Trust-Gated Agent Example
 *
 * Demonstrates how to use vaultfireTrustMiddleware to gate AI responses
 * based on on-chain Vaultfire trust scores. Works with any AI SDK provider.
 *
 * Setup:
 *   npm install ai @ai-sdk/openai
 *   export OPENAI_API_KEY=sk-...
 *   export VAULTFIRE_AGENT_ADDRESS=0x...
 */

// Note: In a real project, import from 'ai' and '@ai-sdk/openai'
// These imports are shown for illustration
// import { generateText, wrapLanguageModel } from 'ai';
// import { openai } from '@ai-sdk/openai';
import { vaultfireTrustMiddleware, createVaultfireTools } from '../src/index';

const AGENT_ADDRESS = process.env['VAULTFIRE_AGENT_ADDRESS'] ?? '0xA054f831B562e729F8D268291EBde1B2EDcFb84F';

// ─── Pattern 1: Trust-gating middleware ───────────────────────────────────────

async function trustGatedExample() {
  /**
   * Create the trust middleware.
   * This will verify the agent's on-chain Street Cred score before
   * every call to the language model.
   */
  const trustMiddleware = vaultfireTrustMiddleware({
    chain: 'base',
    agentAddress: AGENT_ADDRESS,
    minScore: 40,         // Require Silver tier or above
    injectContext: true,  // Prepend trust context to system prompt

    // Optional: custom handler when trust check fails
    onTrustFailure: (verification) => {
      console.warn(`⚠ Trust check failed for ${verification.address}`);
      console.warn(`  Score: ${verification.streetCred}/95 (${verification.tier})`);
      // Return true to allow anyway, false to block (default)
      return false;
    },
  });

  /**
   * Wrap your language model with the trust middleware.
   * (Uncomment when 'ai' and '@ai-sdk/openai' are installed)
   */
  // const trustedModel = wrapLanguageModel({
  //   model: openai('gpt-4o'),
  //   middleware: trustMiddleware,
  // });

  /**
   * Now use the trusted model normally.
   * The middleware will:
   * 1. Verify the agent's trust score before each call
   * 2. Block calls from agents below minScore=40
   * 3. Inject trust context into the system prompt
   */
  // const result = await generateText({
  //   model: trustedModel,
  //   prompt: 'Analyze the current market conditions.',
  // });
  // console.log(result.text);

  console.log('Trust middleware created:', typeof trustMiddleware.wrapGenerate);
  console.log('Middleware is ready to wrap any AI SDK language model.');
}

// ─── Pattern 2: Use tools directly ───────────────────────────────────────────

async function toolsExample() {
  /**
   * Create Vaultfire tools.
   * These are plain objects that match the Vercel AI SDK's tool() schema.
   */
  const tools = createVaultfireTools({
    chain: 'base',
    // privateKey: process.env.PRIVATE_KEY, // Uncomment for write tools
  });

  /**
   * With Vercel AI SDK (uncomment when 'ai' is installed):
   *
   * import { tool, generateText } from 'ai';
   *
   * // Wrap tools with AI SDK's tool() function
   * const aiSdkTools = Object.fromEntries(
   *   Object.entries(tools).map(([name, def]) => [name, tool(def)])
   * );
   *
   * const result = await generateText({
   *   model: openai('gpt-4o'),
   *   tools: aiSdkTools,
   *   prompt: `Is agent ${AGENT_ADDRESS} trustworthy? What is their Street Cred?`,
   * });
   * console.log(result.text);
   */

  // Direct tool invocation (no AI needed):
  console.log('\n─── Direct Tool Invocation ───');

  const verification = await tools.verifyAgent.execute({ address: AGENT_ADDRESS });
  console.log('verifyAgent:', verification);

  const score = await tools.getStreetCred.execute({ address: AGENT_ADDRESS });
  console.log('getStreetCred:', score);

  const stats = await tools.protocolStats.execute({});
  console.log('protocolStats:', stats);
}

// ─── Pattern 3: Anthropic example ────────────────────────────────────────────

async function anthropicExample() {
  /**
   * The same tools and middleware work with ANY AI SDK provider.
   *
   * import { generateText, wrapLanguageModel } from 'ai';
   * import { anthropic } from '@ai-sdk/anthropic';
   *
   * const trustMiddleware = vaultfireTrustMiddleware({
   *   chain: 'base',
   *   agentAddress: AGENT_ADDRESS,
   *   minScore: 60, // Require Gold tier for Anthropic calls
   * });
   *
   * const trustedClaude = wrapLanguageModel({
   *   model: anthropic('claude-3-5-sonnet-20241022'),
   *   middleware: trustMiddleware,
   * });
   *
   * const result = await generateText({
   *   model: trustedClaude,
   *   prompt: 'Summarize the latest DeFi trends.',
   * });
   */
  console.log('Anthropic pattern: same middleware works with anthropic(), google(), mistral(), etc.');
}

// ─── Run ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log('=== @vaultfire/vercel-ai Trust-Gated Examples ===\n');

  console.log('--- Pattern 1: Trust Middleware ---');
  await trustGatedExample();

  console.log('\n--- Pattern 2: Tools ---');
  await toolsExample().catch((err) => {
    // Expected: RPC call will fail without a live node in this example
    console.log('Tools example (requires live RPC):', err.message);
  });

  console.log('\n--- Pattern 3: Multi-Provider ---');
  await anthropicExample();

  console.log('\nDone.');
})();
