import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Docs — t2000',
  description: 'Developer documentation for t2000 CLI, SDK, MCP, and Engine.',
};

export default function DocsPage() {
  redirect('https://github.com/mission69b/t2000#readme');
}
