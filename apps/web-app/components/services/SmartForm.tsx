'use client';

import { useCallback, useState } from 'react';
import type { ServiceItem, ServiceField } from '@/lib/service-catalog';

interface SmartFormProps {
  service: ServiceItem;
  onSubmit: (service: ServiceItem, values: Record<string, string>) => void;
  onCancel: () => void;
}

export function SmartForm({ service, onSubmit, onCancel }: SmartFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const handleChange = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: false }));
  }, []);

  const handleSubmit = useCallback(() => {
    const newErrors: Record<string, boolean> = {};
    let hasError = false;

    for (const field of service.fields ?? []) {
      if (field.required && !values[field.name]?.trim()) {
        newErrors[field.name] = true;
        hasError = true;
      }
    }

    if (hasError) {
      setErrors(newErrors);
      return;
    }

    onSubmit(service, values);
  }, [service, values, onSubmit]);

  if (!service.fields?.length) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{service.icon}</span>
          <div>
            <p className="text-sm font-medium text-foreground">{service.name}</p>
            <p className="text-xs text-muted">{service.description}</p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="text-muted hover:text-foreground p-1"
          aria-label="Close"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-3">
        {service.fields.map((field) => (
          <FieldInput
            key={field.name}
            field={field}
            value={values[field.name] ?? ''}
            error={errors[field.name]}
            onChange={(v) => handleChange(field.name, v)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted font-mono">From {service.startingPrice}</span>
        <button
          onClick={handleSubmit}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-background transition hover:bg-accent/90 active:scale-[0.97]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: ServiceField;
  value: string;
  error?: boolean;
  onChange: (value: string) => void;
}) {
  const baseClass = [
    'w-full rounded-lg border bg-panel px-3 py-2.5 text-sm text-foreground placeholder:text-dim outline-none',
    error ? 'border-red-500/50 focus:border-red-500/50' : 'border-border focus:border-border-bright',
  ].join(' ');

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted">{field.label}</label>
      {field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={baseClass + ' resize-none'}
        />
      ) : field.type === 'select' && field.options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={baseClass + ' appearance-none'}
        >
          <option value="">{field.placeholder}</option>
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={baseClass}
        />
      )}
    </div>
  );
}
