import { useState, useCallback, useEffect } from "react";

/** All localStorage-persisted editor settings, isolated to prevent re-renders in unrelated state */
export function useEditorSettings() {
  // === Arabic processing options ===
  const [arabicNumerals, setArabicNumerals] = useState(false);
  const [mirrorPunctuation, setMirrorPunctuation] = useState(false);

  // === Translation provider settings ===
  const [userGeminiKey, _setUserGeminiKey] = useState(() => {
    try { return localStorage.getItem('userGeminiKey') || ''; } catch { return ''; }
  });
  const setUserGeminiKey = useCallback((key: string) => {
    _setUserGeminiKey(key);
    try { if (key) localStorage.setItem('userGeminiKey', key); else localStorage.removeItem('userGeminiKey'); } catch {}
  }, []);

  const [aiModel, _setAiModel] = useState<string>(() => {
    try { return localStorage.getItem('aiModel') || 'gemini-2.5-flash'; } catch { return 'gemini-2.5-flash'; }
  });
  const setAiModel = useCallback((m: string) => {
    _setAiModel(m);
    try { localStorage.setItem('aiModel', m); } catch {}
  }, []);

  const [translationProvider, _setTranslationProvider] = useState<'gemini' | 'mymemory' | 'google'>(() => {
    try { return (localStorage.getItem('translationProvider') as 'gemini' | 'mymemory' | 'google') || 'gemini'; } catch { return 'gemini'; }
  });
  const setTranslationProvider = useCallback((p: 'gemini' | 'mymemory' | 'google') => {
    _setTranslationProvider(p);
    try { localStorage.setItem('translationProvider', p); } catch {}
  }, []);

  const [myMemoryEmail, _setMyMemoryEmail] = useState(() => {
    try { return localStorage.getItem('myMemoryEmail') || ''; } catch { return ''; }
  });
  const setMyMemoryEmail = useCallback((email: string) => {
    _setMyMemoryEmail(email);
    try { if (email) localStorage.setItem('myMemoryEmail', email); else localStorage.removeItem('myMemoryEmail'); } catch {}
  }, []);

  // === API usage counters ===
  const [myMemoryCharsUsed, setMyMemoryCharsUsed] = useState(() => {
    try {
      const stored = localStorage.getItem('myMemoryCharsUsed');
      const storedDate = localStorage.getItem('myMemoryCharsDate');
      const today = new Date().toDateString();
      if (storedDate === today && stored) return parseInt(stored, 10);
      return 0;
    } catch { return 0; }
  });
  const addMyMemoryChars = useCallback((chars: number) => {
    setMyMemoryCharsUsed(prev => {
      const newVal = prev + chars;
      try {
        localStorage.setItem('myMemoryCharsUsed', String(newVal));
        localStorage.setItem('myMemoryCharsDate', new Date().toDateString());
      } catch {}
      return newVal;
    });
  }, []);

  const [aiRequestsToday, setAiRequestsToday] = useState(() => {
    try {
      const stored = localStorage.getItem('aiRequestsToday');
      const storedDate = localStorage.getItem('aiRequestsDate');
      const today = new Date().toDateString();
      if (storedDate === today && stored) return parseInt(stored, 10);
      return 0;
    } catch { return 0; }
  });
  const [aiRequestsMonth, setAiRequestsMonth] = useState(() => {
    try {
      const stored = localStorage.getItem('aiRequestsMonth');
      const storedMonth = localStorage.getItem('aiRequestsMonthKey');
      const currentMonth = `${new Date().getFullYear()}-${new Date().getMonth()}`;
      if (storedMonth === currentMonth && stored) return parseInt(stored, 10);
      return 0;
    } catch { return 0; }
  });
  const addAiRequest = useCallback((count: number = 1) => {
    const today = new Date().toDateString();
    const currentMonth = `${new Date().getFullYear()}-${new Date().getMonth()}`;
    setAiRequestsToday(prev => {
      const newVal = prev + count;
      try {
        localStorage.setItem('aiRequestsToday', String(newVal));
        localStorage.setItem('aiRequestsDate', today);
      } catch {}
      return newVal;
    });
    setAiRequestsMonth(prev => {
      const newVal = prev + count;
      try {
        localStorage.setItem('aiRequestsMonth', String(newVal));
        localStorage.setItem('aiRequestsMonthKey', currentMonth);
      } catch {}
      return newVal;
    });
  }, []);

  // === NPC & line split settings ===
  const [rebalanceNewlines, _setRebalanceNewlines] = useState(() => {
    try { return localStorage.getItem('rebalanceNewlines') === 'true'; } catch { return false; }
  });
  const setRebalanceNewlines = useCallback((v: boolean) => {
    _setRebalanceNewlines(v);
    try { localStorage.setItem('rebalanceNewlines', String(v)); } catch {}
  }, []);

  const [npcMaxLines, _setNpcMaxLines] = useState(() => {
    try { const v = localStorage.getItem('npcMaxLines'); return v ? Number(v) : 2; } catch { return 2; }
  });
  const setNpcMaxLines = useCallback((v: number) => {
    const clamped = Math.max(1, Math.min(3, v));
    _setNpcMaxLines(clamped);
    try { localStorage.setItem('npcMaxLines', String(clamped)); } catch {}
  }, []);

  const [npcMode, _setNpcMode] = useState(() => {
    try { return localStorage.getItem('npcMode') === 'true'; } catch { return false; }
  });
  const setNpcMode = useCallback((v: boolean) => {
    _setNpcMode(v);
    try { localStorage.setItem('npcMode', String(v)); } catch {}
  }, []);

  const [npcSplitCharLimit, setNpcSplitCharLimit] = useState(() => {
    const saved = localStorage.getItem('npcSplitCharLimit');
    return saved ? Number(saved) : 37;
  });
  useEffect(() => {
    localStorage.setItem('npcSplitCharLimit', String(npcSplitCharLimit));
  }, [npcSplitCharLimit]);

  const [newlineSplitCharLimit, setNewlineSplitCharLimit] = useState(() => {
    const saved = localStorage.getItem('newlineSplitCharLimit');
    return saved ? Number(saved) : 42;
  });
  useEffect(() => {
    localStorage.setItem('newlineSplitCharLimit', String(newlineSplitCharLimit));
  }, [newlineSplitCharLimit]);

  // === Smart review auto-trigger ===
  const [autoSmartReview, _setAutoSmartReview] = useState(() => {
    try { return localStorage.getItem('autoSmartReview') === 'true'; } catch { return false; }
  });
  const setAutoSmartReview = useCallback((v: boolean) => {
    _setAutoSmartReview(v);
    try { localStorage.setItem('autoSmartReview', String(v)); } catch {}
  }, []);

  // === Translation Memory for improvements ===
  const [enhancedMemory, setEnhancedMemory] = useState<Record<string, { original: string; translation: string }>>(() => {
    try { const v = localStorage.getItem('enhancedMemory'); return v ? JSON.parse(v) : {}; } catch { return {}; }
  });

  const saveToEnhancedMemory = useCallback((key: string, original: string, translation: string) => {
    setEnhancedMemory(prev => {
      const next = { ...prev, [original.toLowerCase().trim()]: { original, translation } };
      try { localStorage.setItem('enhancedMemory', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return {
    arabicNumerals, setArabicNumerals,
    mirrorPunctuation, setMirrorPunctuation,
    userGeminiKey, setUserGeminiKey,
    aiModel, setAiModel,
    translationProvider, setTranslationProvider,
    myMemoryEmail, setMyMemoryEmail,
    myMemoryCharsUsed, addMyMemoryChars,
    aiRequestsToday, aiRequestsMonth, addAiRequest,
    rebalanceNewlines, setRebalanceNewlines,
    npcMaxLines, setNpcMaxLines,
    npcMode, setNpcMode,
    npcSplitCharLimit, setNpcSplitCharLimit,
    newlineSplitCharLimit, setNewlineSplitCharLimit,
    autoSmartReview, setAutoSmartReview,
    enhancedMemory, saveToEnhancedMemory,
  };
}
