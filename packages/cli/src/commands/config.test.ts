import { describe, it, expect } from 'vitest';
import { getNestedValue, setNestedValue } from './config.js';

describe('getNestedValue', () => {
  it('gets top-level value', () => {
    expect(getNestedValue({ foo: 'bar' }, 'foo')).toBe('bar');
  });

  it('gets nested value with dot notation', () => {
    expect(getNestedValue({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });

  it('returns undefined for missing key', () => {
    expect(getNestedValue({ foo: 'bar' }, 'baz')).toBeUndefined();
  });

  it('returns undefined for missing nested key', () => {
    expect(getNestedValue({ a: { b: 1 } }, 'a.c')).toBeUndefined();
  });

  it('returns undefined when traversing through non-object', () => {
    expect(getNestedValue({ a: 'string' }, 'a.b')).toBeUndefined();
  });

  it('returns undefined when traversing through null', () => {
    expect(getNestedValue({ a: null } as Record<string, unknown>, 'a.b')).toBeUndefined();
  });

  it('gets object value', () => {
    const obj = { a: { nested: true } };
    expect(getNestedValue(obj, 'a')).toEqual({ nested: true });
  });
});

describe('setNestedValue', () => {
  it('sets top-level value', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'foo', 'bar');
    expect(obj.foo).toBe('bar');
  });

  it('sets nested value, creating intermediate objects', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b.c', 42);
    expect((obj as { a: { b: { c: number } } }).a.b.c).toBe(42);
  });

  it('overwrites existing nested value', () => {
    const obj: Record<string, unknown> = { a: { b: { c: 1 } } };
    setNestedValue(obj, 'a.b.c', 99);
    expect((obj as { a: { b: { c: number } } }).a.b.c).toBe(99);
  });

  it('overwrites non-object intermediate with object', () => {
    const obj: Record<string, unknown> = { a: 'string' };
    setNestedValue(obj, 'a.b', 42);
    expect((obj as { a: { b: number } }).a.b).toBe(42);
  });

  it('preserves sibling values', () => {
    const obj: Record<string, unknown> = { a: { x: 1 } };
    setNestedValue(obj, 'a.y', 2);
    expect((obj as { a: { x: number; y: number } }).a.x).toBe(1);
    expect((obj as { a: { x: number; y: number } }).a.y).toBe(2);
  });

  it('handles single key (no dots)', () => {
    const obj: Record<string, unknown> = { existing: true };
    setNestedValue(obj, 'new', 'value');
    expect(obj.new).toBe('value');
    expect(obj.existing).toBe(true);
  });
});
