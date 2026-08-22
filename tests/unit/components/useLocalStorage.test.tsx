import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLocalStorage } from '../../../src/hooks/useLocalStorage';

describe('useLocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts with the fallback value when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage('hidden-keywords', [] as string[]));
    expect(result.current[0]).toEqual([]);
  });

  it('persists updates under a versioned key', () => {
    const { result } = renderHook(() => useLocalStorage('hidden-keywords', [] as string[]));
    act(() => result.current[1](['ai-governance']));
    expect(result.current[0]).toEqual(['ai-governance']);
    const raw = window.localStorage.getItem('trendsignal:v1:hidden-keywords');
    expect(raw).toBe(JSON.stringify(['ai-governance']));
  });

  it('falls back to the default when the stored value is corrupted JSON', () => {
    window.localStorage.setItem('trendsignal:v1:hidden-keywords', '{not valid json');
    const { result } = renderHook(() => useLocalStorage('hidden-keywords', [] as string[]));
    expect(result.current[0]).toEqual([]);
  });

  it('reset() restores the fallback value', () => {
    // The write-back effect re-persists the fallback right after reset() removes the key,
    // so storage ends up holding the fallback's JSON rather than staying empty — what matters
    // is that the hook's returned value is back to the fallback.
    const { result } = renderHook(() => useLocalStorage('hidden-keywords', [] as string[]));
    act(() => result.current[1](['ai-governance']));
    act(() => result.current[2]());
    expect(result.current[0]).toEqual([]);
    expect(window.localStorage.getItem('trendsignal:v1:hidden-keywords')).toBe('[]');
  });

  it('keeps separate keys independent', () => {
    const { result: a } = renderHook(() => useLocalStorage('hidden-keywords', [] as string[]));
    const { result: b } = renderHook(() => useLocalStorage('hidden-sources', [] as string[]));
    act(() => a.current[1](['x']));
    expect(b.current[0]).toEqual([]);
  });
});
