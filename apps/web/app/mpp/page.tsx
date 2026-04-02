import { redirect } from 'next/navigation';

export const metadata = {
  title: 'MPP — Sui Machine Payment Protocol',
  description: 'The Sui Machine Payment Protocol specification and ecosystem.',
};

export default function MppPage() {
  redirect('https://suimpp.dev');
}
