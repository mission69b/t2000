import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Docs — t2000',
  description: 'Developer documentation for t2000 CLI, SDK, MCP, and Engine.',
};

export default function DocsPage() {
  redirect('https://audric.ai/docs');
}
