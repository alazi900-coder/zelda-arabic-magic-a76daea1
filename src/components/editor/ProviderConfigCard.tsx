import React from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Key } from "lucide-react";
import { useEditorState } from "@/hooks/useEditorState";

type EditorState = ReturnType<typeof useEditorState>;

interface ProviderConfigCardProps {
  editor: EditorState;
}

const ProviderConfigCard: React.FC<ProviderConfigCardProps> = ({ editor }) => {
  return (
    <Card className="mb-6 border-primary/20 bg-primary/5">
      <CardContent className="p-3 md:p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Key className="w-4 h-4 text-primary" />
              <span className="text-sm font-display font-bold">🔧 محرك الترجمة</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant={editor.translationProvider === 'mymemory' ? 'default' : 'outline'}
                onClick={() => editor.setTranslationProvider('mymemory')}
                className="text-xs font-display"
              >
                🆓 MyMemory (مجاني)
              </Button>
              <Button
                size="sm"
                variant={editor.translationProvider === 'google' ? 'default' : 'outline'}
                onClick={() => editor.setTranslationProvider('google')}
                className="text-xs font-display"
              >
                🌐 Google Translate (مجاني)
              </Button>
              <Button
                size="sm"
                variant={editor.translationProvider === 'gemini' ? 'default' : 'outline'}
                onClick={() => editor.setTranslationProvider('gemini')}
                className="text-xs font-display"
              >
                🤖 Lovable AI (Gemini)
              </Button>
              <Button
                size="sm"
                variant={editor.translationProvider === 'deepseek' ? 'default' : 'outline'}
                onClick={() => editor.setTranslationProvider('deepseek')}
                className="text-xs font-display"
              >
                🧠 DeepSeek (مفتاحك)
              </Button>
              <Button
                size="sm"
                variant={editor.translationProvider === 'groq' ? 'default' : 'outline'}
                onClick={() => editor.setTranslationProvider('groq')}
                className="text-xs font-display"
              >
                ⚡ Groq (مجاني سريع)
              </Button>
              <Button
                size="sm"
                variant={editor.translationProvider === 'glm' ? 'default' : 'outline'}
                onClick={() => editor.setTranslationProvider('glm')}
                className="text-xs font-display"
              >
                🌟 GLM-4 Flash (مجاني)
              </Button>
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
                    <Button variant="ghost" size="sm" onClick={() => editor.setUserGeminiKey('')} className="text-xs text-destructive shrink-0">
                      مسح
                    </Button>
                  )}
                </div>
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline hover:text-primary/80 shrink-0">
                  احصل على مفتاح مجاني ↗
                </a>
              </div>
              {editor.userGeminiKey ? (
                <p className="text-xs text-secondary font-body">✅ سيتم استخدام مفتاحك الشخصي للترجمة بدون حدود</p>
              ) : (
                <p className="text-xs text-muted-foreground font-body">بدون مفتاح: يستخدم نقاط Lovable AI المدمجة</p>
              )}
            </div>
          )}

          {editor.translationProvider === 'deepseek' && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground font-body">🧠 DeepSeek V3 — جودة عالية في الترجمة. يعمل مجاناً عبر Lovable AI بدون مفتاح، أو أضف مفتاحك الشخصي لحد أعلى.</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="الصق مفتاح DeepSeek API هنا..."
                  value={editor.userDeepSeekKey}
                  onChange={(e) => editor.setUserDeepSeekKey(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-body text-sm"
                  dir="ltr"
                />
                {editor.userDeepSeekKey && (
                  <Button variant="ghost" size="sm" onClick={() => editor.setUserDeepSeekKey('')} className="text-xs text-destructive shrink-0">مسح</Button>
                )}
              </div>
              {editor.userDeepSeekKey
                ? <p className="text-xs text-secondary font-body">✅ مفتاحك الشخصي — حد أعلى وأسرع</p>
                : <p className="text-xs text-secondary font-body">✅ يعمل مجاناً عبر Lovable AI — أو أضف مفتاحك لحد أعلى</p>
              }
            </div>
          )}

          {editor.translationProvider === 'groq' && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground font-body">⚡ Groq (Llama 3.3 70B) — سرعة استثنائية. يعمل مجاناً عبر Lovable AI بدون مفتاح، أو أضف مفتاحك لمزيد من الطلبات.</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="الصق مفتاح Groq API هنا..."
                  value={editor.userGroqKey}
                  onChange={(e) => editor.setUserGroqKey(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-body text-sm"
                  dir="ltr"
                />
                {editor.userGroqKey && (
                  <Button variant="ghost" size="sm" onClick={() => editor.setUserGroqKey('')} className="text-xs text-destructive shrink-0">مسح</Button>
                )}
              </div>
              {editor.userGroqKey
                ? <p className="text-xs text-secondary font-body">✅ مفتاحك الشخصي — حد أعلى وأسرع</p>
                : <p className="text-xs text-secondary font-body">✅ يعمل مجاناً عبر Lovable AI — أو أضف مفتاحك لمزيد من الطلبات</p>
              }
            </div>
          )}

          {editor.translationProvider === 'glm' && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground font-body">🌟 GLM-4 Flash من Zhipu AI — مجاني تماماً بدون حد يومي. أداء جيد للترجمة. يحتاج مفتاح API مجاني.</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="الصق مفتاح GLM API هنا..."
                  value={editor.userGlmKey}
                  onChange={(e) => editor.setUserGlmKey(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-body text-sm"
                  dir="ltr"
                />
                {editor.userGlmKey && (
                  <Button variant="ghost" size="sm" onClick={() => editor.setUserGlmKey('')} className="text-xs text-destructive shrink-0">مسح</Button>
                )}
              </div>
              {editor.userGlmKey
                ? <p className="text-xs text-secondary font-body">✅ سيتم استخدام GLM-4 Flash للترجمة</p>
                : <a href="https://open.bigmodel.cn/usercenter/apikeys" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">احصل على مفتاح GLM المجاني ↗</a>
              }
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
      </CardContent>
    </Card>
  );
};

export default ProviderConfigCard;
