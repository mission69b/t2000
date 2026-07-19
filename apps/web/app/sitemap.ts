import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://t2000.ai';
  const now = new Date();

  return [
    { url: `${base}/`,                lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/code`,            lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/agent-wallet`,    lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/agent-payments`,  lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/agent-sdk`,       lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/agent-id`,        lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/private-inference`,             lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/verify`,          lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/playground`,      lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
  ];
}
