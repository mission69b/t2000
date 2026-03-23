'use client';

import { useCallback, useState } from 'react';
import {
  SERVICE_CATALOG,
  CATEGORY_META,
  getAllCategories,
  getServicesByCategory,
  type ServiceCategory,
  type ServiceItem,
} from '@/lib/service-catalog';
import { ServiceCard } from './ServiceCard';
import { SmartForm } from './SmartForm';

interface ServicesPanelProps {
  open: boolean;
  onClose: () => void;
  onServiceSubmit: (service: ServiceItem, values: Record<string, string>) => void;
}

export function ServicesPanel({ open, onClose, onServiceSubmit }: ServicesPanelProps) {
  const [activeCategory, setActiveCategory] = useState<ServiceCategory | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [search, setSearch] = useState('');

  const categories = getAllCategories();

  const handleBack = useCallback(() => {
    if (selectedService) {
      setSelectedService(null);
    } else if (activeCategory) {
      setActiveCategory(null);
    } else {
      onClose();
    }
  }, [selectedService, activeCategory, onClose]);

  const handleServiceSelect = useCallback((service: ServiceItem) => {
    setSelectedService(service);
  }, []);

  const handleFormSubmit = useCallback(
    (service: ServiceItem, values: Record<string, string>) => {
      onServiceSubmit(service, values);
      setSelectedService(null);
      setActiveCategory(null);
      onClose();
    },
    [onServiceSubmit, onClose],
  );

  const filteredServices = search.trim()
    ? SERVICE_CATALOG.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.description.toLowerCase().includes(search.toLowerCase()),
      )
    : activeCategory
      ? getServicesByCategory(activeCategory)
      : SERVICE_CATALOG;

  const title = selectedService
    ? selectedService.name
    : activeCategory
      ? CATEGORY_META[activeCategory].label
      : 'Services';

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-neutral-950 border-t border-neutral-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-neutral-400 hover:text-white transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {title}
          </button>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white p-1"
            aria-label="Close services"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Service form view */}
          {selectedService && (
            <SmartForm
              service={selectedService}
              onSubmit={handleFormSubmit}
              onCancel={() => setSelectedService(null)}
            />
          )}

          {/* Category / browse view */}
          {!selectedService && (
            <>
              {/* Category chips */}
              {!activeCategory && (
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className="rounded-full bg-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white transition active:scale-[0.97]"
                    >
                      {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
                    </button>
                  ))}
                </div>
              )}

              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search services..."
                className="w-full rounded-lg bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 outline-none focus:ring-1 focus:ring-neutral-700"
              />

              {/* Service grid */}
              <div className="grid grid-cols-4 gap-2">
                {filteredServices.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    onSelect={handleServiceSelect}
                  />
                ))}
              </div>

              {filteredServices.length === 0 && (
                <p className="text-center text-sm text-neutral-500 py-8">
                  No services found. Try a different search.
                </p>
              )}

              {/* Footer */}
              <p className="text-center text-xs text-neutral-600 pb-2">
                No accounts. No API keys. No sign-ups. Just tap and use.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
