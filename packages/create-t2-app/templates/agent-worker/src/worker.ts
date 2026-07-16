/**
 * The smallest useful agent: one router call, streamed to your terminal.
 *
 * `t2000/auto` routes each call to the cheapest capable model — the
 * `x-t2000-served-model` response header tells you which one served (and
 * `x-t2000-route-reason` tells you why), so every charge is auditable.
 *
 * Grow it from here: put a task loop around run(), add tools, or split
 * planning (strong model) from execution (cheap model) — see plans/README.md.
 */
import OpenAI from 'openai';

const apiKey = process.env.T2000_API_KEY;
if (!apiKey) {
  console.error(
    'Missing T2000_API_KEY. Create a free key at https://agents.t2000.ai/manage\n' +
      'then: export T2000_API_KEY=sk-...',
  );
  process.exit(1);
}

const client = new OpenAI({
  apiKey,
  baseURL: 'https://api.t2000.ai/v1',
});

async function run(task: string): Promise<void> {
  const { data: stream, response } = await client.chat.completions
    .create({
      model: 't2000/auto',
      stream: true,
      messages: [
        {
          role: 'system',
          content: 'You are a concise agent. Answer in a few sentences.',
        },
        { role: 'user', content: task },
      ],
    })
    .withResponse();

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
  }
  process.stdout.write('\n\n');

  const served = response.headers.get('x-t2000-served-model');
  const reason = response.headers.get('x-t2000-route-reason');
  if (served) {
    console.error(`served by ${served}${reason ? ` (${reason})` : ''}`);
  }
}

const task =
  process.argv.slice(2).join(' ') ||
  'Introduce yourself in two sentences and suggest one task I should automate with an agent worker.';

await run(task);
