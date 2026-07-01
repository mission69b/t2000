import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/blog';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://t2000.ai';
  const now = new Date();

  const posts: MetadataRoute.Sitemap = getAllPosts().map((p) => ({
    url: `${base}/blog/${p.slug}`,
    lastModified: p.date ? new Date(p.date) : now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [
    { url: `${base}/`,                lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/agent-wallet`,    lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/agent-payments`,  lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/agent-sdk`,       lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/agent-engine`,    lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/docs`,            lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/blog`,            lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    ...posts,
  ];
}
