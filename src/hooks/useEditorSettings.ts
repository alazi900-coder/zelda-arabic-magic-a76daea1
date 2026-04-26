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
    try { if (key) localStorage.setItem('userGeminiKey', key); else localStorage.removeItem('userGeminiKey'); } catch { /* localStorage unavailable - ignore */ }
  }, []);

  const DEAD_MODELS = ['z-ai/glm-4.6:free', 'z-ai/glm-4.6b-flash:free', 'z-ai/glm-4.5-air:free', 'openai/gpt-oss-120b:free'];

  const [aiModel, _setAiModel] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('aiModel') || 'gemini-2.5-flash';
      if (DEAD_MODELS.includes(saved)) {
        localStorage.setItem('aiModel', 'qwen/qwen-2.5-72b-instruct:free');
        return 'qwen/qwen-2.5-72b-instruct:free';
      }
      return saved;
    } catch { return 'gemini-2.5-flash'; }
  });
  const setAiModel = useCallback((m: string) => {
    _setAiModel(m);
    try { localStorage.setItem('aiModel', m); } catch { /* localStorage unavailable - ignore */ }
  }, []);

  const [translationProvider, _setTranslationProvider] = useState<'gemini' | 'mymemory' | 'google' | 'deepseek' | 'groq' | 'openrouter'>(() => {
    try { return (localStorage.getItem('translationProvider') as 'gemini' | 'mymemory' | 'google' | 'deepseek' | 'groq' | 'openrouter') || 'gemini'; } catch { return 'gemini'; }
  });
  const setTranslationProvider = useCallback((p: 'gemini' | 'mymemory' | 'google' | 'deepseek' | 'groq' | 'openrouter') => {
    _setTranslationProvider(p);
    try { localStorage.setItem('translationProvider', p); } catch { /* localStorage unavailable - ignore */ }
  }, []);

  // OpenRouter (free GLM-4.6 access)
  const [userOpenRouterKey, _setUserOpenRouterKey] = useState(() => {
    try { return localStorage.getItem('userOpenRouterKey') || ''; } catch { return ''; }
  });
  const setUserOpenRouterKey = useCallback((key: string) => {
    _setUserOpenRouterKey(key);
    try { if (key) localStorage.setItem('userOpenRouterKey', key); else localStorage.removeItem('userOpenRouterKey'); } catch { /* localStorage unavailable - ignore */ }
  }, []);

  const [userDeepSeekKey, _setUserDeepSeekKey] = useState(() => {
    try { return localStorage.getItem('userDeepSeekKey') || ''; } catch { return ''; }
  });
  const setUserDeepSeekKey = useCallback((key: string) => {
    _setUserDeepSeekKey(key);
    try { if (key) localStorage.setItem('userDeepSeekKey', key); else localStorage.removeItem('userDeepSeekKey'); } catch { /* localStorage unavailable - ignore */ }
  }, []);

  const [userGroqKey, _setUserGroqKey] = useState(() => {
    try { return localStorage.getItem('userGroqKey') || ''; } catch { return ''; }
  });
  const setUserGroqKey = useCallback((key: string) => {
    _setUserGroqKey(key);
    try { if (key) localStorage.setItem('userGroqKey', key); else localStorage.removeItem('userGroqKey'); } catch { /* localStorage unavailable - ignore */ }
  }, []);

  const [myMemoryEmail, _setMyMemoryEmail] = useState(() => {
    try { return localStorage.getItem('myMemoryEmail') || ''; } catch { return ''; }
  });
  const setMyMemoryEmail = useCallback((email: string) => {
    _setMyMemoryEmail(email);
    try { if (email) localStorage.setItem('myMemoryEmail', email); else localStorage.removeItem('myMemoryEmail'); } catch { /* localStorage unavailable - ignore */ }
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
      } catch { /* localStorage unavailable - ignore */ }
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
      } catch { /* localStorage unavailable - ignore */ }
      return newVal;
    });
    setAiRequestsMonth(prev => {
      const newVal = prev + count;
      try {
        localStorage.setItem('aiRequestsMonth', String(newVal));
        localStorage.setItem('aiRequestsMonthKey', currentMonth);
      } catch { /* localStorage unavailable - ignore */ }
      return newVal;
    });
  }, []);

  // === NPC & line split settings ===
  const [rebalanceNewlines, _setRebalanceNewlines] = useState(() => {
    try { return localStorage.getItem('rebalanceNewlines') === 'true'; } catch { return false; }
  });
  const setRebalanceNewlines = useCallback((v: boolean) => {
    _setRebalanceNewlines(v);
    try { localStorage.setItem('rebalanceNewlines', String(v)); } catch { /* localStorage unavailable - ignore */ }
  }, []);

  const [npcMaxLines, _setNpcMaxLines] = useState(() => {
    try { const v = localStorage.getItem('npcMaxLines'); return v ? Number(v) : 2; } catch { return 2; }
  });
  const setNpcMaxLines = useCallback((v: number) => {
    const clamped = Math.max(1, Math.min(3, v));
    _setNpcMaxLines(clamped);
    try { localStorage.setItem('npcMaxLines', String(clamped)); } catch { /* localStorage unavailable - ignore */ }
  }, []);

  const [npcMode, _setNpcMode] = useState(() => {
    try { return localStorage.getItem('npcMode') === 'true'; } catch { return false; }
  });
  const setNpcMode = useCallback((v: boolean) => {
    _setNpcMode(v);
    try { localStorage.setItem('npcMode', String(v)); } catch { /* localStorage unavailable - ignore */ }
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
    try { localStorage.setItem('autoSmartReview', String(v)); } catch { /* localStorage unavailable - ignore */ }
  }, []);

  // === Translation Memory auto-reuse (skip AI for previously-translated identical originals) ===
  // Default ON — significantly reduces API calls. User can opt out if old translations are unreliable.
  const [tmAutoReuse, _setTmAutoReuse] = useState(() => {
    try {
      const v = localStorage.getItem('tmAutoReuse');
      return v === null ? true : v === 'true';
    } catch { return true; }
  });
  const setTmAutoReuse = useCallback((v: boolean) => {
    _setTmAutoReuse(v);
    try { localStorage.setItem('tmAutoReuse', String(v)); } catch { /* localStorage unavailable - ignore */ }
  }, []);

  // === Adaptive throttle between AI batches (avoids hitting per-minute rate limits) ===
  // Default ON. Per-provider delay: see PROVIDER_BATCH_DELAY_MS in useEditorTranslation.
  const [aiThrottleEnabled, _setAiThrottleEnabled] = useState(() => {
    try {
      const v = localStorage.getItem('aiThrottleEnabled');
      return v === null ? true : v === 'true';
    } catch { return true; }
  });
  const setAiThrottleEnabled = useCallback((v: boolean) => {
    _setAiThrottleEnabled(v);
    try { localStorage.setItem('aiThrottleEnabled', String(v)); } catch { /* localStorage unavailable - ignore */ }
  }, []);

  // === Translation Memory for improvements ===
  const [enhancedMemory, setEnhancedMemory] = useState<Record<string, { original: string; translation: string }>>(() => {
    try { const v = localStorage.getItem('enhancedMemory'); return v ? JSON.parse(v) : {}; } catch { return {}; }
  });

  const saveToEnhancedMemory = useCallback((key: string, original: string, translation: string) => {
    setEnhancedMemory(prev => {
      const next = { ...prev, [original.toLowerCase().trim()]: { original, translation } };
      try { localStorage.setItem('enhancedMemory', JSON.stringify(next)); } catch { /* localStorage unavailable - ignore */ }
      return next;
    });
  }, []);

  // === Panel visibility ===
  const [hiddenPanels, _setHiddenPanels] = useState<string[]>(() => {
    try { const v = localStorage.getItem('hiddenPanels'); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const togglePanel = useCallback((id: string) => {
    _setHiddenPanels(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      try { localStorage.setItem('hiddenPanels', JSON.stringify(next)); } catch { /* localStorage unavailable - ignore */ }
      return next;
    });
  }, []);

  return {
    arabicNumerals, setArabicNumerals,
    mirrorPunctuation, setMirrorPunctuation,
    userGeminiKey, setUserGeminiKey,
    userDeepSeekKey, setUserDeepSeekKey,
    userGroqKey, setUserGroqKey,
    userOpenRouterKey, setUserOpenRouterKey,
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
    tmAutoReuse, setTmAutoReuse,
    aiThrottleEnabled, setAiThrottleEnabled,
    enhancedMemory, saveToEnhancedMemory,
    hiddenPanels, togglePanel,
  };
}
