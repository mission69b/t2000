'use client';

import { useState, useEffect } from 'react';

interface SectionLink {
  id: string;
  label: string;
}

export function SpecSidebar({ sections }: { sections: SectionLink[] }) {
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px' },
    );

    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="sticky top-6 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted mb-3">
        On this page
      </div>
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className={`block text-[11px] py-1 transition-colors ${
            activeId === s.id
              ? 'text-accent'
              : 'text-dim hover:text-muted'
          }`}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
