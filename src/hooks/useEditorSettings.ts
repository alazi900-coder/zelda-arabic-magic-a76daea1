import { useState, useCallback, useEffect } from "react";

// One-time migration from removed multi-key feature. If a user has the old
// arrays in localStorage, we collapse them down to the legacy single-key field
// (first key) and discard cooldown blocks, then delete the array keys.
function migrateMultiKeyToSingle(): void {
  try {
    const pairs: Array<[string, string]> = [
      ['userGeminiKeys', 'userGeminiKey'],
    ];
    for (const [arrayKey, legacyKey] of pairs) {
      const raw = localStorage.getItem(arrayKey);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const first = parsed.find((k): k is string => typeof k === 'string' && !!k.trim());
          if (first && !localStorage.getItem(legacyKey)) {
            localStorage.setItem(legacyKey, first.trim());
          }
        }
      } catch { /* ignore parse errors */ }
      localStorage.removeItem(arrayKey);
    }
    localStorage.removeItem('translationKeyBlocks');
  } catch { /* ignore */ }
}
migrateMultiKeyToSingle();

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

  const MODEL_ALIASES: Record<string, string> = {
    'deepseek-chat': 'deepseek-v4-flash',
    'deepseek-reasoner': 'deepseek-v4-pro',
  };
  const DEAD_MODELS = ['z-ai/glm-4.6:free', 'z-ai/glm-4.6b-flash:free', 'z-ai/glm-4.5-air:free', 'openai/gpt-oss-120b:free'];

  const [aiModel, _setAiModel] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('aiModel') || 'gemini-2.5-flash';
      if (MODEL_ALIASES[saved]) {
        localStorage.setItem('aiModel', MODEL_ALIASES[saved]);
        return MODEL_ALIASES[saved];
      }
      if (DEAD_MODELS.includes(saved)) {
        localStorage.setItem('aiModel', 'gemini-2.5-flash');
        return 'gemini-2.5-flash';
      }
      return saved;
    } catch { return 'gemini-2.5-flash'; }
  });
  const setAiModel = useCallback((m: string) => {
    _setAiModel(m);
    try { localStorage.setItem('aiModel', m); } catch { /* localStorage unavailable - ignore */ }
  }, []);

  type TranslationProvider = 'gemini' | 'mymemory' | 'google' | 'deepseek';
  const VALID_PROVIDERS: TranslationProvider[] = ['gemini', 'mymemory', 'google', 'deepseek'];
  const [translationProvider, _setTranslationProvider] = useState<TranslationProvider>(() => {
    try {
      const saved = localStorage.getItem('translationProvider') as TranslationProvider | null;
      if (saved && VALID_PROVIDERS.includes(saved)) return saved;
      return 'gemini';
    } catch { return 'gemini'; }
  });
  const setTranslationProvider = useCallback((p: TranslationProvider) => {
    _setTranslationProvider(p);
    try { localStorage.setItem('translationProvider', p); } catch { /* localStorage unavailable - ignore */ }
  }, []);

  const [userDeepSeekKey, _setUserDeepSeekKey] = useState(() => {
    try { return localStorage.getItem('userDeepSeekKey') || ''; } catch { return ''; }
  });
  const setUserDeepSeekKey = useCallback((key: string) => {
    _setUserDeepSeekKey(key);
    try { if (key) localStorage.setItem('userDeepSeekKey', key); else localStorage.removeItem('userDeepSeekKey'); } catch { /* localStorage unavailable - ignore */ }
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

  // === Custom prompt instructions (appended to every AI prompt, all categories) ===
  const [customPromptInstructions, _setCustomPromptInstructions] = useState<string>(() => {
    try { return localStorage.getItem('customPromptInstructions') || ''; } catch { return ''; }
  });
  const setCustomPromptInstructions = useCallback((v: string) => {
    _setCustomPromptInstructions(v);
    try {
      if (v.trim()) localStorage.setItem('customPromptInstructions', v);
      else localStorage.removeItem('customPromptInstructions');
    } catch { /* ignore */ }
  }, []);

  // === Per-category prompt instructions (one dedicated prompt per filter card id) ===
  const [categoryPromptTemplates, _setCategoryPromptTemplates] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('categoryPromptTemplates');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const setCategoryPromptTemplate = useCallback((categoryId: string, v: string) => {
    _setCategoryPromptTemplates(prev => {
      const next = { ...prev };
      if (v.trim()) next[categoryId] = v; else delete next[categoryId];
      try {
        if (Object.keys(next).length) localStorage.setItem('categoryPromptTemplates', JSON.stringify(next));
        else localStorage.removeItem('categoryPromptTemplates');
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  // === AI Routing Mode: free (مفتاح المستخدم فقط) | paid (بوابة Lovable) | auto ===
  const [aiRoutingMode, _setAiRoutingMode] = useState<'free' | 'paid' | 'auto'>(() => {
    try {
      const v = localStorage.getItem('aiRoutingMode');
      return v === 'free' || v === 'paid' || v === 'auto' ? v : 'auto';
    } catch { return 'auto'; }
  });
  const setAiRoutingMode = useCallback((v: 'free' | 'paid' | 'auto') => {
    _setAiRoutingMode(v);
    try { localStorage.setItem('aiRoutingMode', v); } catch { /* localStorage unavailable - ignore */ }
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

  // === AI Batch Size: عدد النصوص في كل طلب AI واحد ===
  // أكبر = طلبات أقل = توفير أكبر للحصة، لكن خطر تجاوز output tokens.
  // النطاق المسموح: 5..50. الافتراضي: 20.
  const [aiBatchSize, _setAiBatchSize] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem('aiBatchSize') || '20', 10);
      if (isNaN(v) || v < 5) return 20;
      return Math.min(50, v);
    } catch { return 20; }
  });
  const setAiBatchSize = useCallback((v: number) => {
    const clamped = Math.max(5, Math.min(50, Math.round(v) || 20));
    _setAiBatchSize(clamped);
    try { localStorage.setItem('aiBatchSize', String(clamped)); } catch { /* ignore */ }
  }, []);

  // === Persistent Translation Cache (IndexedDB) ===
  // عند التشغيل: نفلتر النصوص الموجودة في الذاكرة قبل إرسالها لـ AI.
  // افتراضي: مفعّل.
  const [translationCacheEnabled, _setTranslationCacheEnabled] = useState(() => {
    try {
      const v = localStorage.getItem('translationCacheEnabled');
      return v === null ? true : v === 'true';
    } catch { return true; }
  });
  const setTranslationCacheEnabled = useCallback((v: boolean) => {
    _setTranslationCacheEnabled(v);
    try { localStorage.setItem('translationCacheEnabled', String(v)); } catch { /* ignore */ }
  }, []);

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

  // === Legacy comma-splitter feature flag ===
  // عند إيقافها (الافتراضي): تختفي أدوات التقسيم القديمة عند الفواصل
  // (NewlineSplit / NPC mode / LineSync / UnifiedSplit / LineBalance / NewlineClean).
  // الميزات لا تُحذف، فقط تُخفى من الواجهة ويمكن إعادتها بقلب هذا الـ flag.
  const [legacyCommaSplitEnabled, _setLegacyCommaSplitEnabled] = useState(() => {
    try { return localStorage.getItem('legacyCommaSplitEnabled') === 'true'; } catch { return false; }
  });
  const setLegacyCommaSplitEnabled = useCallback((v: boolean) => {
    _setLegacyCommaSplitEnabled(v);
    try { localStorage.setItem('legacyCommaSplitEnabled', String(v)); } catch { /* ignore */ }
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
    customPromptInstructions, setCustomPromptInstructions,
    categoryPromptTemplates, setCategoryPromptTemplate,
    aiRoutingMode, setAiRoutingMode,
    aiBatchSize, setAiBatchSize,
    translationCacheEnabled, setTranslationCacheEnabled,
    enhancedMemory, saveToEnhancedMemory,
    legacyCommaSplitEnabled, setLegacyCommaSplitEnabled,
    hiddenPanels, togglePanel,
  };
}
