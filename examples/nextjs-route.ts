/**
 * Next.js API Route Example
 *
 * Demonstrates using @vaultfire/vercel-ai in a Next.js App Router API route
 * with streaming responses and trust-gated agents.
 *
 * File: app/api/chat/route.ts
 *
 * Setup:
 *   npm install ai @ai-sdk/openai @vaultfire/vercel-ai
 *   Add to .env.local:
 *     OPENAI_API_KEY=sk-...
 *     VAULTFIRE_AGENT_ADDRESS=0x...
 */

// ─── Standard Next.js App Router pattern ─────────────────────────────────────
//
// import { streamText, wrapLanguageModel, tool } from 'ai';
// import { openai } from '@ai-sdk/openai';
// import { createVaultfireTools, vaultfireTrustMiddleware } from '@vaultfire/vercel-ai';
//
// export const runtime = 'nodejs';
// export const maxDuration = 30;
//
// export async function POST(req: Request) {
//   const { messages, agentAddress } = await req.json();
//
//   // Create trust middleware for the calling agent
//   const trustMiddleware = vaultfireTrustMiddleware({
//     chain: 'base',
//     agentAddress: agentAddress ?? process.env.VAULTFIRE_AGENT_ADDRESS!,
//     minScore: 40,      // Silver tier minimum
//     injectContext: true,
//   });
//
//   // Wrap the model with trust gating
//   const trustedModel = wrapLanguageModel({
//     model: openai('gpt-4o'),
//     middleware: trustMiddleware,
//   });
//
//   // Create Vaultfire on-chain tools
//   const vaultfireTools = createVaultfireTools({ chain: 'base' });
//
//   // Wrap tools with AI SDK's tool() function
//   const aiTools = Object.fromEntries(
//     Object.entries(vaultfireTools).map(([name, def]) => [name, tool(def)])
//   );
//
//   // Stream response
//   const result = await streamText({
//     model: trustedModel,
//     system: 'You are a helpful AI assistant with access to the Vaultfire Protocol for agent trust verification.',
//     messages,
//     tools: aiTools,
//     maxSteps: 5, // Allow multi-step tool use
//     onError: (error) => {
//       // Trust gate failures surface here
//       console.error('Stream error:', error);
//     },
//   });
//
//   return result.toDataStreamResponse();
// }

// ─── Pages Router pattern (pages/api/chat.ts) ─────────────────────────────────
//
// import type { NextApiRequest, NextApiResponse } from 'next';
// import { generateText, wrapLanguageModel } from 'ai';
// import { openai } from '@ai-sdk/openai';
// import { vaultfireTrustMiddleware, createVaultfireTools } from '@vaultfire/vercel-ai';
//
// export default async function handler(req: NextApiRequest, res: NextApiResponse) {
//   if (req.method !== 'POST') return res.status(405).end();
//
//   const { prompt, agentAddress } = req.body;
//
//   try {
//     const trustedModel = wrapLanguageModel({
//       model: openai('gpt-4o-mini'),
//       middleware: vaultfireTrustMiddleware({
//         chain: 'base',
//         agentAddress,
//         minScore: 40,
//       }),
//     });
//
//     const tools = createVaultfireTools({ chain: 'base' });
//
//     const result = await generateText({
//       model: trustedModel,
//       tools: Object.fromEntries(
//         Object.entries(tools).map(([name, def]) => [name, tool(def)])
//       ),
//       prompt,
//     });
//
//     return res.json({ text: result.text, toolCalls: result.toolCalls });
//
//   } catch (err: unknown) {
//     const message = err instanceof Error ? err.message : String(err);
//     // Trust gate failure produces a descriptive error
//     if (message.includes('Trust gate blocked')) {
//       return res.status(403).json({ error: message });
//     }
//     return res.status(500).json({ error: 'Internal server error' });
//   }
// }

// ─── Edge Runtime pattern ─────────────────────────────────────────────────────
//
// Note: Vaultfire uses ethers.js which requires Node.js crypto APIs.
// Use runtime = 'nodejs' for full functionality.
// For Edge Runtime, call a separate Node.js API to do the trust check.

// ─── Tool usage example ───────────────────────────────────────────────────────
//
// Client-side fetch:
//
// const response = await fetch('/api/chat', {
//   method: 'POST',
//   headers: { 'Content-Type': 'application/json' },
//   body: JSON.stringify({
//     messages: [{ role: 'user', content: 'Is agent 0xA054...b84F trustworthy?' }],
//     agentAddress: '0xA054f831B562e729F8D268291EBde1B2EDcFb84F',
//   }),
// });

// ─── Standalone demo (runs in Node.js without Next.js) ───────────────────────

import { createVaultfireTools, vaultfireTrustMiddleware } from '../src/index';

async function demoNextjsRoute() {
  console.log('=== Next.js Route Demo ===\n');

  const AGENT = '0xA054f831B562e729F8D268291EBde1B2EDcFb84F';

  // 1. Create middleware (would wrap model in real Next.js route)
  const middleware = vaultfireTrustMiddleware({
    chain: 'base',
    agentAddress: AGENT,
    minScore: 40,
    injectContext: true,
  });

  console.log('✓ Trust middleware created');
  console.log('  wrapGenerate:', typeof middleware.wrapGenerate);
  console.log('  wrapStream:', typeof middleware.wrapStream);

  // 2. Create tools (would be passed to generateText/streamText)
  const tools = createVaultfireTools({ chain: 'base' });
  const toolNames = Object.keys(tools);

  console.log('\n✓ Vaultfire tools created:', toolNames.join(', '));

  // 3. Show how tools would be used in Next.js route
  console.log('\nIn your Next.js App Router route (app/api/chat/route.ts):');
  console.log(`
  const result = await streamText({
    model: wrapLanguageModel({ model: openai('gpt-4o'), middleware }),
    tools: Object.fromEntries(
      Object.entries(tools).map(([name, def]) => [name, tool(def)])
    ),
    messages,
  });
  return result.toDataStreamResponse();
  `);
}

demoNextjsRoute().catch(console.error);
