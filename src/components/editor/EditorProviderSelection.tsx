import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Key, Loader2, CheckCircle2, XCircle, Wifi, RefreshCw } from "lucide-react";
import {
  DEFAULT_OPENROUTER_MODEL,
  isOpenRouterModelId,
  type OpenRouterModelOption,
} from "@/lib/openrouter-models";
import type { useEditorState } from "@/hooks/useEditorState";

type EditorSubset = Pick<
  ReturnType<typeof useEditorState>,
  | "userGeminiKey" | "setUserGeminiKey"
  | "userDeepSeekKey" | "setUserDeepSeekKey"
  | "userGroqKey" | "setUserGroqKey"
  | "userCerebrasKey" | "setUserCerebrasKey"
  | "userOpenRouterKey" | "setUserOpenRouterKey"
  | "translationProvider" | "setTranslationProvider"
  | "myMemoryEmail" | "setMyMemoryEmail"
  | "myMemoryCharsUsed"
  | "aiModel" | "setAiModel"
  | "rebalanceNewlines" | "setRebalanceNewlines"
  | "tmAutoReuse" | "setTmAutoReuse"
  | "aiThrottleEnabled" | "setAiThrottleEnabled"
>;

type TestConnState = 'idle' | 'testing' | 'ok' | 'error';

interface EditorProviderSelectionProps {
  editor: EditorSubset;
  testConnStatus: Record<string, TestConnState>;
  testConnMsg: Record<string, string>;
  handleTestConnection: (provider: string) => void | Promise<void>;
  orModels: OpenRouterModelOption[];
  orModelsRefreshing: boolean;
  orModelsFetchedAt: string | null;
  handleRefreshOrModels: () => void | Promise<void>;
}

const EditorProviderSelection: React.FC<EditorProviderSelectionProps> = ({
  editor,
  testConnStatus,
  testConnMsg,
  handleTestConnection,
  orModels,
  orModelsRefreshing,
  orModelsFetchedAt,
  handleRefreshOrModels,
}) => (
  <Card className="mb-6 border-primary/20 bg-primary/5">
    <CardContent className="p-3 md:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Key className="w-4 h-4 text-primary" />
            <span className="text-sm font-display font-bold">🔧 محرك الترجمة</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'mymemory' as const, label: '🆓 MyMemory', badge: '✅' },
              { id: 'google' as const, label: '🌐 Google Translate', badge: '✅' },
              { id: 'gemini' as const, label: '🤖 Lovable AI', badge: editor.userGeminiKey ? '✅' : '⚡' },
              { id: 'deepseek' as const, label: '🐋 DeepSeek', badge: editor.userDeepSeekKey ? '✅' : '⚠️' },
              { id: 'groq' as const, label: '⚡ Groq (Llama)', badge: editor.userGroqKey ? '✅' : '⚠️' },
              { id: 'cerebras' as const, label: '🚀 Cerebras (Qwen)', badge: editor.userCerebrasKey ? '✅' : '⚠️' },
              { id: 'openrouter' as const, label: '🆕 OpenRouter', badge: editor.userOpenRouterKey ? '✅' : '⚠️' },
            ].map(({ id, label, badge }) => (
              <Button
                key={id}
                size="sm"
                variant={editor.translationProvider === id ? 'default' : 'outline'}
                onClick={() => editor.setTranslationProvider(id)}
                className="text-xs font-display gap-1"
              >
                {label}
                <span className="text-[10px] opacity-80">{badge}</span>
              </Button>
            ))}
          </div>
        </div>

        {editor.translationProvider === 'mymemory' && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
              <div className="flex gap-2 flex-1">
                <input
                  type="email"
                  placeholder="بريدك الإلكتروني (اختياري — يرفع الحد إلى 50,000 حرف/يوم)"
                  value={editor.myMemoryEmail}
                  onChange={(e) => editor.setMyMemoryEmail(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-body text-sm"
                  dir="ltr"
                />
                {editor.myMemoryEmail && (
                  <Button variant="ghost" size="sm" onClick={() => editor.setMyMemoryEmail('')} className="text-xs text-destructive shrink-0">
                    مسح
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-secondary font-body">
                {editor.myMemoryEmail
                  ? '✅ الحد اليومي: 50,000 حرف'
                  : '🆓 الحد اليومي: 5,000 حرف (أضف بريدك لرفعه إلى 50,000)'}
              </p>
              <div className="flex items-center gap-2">
                <Progress
                  value={(editor.myMemoryCharsUsed / (editor.myMemoryEmail ? 50000 : 5000)) * 100}
                  className="w-24 h-2"
                />
                <span className="text-xs font-mono text-muted-foreground">
                  {editor.myMemoryCharsUsed.toLocaleString()} / {editor.myMemoryEmail ? '50,000' : '5,000'}
                </span>
              </div>
            </div>
          </div>
        )}

        {editor.translationProvider === 'google' && (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-secondary font-body">🌐 ترجمة Google مجانية بالكامل — بدون حد يومي ولا حاجة لمفتاح API</p>
            <p className="text-xs text-muted-foreground font-body">ترجمة آلية سريعة مع دعم دفعات متعددة. جودة أقل من Gemini AI لكنها مجانية تماماً.</p>
          </div>
        )}

        {editor.translationProvider === 'deepseek' && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 flex-1">
              <input
                type="password"
                placeholder="الصق مفتاح DeepSeek API هنا..."
                value={editor.userDeepSeekKey}
                onChange={(e) => editor.setUserDeepSeekKey(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-body text-sm"
                dir="ltr"
              />
              {editor.userDeepSeekKey && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => handleTestConnection('deepseek')}
                  disabled={testConnStatus['deepseek'] === 'testing'}
                  className="text-xs shrink-0 gap-1"
                >
                  {testConnStatus['deepseek'] === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                   testConnStatus['deepseek'] === 'ok' ? <CheckCircle2 className="w-3 h-3 text-green-500" /> :
                   testConnStatus['deepseek'] === 'error' ? <XCircle className="w-3 h-3 text-red-500" /> :
                   <Wifi className="w-3 h-3" />}
                  تجربة
                </Button>
              )}
              {editor.userDeepSeekKey && (
                <Button variant="ghost" size="sm" onClick={() => editor.setUserDeepSeekKey('')} className="text-xs text-destructive shrink-0">
                  مسح
                </Button>
              )}
            </div>
            {testConnMsg['deepseek'] && (
              <p className={`text-xs font-body ${testConnStatus['deepseek'] === 'ok' ? 'text-green-500' : 'text-red-500'}`}>
                {testConnStatus['deepseek'] === 'ok' ? '✅' : '❌'} {testConnMsg['deepseek']}
              </p>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-body">
                {editor.userDeepSeekKey
                  ? '✅ مفتاح DeepSeek مفعّل — جودة ممتازة للعربية'
                  : '⚠️ يحتاج مفتاح API — سجّل مجاناً على platform.deepseek.com'}
              </p>
              {!editor.userDeepSeekKey && (
                <a href="https://platform.deepseek.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline hover:text-primary/80 shrink-0">
                  احصل على مفتاح ↗
                </a>
              )}
            </div>
          </div>
        )}

        {editor.translationProvider === 'groq' && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 flex-1">
              <input
                type="password"
                placeholder="الصق مفتاح Groq API هنا..."
                value={editor.userGroqKey}
                onChange={(e) => editor.setUserGroqKey(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-body text-sm"
                dir="ltr"
              />
              {editor.userGroqKey && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => handleTestConnection('groq')}
                  disabled={testConnStatus['groq'] === 'testing'}
                  className="text-xs shrink-0 gap-1"
                >
                  {testConnStatus['groq'] === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                   testConnStatus['groq'] === 'ok' ? <CheckCircle2 className="w-3 h-3 text-green-500" /> :
                   testConnStatus['groq'] === 'error' ? <XCircle className="w-3 h-3 text-red-500" /> :
                   <Wifi className="w-3 h-3" />}
                  تجربة
                </Button>
              )}
              {editor.userGroqKey && (
                <Button variant="ghost" size="sm" onClick={() => editor.setUserGroqKey('')} className="text-xs text-destructive shrink-0">
                  مسح
                </Button>
              )}
            </div>
            {testConnMsg['groq'] && (
              <p className={`text-xs font-body ${testConnStatus['groq'] === 'ok' ? 'text-green-500' : 'text-red-500'}`}>
                {testConnStatus['groq'] === 'ok' ? '✅' : '❌'} {testConnMsg['groq']}
              </p>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-body">
                {editor.userGroqKey
                  ? '✅ مفتاح Groq مفعّل — Llama 3.3 70B (14,400 طلب/يوم مجاناً)'
                  : '⚠️ يحتاج مفتاح API — سجّل مجاناً على console.groq.com'}
              </p>
              {!editor.userGroqKey && (
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline hover:text-primary/80 shrink-0">
                  احصل على مفتاح ↗
                </a>
              )}
            </div>
          </div>
        )}

        {editor.translationProvider === 'cerebras' && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 flex-1">
              <input
                type="password"
                placeholder="الصق مفتاح Cerebras API هنا..."
                value={editor.userCerebrasKey}
                onChange={(e) => editor.setUserCerebrasKey(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-body text-sm"
                dir="ltr"
              />
              {editor.userCerebrasKey && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => handleTestConnection('cerebras')}
                  disabled={testConnStatus['cerebras'] === 'testing'}
                  className="text-xs shrink-0 gap-1"
                >
                  {testConnStatus['cerebras'] === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                   testConnStatus['cerebras'] === 'ok' ? <CheckCircle2 className="w-3 h-3 text-green-500" /> :
                   testConnStatus['cerebras'] === 'error' ? <XCircle className="w-3 h-3 text-red-500" /> :
                   <Wifi className="w-3 h-3" />}
                  تجربة
                </Button>
              )}
              {editor.userCerebrasKey && (
                <Button variant="ghost" size="sm" onClick={() => editor.setUserCerebrasKey('')} className="text-xs text-destructive shrink-0">
                  مسح
                </Button>
              )}
            </div>
            {testConnMsg['cerebras'] && (
              <p className={`text-xs font-body ${testConnStatus['cerebras'] === 'ok' ? 'text-green-500' : 'text-red-500'}`}>
                {testConnStatus['cerebras'] === 'ok' ? '✅' : '❌'} {testConnMsg['cerebras']}
              </p>
            )}
            {editor.userCerebrasKey && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {[
                  { id: 'qwen-3-235b-a22b-instruct-2507', label: '🌟 Qwen 3 235B', desc: 'الأفضل للعربية' },
                  { id: 'llama-4-scout-17b-16e-instruct', label: '⚡ Llama 4 Scout', desc: 'سريع جداً' },
                  { id: 'llama-4-maverick-17b-128e-instruct', label: '🦅 Llama 4 Maverick', desc: 'سياق طويل' },
                  { id: 'llama-3.3-70b', label: '🦙 Llama 3.3 70B', desc: 'مستقر' },
                ].map(m => {
                  const isSelected = editor.aiModel === m.id || (m.id === 'qwen-3-235b-a22b-instruct-2507' && !['llama-4-scout-17b-16e-instruct', 'llama-4-maverick-17b-128e-instruct', 'llama-3.3-70b'].includes(editor.aiModel));
                  return (
                    <button
                      key={m.id}
                      onClick={() => editor.setAiModel(m.id)}
                      className={`flex flex-col items-start p-2 rounded-md border text-xs transition-colors ${
                        isSelected ? 'border-primary bg-primary/10 text-foreground'
                                   : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      <span className="font-display">{m.label}</span>
                      <span className="text-[10px] opacity-70 truncate w-full" dir="ltr">{m.id}</span>
                      <span className="text-[10px] opacity-70">{m.desc}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-body">
                {editor.userCerebrasKey
                  ? '✅ مفتاح Cerebras مفعّل — أسرع inference + 1M tokens/يوم مجاناً'
                  : '⚠️ يحتاج مفتاح API — سجّل مجاناً على cloud.cerebras.ai'}
              </p>
              {!editor.userCerebrasKey && (
                <a href="https://cloud.cerebras.ai/platform/" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline hover:text-primary/80 shrink-0">
                  احصل على مفتاح ↗
                </a>
              )}
            </div>
          </div>
        )}

        {editor.translationProvider === 'openrouter' && (
          <div className="flex flex-col gap-3">
            {/* Free Model Selector */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-display text-muted-foreground">🆓 موديل OpenRouter المجاني ({orModels.length}):</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshOrModels}
                  disabled={orModelsRefreshing}
                  className="h-7 text-xs gap-1"
                >
                  {orModelsRefreshing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {orModelsRefreshing ? 'جاري التحديث...' : 'تحديث القائمة'}
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {orModels.map(m => {
                  const isSelected = (editor.aiModel === m.id) || (m.id === DEFAULT_OPENROUTER_MODEL && !isOpenRouterModelId(editor.aiModel));
                  return (
                    <button
                      key={m.id}
                      onClick={() => editor.setAiModel(m.id)}
                      className={`flex flex-col items-start p-2 rounded-md border text-xs transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      <span className="font-display">{m.badge} {m.label}</span>
                      <span className="text-[10px] opacity-70 truncate w-full" dir="ltr">{m.id}</span>
                      <span className="text-[10px] opacity-70">{m.desc}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground font-body">
                {orModelsFetchedAt
                  ? `آخر تحديث: ${new Date(orModelsFetchedAt).toLocaleString('ar')} — اضغط "تحديث القائمة" لجلب أحدث الموديلات المجانية مباشرة من OpenRouter.`
                  : 'القائمة الافتراضية — اضغط "تحديث القائمة" لجلب أحدث الموديلات المجانية مباشرة من OpenRouter.'}
              </p>
            </div>

            {/* API Key */}
            <div className="flex gap-2 flex-1">
              <input
                type="password"
                placeholder="الصق مفتاح OpenRouter API هنا (sk-or-v1-...)..."
                value={editor.userOpenRouterKey}
                onChange={(e) => editor.setUserOpenRouterKey(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-body text-sm"
                dir="ltr"
              />
              {editor.userOpenRouterKey && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => handleTestConnection('openrouter')}
                  disabled={testConnStatus['openrouter'] === 'testing'}
                  className="text-xs shrink-0 gap-1"
                >
                  {testConnStatus['openrouter'] === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                   testConnStatus['openrouter'] === 'ok' ? <CheckCircle2 className="w-3 h-3 text-green-500" /> :
                   testConnStatus['openrouter'] === 'error' ? <XCircle className="w-3 h-3 text-red-500" /> :
                   <Wifi className="w-3 h-3" />}
                  تجربة
                </Button>
              )}
              {editor.userOpenRouterKey && (
                <Button variant="ghost" size="sm" onClick={() => editor.setUserOpenRouterKey('')} className="text-xs text-destructive shrink-0">
                  مسح
                </Button>
              )}
            </div>
            {testConnMsg['openrouter'] && (
              <p className={`text-xs font-body ${testConnStatus['openrouter'] === 'ok' ? 'text-green-500' : 'text-red-500'}`}>
                {testConnStatus['openrouter'] === 'ok' ? '✅' : '❌'} {testConnMsg['openrouter']}
              </p>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-body">
                {editor.userOpenRouterKey
                  ? `✅ مفتاح OpenRouter مفعّل — الموديل: ${isOpenRouterModelId(editor.aiModel) ? editor.aiModel : DEFAULT_OPENROUTER_MODEL}`
                  : '🆓 احصل على مفتاح مجاني من openrouter.ai ثم اختر أحد الموديلات المجانية أعلاه'}
              </p>
              {!editor.userOpenRouterKey && (
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline hover:text-primary/80 shrink-0">
                  احصل على مفتاح ↗
                </a>
              )}
            </div>
          </div>
        )}

        {editor.translationProvider === 'gemini' && (
          <div className="flex flex-col gap-3">
            {/* Model Selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-display text-muted-foreground">🧠 نموذج الذكاء الاصطناعي:</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'سريع ومتوازن', badge: '⚡' },
                  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'الأدق للمصطلحات', badge: '🎯' },
                  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', desc: 'أحدث نموذج Google', badge: '🆕' },
                  { id: 'gpt-5', label: 'GPT-5', desc: 'استدلال متقدم', badge: '🧠' },
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => editor.setAiModel(m.id)}
                    className={`flex flex-col items-start p-2 rounded-md border text-xs transition-colors ${
                      editor.aiModel === m.id
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    <span className="font-display">{m.badge} {m.label}</span>
                    <span className="text-[10px] opacity-70">{m.desc}</span>
                  </button>
                ))}
              </div>
              {(editor.aiModel === 'gemini-2.5-pro' || editor.aiModel === 'gpt-5') && (
                <p className="text-[10px] text-amber-500 font-body">⚠️ هذا النموذج أبطأ ويستهلك نقاطاً أكثر — مناسب للنصوص المهمة</p>
              )}
              {(editor.aiModel === 'gemini-3.1-pro-preview' || editor.aiModel === 'gpt-5') && !editor.userGeminiKey && (
                <p className="text-[10px] text-muted-foreground font-body">يعمل عبر Lovable AI فقط (لا يدعم المفتاح الشخصي)</p>
              )}
            </div>

            {/* API Key */}
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
              <div className="flex gap-2 flex-1">
                <input
                  type="password"
                  placeholder="الصق مفتاح Gemini API هنا (اختياري)..."
                  value={editor.userGeminiKey}
                  onChange={(e) => editor.setUserGeminiKey(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-body text-sm"
                  dir="ltr"
                />
                {editor.userGeminiKey && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => handleTestConnection('gemini')}
                    disabled={testConnStatus['gemini'] === 'testing'}
                    className="text-xs shrink-0 gap-1"
                  >
                    {testConnStatus['gemini'] === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                     testConnStatus['gemini'] === 'ok' ? <CheckCircle2 className="w-3 h-3 text-green-500" /> :
                     testConnStatus['gemini'] === 'error' ? <XCircle className="w-3 h-3 text-red-500" /> :
                     <Wifi className="w-3 h-3" />}
                    تجربة
                  </Button>
                )}
                {editor.userGeminiKey && (
                  <Button variant="ghost" size="sm" onClick={() => editor.setUserGeminiKey('')} className="text-xs text-destructive shrink-0">
                    مسح
                  </Button>
                )}
              </div>
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline hover:text-primary/80 shrink-0">
                احصل على مفتاح مجاني ↗
              </a>
            </div>
            {testConnMsg['gemini'] && (
              <p className={`text-xs font-body ${testConnStatus['gemini'] === 'ok' ? 'text-green-500' : 'text-red-500'}`}>
                {testConnStatus['gemini'] === 'ok' ? '✅' : '❌'} {testConnMsg['gemini']}
              </p>
            )}
            {editor.userGeminiKey ? (
              <p className="text-xs text-secondary font-body">✅ سيتم استخدام مفتاحك الشخصي للترجمة بدون حدود</p>
            ) : (
              <p className="text-xs text-muted-foreground font-body">بدون مفتاح: يستخدم نقاط Lovable AI المدمجة</p>
            )}
          </div>
        )}
      </div>

      {/* Rebalance Newlines Switch */}
      <div className="flex items-center justify-between border-t border-border/50 pt-3 mt-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-display">⚖️ إعادة موازنة الأسطر تلقائياً</span>
          <span className="text-xs text-muted-foreground font-body">(يعيد توزيع \n بدلاً من المحافظة على مواضعها الإنجليزية)</span>
        </div>
        <Switch
          checked={editor.rebalanceNewlines}
          onCheckedChange={editor.setRebalanceNewlines}
        />
      </div>

      {/* Translation Memory auto-reuse */}
      <div className="flex items-center justify-between border-t border-border/50 pt-3 mt-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-display">⚡ إعادة استخدام ذاكرة الترجمة</span>
          <span className="text-xs text-muted-foreground font-body">(يطبق ترجمة سابقة لنفس النص بدون استدعاء AI — يوفّر طلبات)</span>
        </div>
        <Switch
          checked={editor.tmAutoReuse}
          onCheckedChange={editor.setTmAutoReuse}
        />
      </div>

      {/* AI batch throttle */}
      <div className="flex items-center justify-between border-t border-border/50 pt-3 mt-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-display">⏱️ تنظيم سرعة الإرسال</span>
          <span className="text-xs text-muted-foreground font-body">(يحترم حدود الموفّر لتفادي 429 — 4س Gemini / 3س OpenRouter / 2س Groq+Cerebras للمجاني)</span>
        </div>
        <Switch
          checked={editor.aiThrottleEnabled}
          onCheckedChange={editor.setAiThrottleEnabled}
        />
      </div>
    </CardContent>
  </Card>
);

export default EditorProviderSelection;
