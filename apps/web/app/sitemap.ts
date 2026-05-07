import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://t2000.ai';
  const now = new Date();

  return [
    { url: `${base}/`,           lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/docs`,       lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${base}/mpp`,        lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${base}/stats`,      lastModified: now, changeFrequency: 'daily',   priority: 0.6 },
    { url: `${base}/disclaimer`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/privacy`,    lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/security`,   lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/terms`,      lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ];
}
