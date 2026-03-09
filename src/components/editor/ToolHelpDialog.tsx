import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Type, ShieldCheck, Rows3, Wand2,
  CheckCircle, Lightbulb, Brain,
} from "lucide-react";

export type ToolType = 
  | 'literal-detect'
  | 'style-unify'
  | 'consistency-check'
  | 'alternatives'
  | 'full-analysis'
  | null;

interface ToolHelpDialogProps {
  tool: ToolType;
  onClose: () => void;
}

const toolInfo: Record<Exclude<ToolType, null>, {
  icon: React.ReactNode;
  title: string;
  description: string;
  features: string[];
  example?: { before: string; after: string };
}> = {
  'literal-detect': {
    icon: <AlertTriangle className="w-6 h-6 text-amber-500" />,
    title: '📝 كشف الترجمات الحرفية',
    description: 'يفحص الترجمات للكشف عن النصوص المترجمة حرفياً (word-by-word) التي تبدو غير طبيعية بالعربية.',
    features: [
      'يكتشف اتباع ترتيب الكلمات الإنجليزي',
      'يحدد التعابير غير المألوفة بالعربية',
      'يقترح صياغة طبيعية بديلة',
      'يعطي درجة "حرفية" من 0-100 لكل ترجمة',
    ],
    example: {
      before: 'أنا لدي شعور جيد حول هذا',
      after: 'لدي إحساس جيد بهذا الأمر',
    },
  },
  'style-unify': {
    icon: <Type className="w-6 h-6 text-primary" />,
    title: '🎨 توحيد الأسلوب',
    description: 'يفحص اتساق النبرة والأسلوب عبر كل الترجمات ويوحدها.',
    features: [
      'يكشف تباين النبرة (رسمية/ودية)',
      'يوحد أسلوب المخاطبة (أنت/أنتم)',
      'يضمن اتساق المصطلحات المتكررة',
      'يحافظ على مستوى رسمية موحد',
    ],
    example: {
      before: 'رح نروح سوا... سوف نذهب معاً',
      after: 'سنذهب معاً... سنسير سوياً',
    },
  },
  'consistency-check': {
    icon: <ShieldCheck className="w-6 h-6 text-emerald-500" />,
    title: '🛡️ فحص الاتساق الشامل',
    description: 'يفحص اتساق الترجمات عبر المشروع بأكمله ويكشف التناقضات.',
    features: [
      'يكشف المصطلح الواحد بترجمات مختلفة',
      'يتحقق من اتساق أسماء الشخصيات',
      'يفحص التزام الترجمات بالقاموس',
      'يعطي درجة اتساق من 0-100',
    ],
    example: {
      before: 'Ouroboros → أوروبوروس / الأوروبوروس / اوروبوروس',
      after: 'Ouroboros → أوروبوروس (موحد)',
    },
  },
  'alternatives': {
    icon: <Rows3 className="w-6 h-6 text-blue-500" />,
    title: '📝 بدائل متعددة الأسلوب',
    description: 'يقدم 4 بدائل مختلفة لكل ترجمة بأساليب متنوعة للاختيار بينها.',
    features: [
      '📚 أدبي: صياغة أدبية راقية',
      '💬 طبيعي: كما يتحدث العرب يومياً',
      '✂️ مختصر: أقصر ما يمكن',
      '🎭 درامي: مناسب للمشاهد المهمة',
    ],
    example: {
      before: 'I will protect everyone!',
      after: 'سأحمي الجميع! / أقسم بحمايتكم! / الحماية واجبي! / لن يمسكم أذى!',
    },
  },
  'full-analysis': {
    icon: <Wand2 className="w-6 h-6 text-purple-500" />,
    title: '🧠 تحليل شامل متكامل',
    description: 'يجمع كل التحليلات السابقة في فحص واحد شامل مع كشف السياق والشخصيات.',
    features: [
      'كشف الترجمات الحرفية',
      'تحديد نوع المشهد (قتال/عاطفي/حوار)',
      'كشف الشخصية المتحدثة تلقائياً',
      'اقتراحات بدائل متعددة الأسلوب',
      'فحص الاتساق مع باقي المشروع',
    ],
    example: {
      before: 'تحليل شامل لكل جوانب الترجمة',
      after: 'سياق + شخصية + حرفية + بدائل + اتساق',
    },
  },
};

const ToolHelpDialog: React.FC<ToolHelpDialogProps> = ({ tool, onClose }) => {
  if (!tool) return null;
  
  const info = toolInfo[tool];
  
  return (
    <Dialog open={!!tool} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            {info.icon}
            <DialogTitle className="text-lg font-display">{info.title}</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-right leading-relaxed">
            {info.description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          {/* Features */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Lightbulb className="w-3.5 h-3.5" /> المميزات:
            </h4>
            <ul className="space-y-1.5">
              {info.features.map((feature, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Example */}
          {info.example && (
            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Brain className="w-3.5 h-3.5" /> مثال:
              </h4>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2 text-xs">
                  <Badge variant="outline" className="shrink-0 text-[10px] h-5 border-destructive/40 text-destructive">قبل</Badge>
                  <span className="text-muted-foreground">{info.example.before}</span>
                </div>
                <div className="flex items-start gap-2 text-xs">
                  <Badge variant="outline" className="shrink-0 text-[10px] h-5 border-emerald-500/40 text-emerald-500">بعد</Badge>
                  <span>{info.example.after}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button onClick={onClose} className="w-full gap-2">
            <CheckCircle className="w-4 h-4" />
            فهمت، موافق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ToolHelpDialog;
