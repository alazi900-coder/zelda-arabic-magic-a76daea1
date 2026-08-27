import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Key, Loader2, CheckCircle2, XCircle, Wifi } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GTAIV_PROMPT_PRESETS, PROMPT_PRESETS, RISEN_PROMPT_PRESETS } from "@/components/editor/promptPresets";
import { CATEGORY_PROMPT_DEFAULTS, resolveCategoryPrompt } from "@/lib/categoryPromptDefaults";
import AIRoutingToggle from "@/components/editor/AIRoutingToggle";
import type { useEditorState } from "@/hooks/useEditorState";

type EditorSubset = Pick<
  ReturnType<typeof useEditorState>,
  | "state" | "risenVariant"
  | "userGeminiKey" | "setUserGeminiKey"
  | "userDeepSeekKey" | "setUserDeepSeekKey"
  | "userTokenRouterKey" | "setUserTokenRouterKey"
  | "userGmiCloudKey" | "setUserGmiCloudKey"
  | "translationProvider" | "setTranslationProvider"
  | "myMemoryEmail" | "setMyMemoryEmail"
  | "myMemoryCharsUsed"
  | "aiModel" | "setAiModel"
  | "rebalanceNewlines" | "setRebalanceNewlines"
  | "aiThrottleEnabled" | "setAiThrottleEnabled"
  | "customPromptInstructions" | "setCustomPromptInstructions"
  | "categoryPromptTemplates" | "setCategoryPromptTemplate"
  | "aiBatchSize" | "setAiBatchSize"
  | "translationCacheEnabled" | "setTranslationCacheEnabled"
  | "aiRoutingMode" | "setAiRoutingMode"
>;

type TestConnState = 'idle' | 'testing' | 'ok' | 'error';

interface EditorProviderSelectionProps {
  editor: EditorSubset;
  testConnStatus: Record<string, TestConnState>;
  testConnMsg: Record<string, string>;
  handleTestConnection: (provider: string) => void | Promise<void>;
  /** The single filter card currently selected, if exactly one is — its dedicated prompt is edited here instead of the general one. */
  activeCategory: { id: string; label: string } | null;
}

const EditorProviderSelection: React.FC<EditorProviderSelectionProps> = ({
  editor,
  testConnStatus,
  testConnMsg,
  handleTestConnection,
  activeCategory,
}) => {
  const promptValue = activeCategory
    ? resolveCategoryPrompt(activeCategory.id, editor.categoryPromptTemplates)
    : editor.customPromptInstructions;
  const setPromptValue = activeCategory
    ? (v: string) => editor.setCategoryPromptTemplate(activeCategory.id, v)
    : editor.setCustomPromptInstructions;
  const isShowingDefault = !!activeCategory
    && !editor.categoryPromptTemplates[activeCategory.id]?.trim()
    && !!CATEGORY_PROMPT_DEFAULTS[activeCategory.id];
  const isRisen = /\.tab$/i.test(editor.state?.entries?.[0]?.msbtFile || "");
  const isGtaIv = editor.state?.entries?.[0]?.msbtFile?.startsWith("gtaiv/") || false;
  const activePresets = isGtaIv ? GTAIV_PROMPT_PRESETS : isRisen ? RISEN_PROMPT_PRESETS : PROMPT_PRESETS;

  return (
  <Card className="mb-6 border-primary/20 bg-primary/5">
    <CardContent className="p-3 md:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Key className="w-4 h-4 text-primary" />
            <span className="text-sm font-display font-bold">🔧 I have approved the plan</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'mymemory' as const, label: '🆓 MyMemory', badge: '✅' },
              { id: 'google' as const, label: '🌐 Google Translate', badge: '✅' },
              { id: 'gemini' as const, label: '🤖 Lovable AI', badge: editor.userGeminiKey ? '✅' : '⚡' },
              { id: 'deepseek' as const, label: '🐋 DeepSeek', badge: editor.userDeepSeekKey ? '✅' : '⚠️' },
              { id: 'tokenrouter' as const, label: '🔀 TokenRouter', badge: editor.userTokenRouterKey ? '✅' : '⚠️' },
              { id: 'gmicloud' as const, label: '☁️ GMICLOUD', badge: editor.userGmiCloudKey ? '✅' : '⚠️' },
            ].map(({ id, label, badge }) => (
              <Button
                key={id}
                size="sm"
                variant={editor.translationProvider === id ? 'default' : 'outline'}
                onClick={() => {
                  editor.setTranslationProvider(id);
                  if (id === 'gmicloud') editor.setAiModel('MiniMaxAI/MiniMax-M2.7');
                }}
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
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 flex-1">
              <input
                type="password"
                name="deepseek-api-key"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
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

            {/* Model Selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-display text-muted-foreground">🐋 نموذج DeepSeek:</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', desc: '284B/13B — اقتصادي', badge: '🚀' },
                  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', desc: '1.6T/49B — الأقوى', badge: '🆕' },
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
              {editor.aiModel === 'deepseek-v4-pro' && (
                <p className="text-[10px] text-amber-500 font-body">⚠️ V4 Pro أبطأ ويستهلك tokens أكثر — مناسب للنصوص المعقّدة</p>
              )}
            </div>

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

        {editor.translationProvider === 'tokenrouter' && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 flex-1">
              <input
                type="password"
                name="tokenrouter-api-key"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                placeholder="الصق مفتاح TokenRouter API هنا..."
                value={editor.userTokenRouterKey}
                onChange={(e) => editor.setUserTokenRouterKey(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-body text-sm"
                dir="ltr"
              />
              {editor.userTokenRouterKey && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => handleTestConnection('tokenrouter')}
                  disabled={testConnStatus['tokenrouter'] === 'testing'}
                  className="text-xs shrink-0 gap-1"
                >
                  {testConnStatus['tokenrouter'] === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                   testConnStatus['tokenrouter'] === 'ok' ? <CheckCircle2 className="w-3 h-3 text-green-500" /> :
                   testConnStatus['tokenrouter'] === 'error' ? <XCircle className="w-3 h-3 text-red-500" /> :
                   <Wifi className="w-3 h-3" />}
                  تجربة
                </Button>
              )}
              {editor.userTokenRouterKey && (
                <Button variant="ghost" size="sm" onClick={() => editor.setUserTokenRouterKey('')} className="text-xs text-destructive shrink-0">
                  مسح
                </Button>
              )}
            </div>
            {testConnMsg['tokenrouter'] && (
              <p className={`text-xs font-body ${testConnStatus['tokenrouter'] === 'ok' ? 'text-green-500' : 'text-red-500'}`}>
                {testConnStatus['tokenrouter'] === 'ok' ? '✅' : '❌'} {testConnMsg['tokenrouter']}
              </p>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-body">
                {editor.userTokenRouterKey
                  ? '✅ مفتاح TokenRouter مفعّل — نموذج z-ai/glm-5.2 (مجاني)'
                  : '⚠️ يحتاج مفتاح API — سجّل مجاناً على tokenrouter.com'}
              </p>
              {!editor.userTokenRouterKey && (
                <a href="https://www.tokenrouter.com" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline hover:text-primary/80 shrink-0">
                  احصل على مفتاح ↗
                </a>
              )}
            </div>
          </div>
        )}

        {editor.translationProvider === 'gmicloud' && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 flex-1">
              <input
                type="password"
                name="gmicloud-api-key"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                placeholder="الصق مفتاح GMICLOUD API هنا..."
                value={editor.userGmiCloudKey}
                onChange={(e) => editor.setUserGmiCloudKey(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-body text-sm"
                dir="ltr"
              />
              {editor.userGmiCloudKey && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => handleTestConnection('gmicloud')}
                  disabled={testConnStatus['gmicloud'] === 'testing'}
                  className="text-xs shrink-0 gap-1"
                >
                  {testConnStatus['gmicloud'] === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                   testConnStatus['gmicloud'] === 'ok' ? <CheckCircle2 className="w-3 h-3 text-green-500" /> :
                   testConnStatus['gmicloud'] === 'error' ? <XCircle className="w-3 h-3 text-red-500" /> :
                   <Wifi className="w-3 h-3" />}
                  تجربة
                </Button>
              )}
              {editor.userGmiCloudKey && (
                <Button variant="ghost" size="sm" onClick={() => editor.setUserGmiCloudKey('')} className="text-xs text-destructive shrink-0">
                  مسح
                </Button>
              )}
            </div>
            {testConnMsg['gmicloud'] && (
              <p className={`text-xs font-body ${testConnStatus['gmicloud'] === 'ok' ? 'text-green-500' : 'text-red-500'}`}>
                {testConnStatus['gmicloud'] === 'ok' ? '✅' : '❌'} {testConnMsg['gmicloud']}
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-display text-muted-foreground">☁️ نماذج GMICLOUD:</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
                <button
                  onClick={() => editor.setAiModel('MiniMaxAI/MiniMax-M2.7')}
                  className={`flex flex-col items-start p-2 rounded-md border text-xs transition-colors ${
                    editor.aiModel === 'MiniMaxAI/MiniMax-M2.7'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  <span className="font-display">✓ MiniMax M2.7</span>
                  <span className="text-[10px] opacity-70">نموذج نصي موثّق للترجمة</span>
                </button>
                <button
                  onClick={() => editor.setAiModel('MiniMaxAI/MiniMax-M3')}
                  className={`flex flex-col items-start p-2 rounded-md border text-xs transition-colors ${
                    editor.aiModel === 'MiniMaxAI/MiniMax-M3'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  <span className="font-display">✓ MiniMax M3</span>
                  <span className="text-[10px] opacity-70">نموذج نصي موثّق للترجمة</span>
                </button>
                <button disabled title="GMI Cloud أعاد: Insufficient balance" className="flex flex-col items-start p-2 rounded-md border border-dashed border-border bg-muted/30 text-left text-xs text-muted-foreground opacity-70 cursor-not-allowed">
                  <span className="font-display">MiniMax M2.5 — الرصيد غير كافٍ</span>
                  <span className="text-[10px] opacity-70">موجود في الحساب لكن المزود يرفض الطلبات حالياً</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground font-body">
                {editor.userGmiCloudKey
                  ? '✅ المفتاح موجود لهذه الجلسة فقط — لن يُحفظ بعد تحديث الصفحة أو إغلاقها'
                  : '⚠️ أدخل المفتاح هنا فقط؛ لا ترسله في المحادثة'}
              </p>
              {!editor.userGmiCloudKey && (
                <a href="https://console.gmicloud.ai/user-setting/ie/api-keys" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline hover:text-primary/80 shrink-0">
                  مفاتيح GMICLOUD ↗
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
                  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: 'الأعلى حصة (1500/يوم)', badge: '🚀' },
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

            {/* AI Routing Mode */}
            <div className="flex items-center gap-2">
              <AIRoutingToggle mode={editor.aiRoutingMode} onChange={editor.setAiRoutingMode} />
            </div>

            {/* API Key */}
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
              <div className="flex gap-2 flex-1">
                <input
                  type="password"
                  name="gemini-api-key"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
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

      {/* AI batch throttle */}
      <div className="flex items-center justify-between border-t border-border/50 pt-3 mt-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-display">⏱️ تنظيم سرعة الإرسال</span>
          <span className="text-xs text-muted-foreground font-body">(يحترم حدود الموفّر لتفادي 429 — 4س Gemini للمجاني)</span>
        </div>
        <Switch
          checked={editor.aiThrottleEnabled}
          onCheckedChange={editor.setAiThrottleEnabled}
        />
      </div>

      {/* Persistent Translation Cache */}
      <div className="flex items-center justify-between border-t border-border/50 pt-3 mt-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-display">💾 ذاكرة ترجمة دائمة</span>
          <span className="text-xs text-muted-foreground font-body">(يحفظ ترجمات AI ويعيد استخدامها لاحقاً عبر كل المشاريع)</span>
        </div>
        <Switch
          checked={editor.translationCacheEnabled}
          onCheckedChange={editor.setTranslationCacheEnabled}
        />
      </div>

      {/* Custom prompt instructions */}
      <div className="flex flex-col gap-2 border-t border-border/50 pt-3 mt-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex flex-col">
            <span className="text-sm font-display">
              {activeCategory ? `📝 برومبت خاص بـ: ${activeCategory.label}` : '📝 تعليمات إضافية للمترجم'}
            </span>
            <span className="text-xs text-muted-foreground font-body">
              {activeCategory
                ? 'نصّ يُلحَق ببرومت AI لهذه الفئة فقط عند ترجمتها. يمكنك تعديله.'
                : 'نصّ حرّ يُلحَق بكل برومت AI (لكل الفئات). اختر قالباً جاهزاً أو اكتب نصّك.'}
            </span>
            {isShowingDefault && (
              <span className="text-[10px] text-emerald-500 font-body">✓ برومبت جاهز لهذه الفئة — معروض تلقائياً، وتعديله يحفظه كنسختك الخاصة.</span>
            )}
          </div>
          {activeCategory
            ? (promptValue && !isShowingDefault && (
                <Button variant="ghost" size="sm" onClick={() => setPromptValue('')} className="text-xs text-destructive shrink-0 h-7">
                  استعادة الجاهز
                </Button>
              ))
            : (promptValue && (
                <Button variant="ghost" size="sm" onClick={() => setPromptValue('')} className="text-xs text-destructive shrink-0 h-7">
                  مسح
                </Button>
              ))}
        </div>

        <Select
          value=""
          onValueChange={(id) => {
            const preset = activePresets.find(p => p.id === id);
            if (preset) setPromptValue(preset.text);
          }}
        >
          <SelectTrigger className="w-full text-sm font-body" dir="rtl">
            <SelectValue placeholder="اختر قالباً جاهزاً..." />
          </SelectTrigger>
          <SelectContent>
            {activePresets.map(p => (
              <SelectItem key={p.id} value={p.id} className="font-body">
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <textarea
          value={promptValue}
          onChange={(e) => setPromptValue(e.target.value.slice(0, 4000))}
          placeholder="اكتب أي قواعد إضافية تريد أن يلتزم بها المترجم..."
          rows={3}
          className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm resize-y"
          dir="rtl"
        />
        {promptValue && (
          <p className="text-[10px] text-muted-foreground font-body text-left" dir="ltr">
            {promptValue.length} / 4000
          </p>
        )}
      </div>
    </CardContent>
  </Card>
  );
};

export default EditorProviderSelection;
