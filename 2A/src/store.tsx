import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { defaultProfile, defaultSettings, initialMemories, isMemory } from './data';
import type { Memory, Profile, Settings } from './data';

interface DiaryState {
  memories: Memory[];
  profile: Profile;
  settings: Settings;
  feedback: { message: string; date: string }[];
}

interface SavorContext extends DiaryState {
  toast: { id: number; message: string } | null;
  notify: (message: string) => void;
  dismissToast: () => void;
  addMemory: (memory: Memory) => void;
  updateMemory: (id: string, changes: Partial<Memory>) => void;
  deleteMemory: (id: string) => void;
  updateProfile: (changes: Partial<Profile>) => void;
  updateSettings: (changes: Partial<Settings>) => void;
  importMemories: (memories: Memory[]) => number;
  saveFeedback: (message: string) => void;
}

const STORAGE_KEY = 'savor-diary-v1';
const Context = createContext<SavorContext | null>(null);

function loadDiary(): DiaryState {
  const defaults = { memories: initialMemories, profile: defaultProfile, settings: defaultSettings, feedback: [] };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaults;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.memories) || !parsed.memories.every(isMemory)) return defaults;
    return {
      memories: parsed.memories,
      profile: { ...defaultProfile, ...parsed.profile },
      settings: { ...defaultSettings, ...parsed.settings },
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
    };
  } catch {
    return defaults;
  }
}

export function SavorProvider({ children }: { children: ReactNode }) {
  const [diary, setDiary] = useState<DiaryState>(loadDiary);
  const [toast, setToast] = useState<SavorContext['toast']>(null);
  const notify = useCallback((message: string) => setToast({ id: Date.now(), message }), []);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(diary));
    } catch {
      notify('Storage is full or unavailable. Export your memories to keep a backup.');
    }
  }, [diary, notify]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const addMemory = useCallback((memory: Memory) => {
    setDiary((previous) => ({ ...previous, memories: [memory, ...previous.memories] }));
  }, []);

  const updateMemory = useCallback((id: string, changes: Partial<Memory>) => {
    setDiary((previous) => ({
      ...previous,
      memories: previous.memories.map((memory) => memory.id === id ? { ...memory, ...changes } : memory),
    }));
  }, []);

  const deleteMemory = useCallback((id: string) => {
    setDiary((previous) => ({ ...previous, memories: previous.memories.filter((memory) => memory.id !== id) }));
  }, []);

  const updateProfile = useCallback((changes: Partial<Profile>) => {
    setDiary((previous) => ({ ...previous, profile: { ...previous.profile, ...changes } }));
  }, []);

  const updateSettings = useCallback((changes: Partial<Settings>) => {
    setDiary((previous) => ({ ...previous, settings: { ...previous.settings, ...changes } }));
  }, []);

  const importMemories = useCallback((memories: Memory[]) => {
    const knownIds = new Set(diary.memories.map((memory) => memory.id));
    const additions = memories.filter((memory) => {
      if (knownIds.has(memory.id)) return false;
      knownIds.add(memory.id);
      return true;
    });
    setDiary((previous) => ({ ...previous, memories: [...additions, ...previous.memories] }));
    return additions.length;
  }, [diary.memories]);

  const saveFeedback = useCallback((message: string) => {
    setDiary((previous) => ({
      ...previous, feedback: [...previous.feedback, { message, date: new Date().toISOString() }],
    }));
  }, []);

  const value = useMemo(() => ({
    ...diary, toast, notify, dismissToast, addMemory, updateMemory, deleteMemory,
    updateProfile, updateSettings, importMemories, saveFeedback,
  }), [diary, toast, notify, dismissToast, addMemory, updateMemory, deleteMemory,
    updateProfile, updateSettings, importMemories, saveFeedback]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSavor() {
  const context = useContext(Context);
  if (!context) throw new Error('useSavor must be used within SavorProvider');
  return context;
}