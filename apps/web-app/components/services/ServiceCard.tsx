'use client';

import type { ServiceItem } from '@/lib/service-catalog';

interface ServiceCardProps {
  service: ServiceItem;
  onSelect: (service: ServiceItem) => void;
}

export function ServiceCard({ service, onSelect }: ServiceCardProps) {
  return (
    <button
      onClick={() => onSelect(service)}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-surface p-3 text-center transition hover:border-border-bright hover:bg-panel active:scale-[0.97]"
    >
      <span className="text-2xl">{service.icon}</span>
      <span className="text-xs font-medium leading-tight text-foreground">{service.name}</span>
    </button>
  );
}
