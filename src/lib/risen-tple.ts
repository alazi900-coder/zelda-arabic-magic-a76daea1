/**
 * Risen 1 `.tple` entity-template files (Genome Engine) — a same-size-only,
 * read-only-safe property patcher. This is NOT a full parser of the format
 * (that would require documentation we don't have); it recognizes and edits
 * ONLY float/bool/int property records that match one of three exact,
 * verified byte signatures, and ignores everything else untouched.
 *
 * Format (reverse-engineered from a single real sample, `PC_Hero.tple`,
 * cross-validated against 12 independent property records that all matched
 * this exact layout with zero deviation):
 *
 *   Body: a serialized property tree. Each float property is stored as a
 *   fixed 14-byte record, found by scanning for this exact byte pattern:
 *     0x00  uint16  poolIndex   — index into the trailing string pool (name)
 *     0x02  uint16  0x0021      — constant (type-container marker)
 *     0x04  uint16  0x001e      — constant (float type id)
 *     0x06  uint16  0x0004      — constant (value size = 4 bytes)
 *     0x08  uint16  0x0000      — constant (reserved/padding)
 *     0x0A  float32 value       — the actual property value (little-endian)
 *
 *   Sentinel: 4 bytes `EF BE AD DE` ("DEADBEEF") mark the end of the body
 *   and the start of the string pool header.
 *
 *   String pool: starts 9 bytes after the sentinel (4-byte unknown field +
 *   1-byte padding), then a sequence of [uint16 length][ascii bytes]
 *   entries running to the end of the file. Property/class names are
 *   looked up by their 0-based position in this sequence.
 *
 * A second property kind, boolean, uses the same overall shape with
 * different constants and is likewise cross-validated — 25 independent
 * records in the same sample file, all matching with zero deviation:
 *   0x00  uint16  poolIndex
 *   0x02  uint16  0x0018      — constant (bool type-container marker)
 *   0x04  uint16  0x001e      — constant (same "value slot" marker as float)
 *   0x06  uint16  0x0001      — constant (value size = 1 byte)
 *   0x08  uint16  0x0000      — constant (reserved/padding)
 *   0x0A  uint8   value       — 0 or 1
 *
 * A third kind, integers, was re-investigated after fixing the string-pool
 * bug above (the earlier "no reliable signature" conclusion was simply
 * looking in the wrong place) — confirmed against 11 independent records
 * spanning 3 distinct integer type names ("short"/"int"/"long"), each with
 * the byte width its type name implies:
 *   0x00  uint16  poolIndex        — the property's own name
 *   0x02  uint16  typeNameIndex    — points into the SAME string pool, at a
 *                                    name that must resolve to "short"
 *                                    (2 bytes), "int", or "long" (4 bytes
 *                                    each) — unlike float/bool, the type
 *                                    isn't a fixed constant here
 *   0x04  uint16  0x001e           — the same "value slot" marker as float/bool
 *   0x06  uint16  size             — must match the width implied by the
 *                                    resolved type name exactly (2 or 4)
 *   0x08  uint16  0x0000           — constant (reserved/padding)
 *   0x0A  intN    value            — signed little-endian, N = size bytes
 *
 * Because only records matching one of these three exact signatures are
 * touched, editing never changes the file's length — a patched file can be
 * spliced back into its original archive at the exact same offset.
 */

const SENTINEL = [0xef, 0xbe, 0xad, 0xde];
const POOL_HEADER_SIZE = 9; // bytes between the sentinel and the first pool entry
const FLOAT_RECORD_SIZE = 14;
const FLOAT_MAGIC_1 = 0x0021;
const FLOAT_MAGIC_2 = 0x001e;
const FLOAT_MAGIC_3 = 0x0004;
const FLOAT_MAGIC_4 = 0x0000;
const BOOL_RECORD_SIZE = 11;
const BOOL_MAGIC_1 = 0x0018;
const BOOL_MAGIC_2 = 0x001e;
const BOOL_MAGIC_3 = 0x0001;
const BOOL_MAGIC_4 = 0x0000;
const INT_RECORD_HEADER_SIZE = 10;
const INT_MAGIC_SLOT = 0x001e;
const INT_MAGIC_RESERVED = 0x0000;
/** Confirmed integer type names and their exact byte width — any other type-name reference is left untouched. */
const INT_TYPE_SIZES: Record<string, number> = { short: 2, int: 4, long: 4 };
const MAX_POOL_STRING_LEN = 500;

export interface TpleFloatProperty {
  name: string;
  poolIndex: number;
  recordOffset: number;
  valueOffset: number;
  value: number;
}

export interface TpleBoolProperty {
  name: string;
  poolIndex: number;
  recordOffset: number;
  valueOffset: number;
  value: boolean;
}

export interface TpleIntProperty {
  name: string;
  poolIndex: number;
  typeName: string;
  recordOffset: number;
  valueOffset: number;
  size: number;
  value: number;
}

export interface TplePropertyInfo {
  label: string;
  description: string;
  category: "movement" | "physics" | "other";
  /** Real owning game-engine class (e.g. "الفريق" for gCParty_PS), used only
   * to group "other"-category properties into collapsible sections in the
   * file manager UI — does not affect movement/physics section placement. */
  system?: string;
}

/** Curated, verified explanations — only for properties whose meaning is
 * confidently understood from their (self-descriptive) name and the
 * gCCharacterMovement_PS context they were found in. Anything else found
 * by the generic scan is shown with its raw name and no invented meaning. */
export const TPLE_PROPERTY_INFO: Record<string, TplePropertyInfo> = {
  // gCCharacterMovement_PS — تأكّدنا عبر فحص أرشيف حقيقي كامل (2679 ملف .tple)
  // أن كل خصائص هذا القسم لا تظهر إلا في ملف واحد عبر كامل الأرشيف:
  // NPC/World/PC_Hero.tple (شخصية اللاعب نفسها) — لا تتكرر بقيم خاصة بها في
  // أي ملف NPC آخر. أي أنها تخص شخصية اللاعب تحديداً في هذا الأرشيف، وأي
  // شخصية أخرى بحركة مختلفة تُدار على الأرجح عبر آلية أخرى (وراثة قالب أو
  // ملف منفصل) لا تظهر كسجلات صريحة هنا.
  ForwardSpeedMax: {
    label: "أقصى سرعة للأمام",
    description: "السرعة القصوى عند الجري للأمام. زيادتها = جري أسرع للأمام، تخفيضها = أبطأ. تُضرب أحياناً بمعامل إضافي (SlowModifier عند المشي الخفيف، FastModifier عند الجري القوي) — إن لم يظهر أثر تعديلها وحدها، عدّلها مع تلك المعاملات معاً عبر «تعديل جماعي عبر الأرشيف».",
    category: "movement",
  },
  StrafeSpeedMax: {
    label: "أقصى سرعة جانبية",
    description: "السرعة القصوى عند التحرك يميناً/يساراً بلا دوران. مستقلة عن السرعة الأمامية — عدّلها وحدها لو أردت حركة جانبية أسرع/أبطأ تحديداً دون التأثير على الجري للأمام.",
    category: "movement",
  },
  BackwardSpeedMax: {
    label: "أقصى سرعة للخلف",
    description: "السرعة القصوى عند التحرك للخلف. عادة أبطأ من الأمامية بتصميم الألعاب — رفعها بشدة قد يجعل التراجع للخلف يبدو غير طبيعي بصرياً.",
    category: "movement",
  },
  TurnSpeedMax: {
    label: "أقصى سرعة دوران",
    description: "أقصى سرعة يمكن أن تلتفت بها الشخصية حول نفسها. رفعها = التفاف أسرع (شبه فوري عند قيم كبيرة جداً)، خفضها = التفاف بطيء وثقيل الحس.",
    category: "movement",
  },
  TurnSpeedModifier: {
    label: "معامل سرعة الدوران",
    description: "معامل يُضرب في TurnSpeedMax — طريقة سريعة لتكبير أو تصغير سرعة الدوران كلها بضربة واحدة، بدل تعديل كل خاصية دوران على حدة. مثال: 1.0 = بلا تغيير، 2.0 = ضعف السرعة.",
    category: "movement",
  },
  MoveAcceleration: {
    label: "تسارع الحركة",
    description: "مدى سرعة وصول الشخصية من السكون إلى أقصى سرعتها عند بدء الحركة. رفعها = انطلاق شبه فوري (استجابة أسرع للتحكم)، خفضها = تسارع تدريجي ملحوظ قبل بلوغ السرعة القصوى.",
    category: "movement",
  },
  MoveDecceleration: {
    label: "تباطؤ الحركة",
    description: "مدى سرعة توقف الشخصية عند إيقاف الحركة. رفعها = توقف شبه فوري وحاد، خفضها (أو قيمة سالبة كبيرة كـ-1000) = «انزلاق» لمسافة قبل التوقف الكامل.",
    category: "movement",
  },
  TurnAcceleration: {
    label: "تسارع الدوران",
    description: "مدى سرعة وصول دوران الشخصية لأقصى سرعته — نفس مبدأ MoveAcceleration لكن للالتفاف بدل الانتقال المكاني.",
    category: "movement",
  },
  TurnDecceleration: {
    label: "تباطؤ الدوران",
    description: "مدى سرعة توقف دوران الشخصية عن الالتفاف — نفس مبدأ MoveDecceleration لكن للدوران.",
    category: "movement",
  },
  SlowModifier: {
    label: "معامل السرعة البطيئة",
    description: "معامل يُضرب في السرعة الأساسية (مثل ForwardSpeedMax) أثناء المشي الخفيف (تحريك العصا التناظرية بقوة قليلة). مثال: 1.0 = بلا تغيير، 0.5 = نصف السرعة، 1.5 = أسرع بنسبة 50%. لتغيير سرعة المشي البطيء فقط دون الجري، عدّل هذه وحدها؛ ولتغيير السرعة في كل الحالات، عدّلها مع خاصيتَي FastModifier و ForwardSpeedMax معاً.",
    category: "movement",
  },
  FastModifier: {
    label: "معامل السرعة السريعة",
    description: "نفس مبدأ SlowModifier لكن أثناء الجري القوي (تحريك العصا للأقصى) — هذا هو المعامل الذي يحدد سرعة الجري الفعلية. عدّله تحديداً لو أردت تسريع/تبطئة الجري دون التأثير على المشي البطيء.",
    category: "movement",
  },
  SneakModifier: {
    label: "معامل التسلل",
    description: "نفس المبدأ لكن أثناء التسلل (وضعية الاختباء/القرفصاء). عدّله لجعل التسلل أسرع أو أبطأ دون التأثير على المشي أو الجري العاديين.",
    category: "movement",
  },

  // ما يلي أيضاً من نفس فئة gCCharacterMovement_PS (تأكّدنا من ذلك من ترتيب
  // مجمّع الأسماء داخل الملف نفسه، وليس تخميناً) — معظمها إعدادات سقوط/قفز/تسلق.
  FallVelocity: {
    label: "سرعة السقوط",
    description: "سرعة السقوط الحالية أثناء الهبوط الحر. تُستخدم داخلياً لحساب تسارع السقوط؛ قد تكون قيمة حالة تشغيل لحظية أكثر من كونها إعداداً ثابتاً.",
    category: "movement",
  },
  QuadrupedSlopeInertia: {
    label: "قصور الرباعي على المنحدر",
    description: "قصور ذاتي إضافي عند حركة الكيانات رباعية الأرجل على المنحدرات — يؤثر فقط إن كانت IsQuadruped مفعَّلة لهذا الكيان.",
    category: "movement",
  },
  StepHeight: {
    label: "ارتفاع الدرجة",
    description: "أقصى ارتفاع لعتبة أو درجة يمكن للشخصية صعودها تلقائياً أثناء المشي دون الحاجة للقفز. رفعها يسمح بتجاوز عوائق أعلى بسلاسة.",
    category: "movement",
  },
  FallDownMinGroundDist: {
    label: "أدنى مسافة لبدء السقوط",
    description: "أقل مسافة عن الأرض تُعتبر بعدها الشخصية «في حالة سقوط» بدل واقفة على الأرض.",
    category: "movement",
  },
  LevitationModifier: {
    label: "معامل التحليق",
    description: "معامل يُضرب في سرعة الحركة أثناء التحليق/الطفو (Levitation) إن كانت اللعبة تُفعِّل هذه الحالة لهذا الكيان.",
    category: "movement",
  },
  SteepGroundAngleMin: {
    label: "أدنى زاوية منحدر شديد",
    description: "أدنى زاوية ميل للأرض تبدأ عندها اللعبة معاملة السطح كمنحدر شديد (يؤثر على الحركة/الانزلاق عليه).",
    category: "movement",
  },
  SteepGroundAngleMax: {
    label: "أقصى زاوية للوقوف",
    description: "أقصى زاوية ميل قبل اعتبار السطح غير قابل للوقوف عليه إطلاقاً (تنزلق عنه الشخصية حتماً).",
    category: "movement",
  },
  WalkDownSpeedScale: {
    label: "معامل سرعة النزول",
    description: "معامل يُضرب في السرعة عند النزول على منحدر (عادة أقل من 1 لإبطاء الهبوط والحفاظ على التوازن).",
    category: "movement",
  },
  SensorAdvanceDuration: {
    label: "مدة استشعار الأرضية المسبق",
    description: "المدة التي يستشعر بها محرك الحركة تضاريس الأرض أمام الشخصية مسبقاً، لتوقّع التغيّرات القادمة وتنعيم الحركة عليها.",
    category: "movement",
  },
  SensorMinSlideAngle: {
    label: "أدنى زاوية انزلاق",
    description: "أدنى زاوية ميل تبدأ عندها الشخصية بالانزلاق تلقائياً بدل الثبات في مكانها.",
    category: "movement",
  },
  SensorInertia: {
    label: "قصور مستشعر الأرضية",
    description: "مدى تأخّر استجابة مستشعر الأرضية للتغيرات المفاجئة في التضاريس — قيمة أعلى تعني حركة أكثر نعومة لكن استجابة أبطأ.",
    category: "movement",
  },
  GroundSlopeTransInertia: {
    label: "قصور الانتقال بين الميول",
    description: "قصور ذاتي عند الانتقال بين درجات ميل أرضية مختلفة — يمنع تغيّرات حادة مفاجئة في زاوية وقوف الشخصية.",
    category: "movement",
  },
  FallSteerScaleFactor: {
    label: "معامل التوجيه أثناء السقوط",
    description: "مدى قدرة اللاعب على التحكم في اتجاه الشخصية أثناء السقوط الحر. صفر = بلا تحكم إطلاقاً في الهواء.",
    category: "movement",
  },
  FallXZDecceleration: {
    label: "تباطؤ أفقي أثناء السقوط",
    description: "تباطؤ الحركة الأفقية (يميناً/يساراً وأماماً/خلفاً) أثناء السقوط — يبطئ اندفاع الشخصية أفقياً وهي تسقط بدل الاستمرار بنفس الزخم.",
    category: "movement",
  },
  FallXZDeccelerationWarmUpTime: {
    label: "مهلة قبل تباطؤ السقوط الأفقي",
    description: "الوقت قبل أن يبدأ تباطؤ الحركة الأفقية أثناء السقوط (FallXZDecceleration) بالتأثير فعلياً بعد بدء السقوط.",
    category: "movement",
  },
  DontStopFallAngleMin: {
    label: "أدنى زاوية لعدم إيقاف السقوط",
    description: "أدنى زاوية سقوط لا تتوقف عندها حركة السقوط تلقائياً — تمنع «التعليق» غير الطبيعي عند حواف بسيطة أو انحدارات طفيفة.",
    category: "movement",
  },
  WaterWadeDepth: {
    label: "عمق بداية الخوض بالماء",
    description: "عمق الماء الذي تبدأ عنده الشخصية «الخوض» (حركة مختلفة عن المشي العادي) بدل السير الطبيعي.",
    category: "movement",
  },
  WaterDeathDepth: {
    label: "عمق الغمر الكامل",
    description: "عمق الماء الذي يُعتبر الكيان عنده مغموراً بالكامل — قد يرتبط بمخاطر الغرق لكيانات لا تملك حركة سباحة.",
    category: "movement",
  },
  LastFallVelocity: {
    label: "آخر سرعة سقوط",
    description: "آخر سرعة سقوط مسجَّلة — على الأرجح حالة تشغيل محفوظة من آخر مرة سقطت فيها الشخصية، وليست إعداداً تصممه أنت.",
    category: "movement",
  },
  ClimbHeightMin: {
    label: "أدنى ارتفاع تسلّق",
    description: "أدنى ارتفاع عائق تعتبره اللعبة قابلاً للتسلق (أقل من هذا يُعامَل كدرجة عادية تُصعَد بلا حركة تسلّق خاصة).",
    category: "movement",
  },
  ClimbHeightLow: {
    label: "ارتفاع تسلّق منخفض",
    description: "حد ارتفاع يستخدمه محرك اللعبة لاختيار نوع حركة تسلّق «قصيرة» مناسبة لعوائق منخفضة نسبياً.",
    category: "movement",
  },
  ClimbHeightMid: {
    label: "ارتفاع تسلّق متوسط",
    description: "حد ارتفاع يستخدمه محرك اللعبة لاختيار نوع حركة تسلّق «متوسطة» لعوائق بارتفاع متوسط.",
    category: "movement",
  },
  ClimbHeightHigh: {
    label: "ارتفاع تسلّق عالٍ",
    description: "حد ارتفاع يستخدمه محرك اللعبة لاختيار حركة تسلّق «كاملة» لعوائق عالية نسبياً.",
    category: "movement",
  },
  ClimbFrontDepth1: {
    label: "عمق أمامي للتسلّق (1)",
    description: "المسافة الأمامية المطلوبة (المرحلة الأولى) قبل أن تبدأ اللعبة حركة تسلّق سليمة عند مواجهة عائق.",
    category: "movement",
  },
  ClimbFrontDepth2: {
    label: "عمق أمامي للتسلّق (2)",
    description: "نفس مبدأ العمق الأمامي للتسلّق، لكن للمرحلة الثانية من الحركة.",
    category: "movement",
  },
  ClimbFrontDepth3: {
    label: "عمق أمامي للتسلّق (3)",
    description: "نفس مبدأ العمق الأمامي للتسلّق، لكن للمرحلة الثالثة (الأعمق/الأخيرة) من الحركة.",
    category: "movement",
  },
  ClimbTargetGroundAngleMax: {
    label: "أقصى زاوية هبوط بعد التسلّق",
    description: "أقصى زاوية ميل للأرض المستهدفة يمكن أن تهبط عندها حركة التسلّق بنجاح دون فشل الحركة.",
    category: "movement",
  },
  ClimbFlightGravity: {
    label: "جاذبية أثناء التسلّق",
    description: "قوة الجاذبية المطبَّقة أثناء المرحلة الانتقالية («الطيران») بين بداية حركة التسلّق ونهايتها.",
    category: "movement",
  },
  ClimbFlightForwardTime: {
    label: "مدة الاندفاع أثناء التسلّق",
    description: "مدة الاندفاع الأمامي أثناء تنفيذ حركة التسلّق — تؤثر على مدى واقعية/سلاسة حركة اليدين والجسم أثناء الصعود.",
    category: "movement",
  },
  JumpHeight: {
    label: "ارتفاع القفز",
    description: "أقصى ارتفاع تصل إليه الشخصية عند القفز. زيادتها = قفز أعلى؛ تخفيضها = قفز أقصر.",
    category: "movement",
  },
  JumpFrontSpeedFactor: {
    label: "معامل الاندفاع الأمامي بالقفز",
    description: "معامل يُضرب في السرعة الأمامية أثناء القفز — يحدد مدى اندفاع الشخصية للأمام وهي في الهواء.",
    category: "movement",
  },
  JumpFlightGravity: {
    label: "جاذبية القفزة",
    description: "قوة الجاذبية المطبَّقة أثناء مرحلة الطيران في القفزة — تحدد شكل منحنى القفزة (قفزة عالية بطيئة الهبوط مقابل قفزة قصيرة سريعة السقوط).",
    category: "movement",
  },
  JumpTranslationCtrlFactor: {
    label: "تحكّم بالموضع أثناء القفز",
    description: "مدى تحكم اللاعب في تعديل موضع/مسار الشخصية أثناء وجودها في الهواء بعد القفز.",
    category: "movement",
  },
  JumpRotationCtrlFactor: {
    label: "تحكّم بالدوران أثناء القفز",
    description: "مدى تحكم اللاعب في تدوير اتجاه الشخصية أثناء القفز.",
    category: "movement",
  },
  SlideSpeed: {
    label: "سرعة الانزلاق",
    description: "سرعة حركة الانزلاق — كالانزلاق على منحدر حاد أو أثناء حركة انزلاقية مخصصة في اللعبة.",
    category: "movement",
  },
  LevitationFallVelo: {
    label: "سرعة سقوط أثناء التحليق",
    description: "سرعة السقوط أثناء حالة التحليق/الطفو تحديداً، منفصلة عن FallVelocity العادية أثناء السقوط الحر الطبيعي.",
    category: "movement",
  },
  LevitationUpVelo: {
    label: "سرعة صعود أثناء التحليق",
    description: "سرعة الصعود لأعلى أثناء حالة التحليق/الطفو.",
    category: "movement",
  },
  LevitationMaxUpwardMove: {
    label: "أقصى صعود بالتحليق",
    description: "أقصى مسافة صعود يمكن قطعها خلال حالة واحدة من التحليق/الطفو.",
    category: "movement",
  },

  // ملاحظة من فحص الأرشيف الحقيقي الكامل: خصائص نعم/لا التالية توجد في
  // ملفين فقط عبر كل الأرشيف — NPC/World/PC_Hero.tple (شخصية اللاعب) وباب
  // قابل للتدمير (Obj_EVT_DestructableDoor_Temple_01.tple) — وليس في كل
  // الكيانات كما قد يُفهم من الاسم العام "فيزياء".
  PhysicsEnabled: {
    label: "تفعيل الفيزياء",
    description: "هل يتأثر الكيان بمحرك الفيزياء (الجاذبية والتصادم) عموماً. تعطيلها (لا) يجعله يتجاهل الجاذبية والتصادم تماماً — قد يُعلَّق في الهواء أو يمر خلال الجدران. غيّرها بحذر شديد؛ للشخصيات تبقى «نعم» عادة.",
    category: "physics",
  },
  IsQuadruped: {
    label: "كائن رباعي الأرجل",
    description: "هل تُعالَج حركة الكيان كحيوان رباعي الأرجل بدل ثنائي القدمين. لا تغيّر النموذج ثلاثي الأبعاد أو الحركات الفعلية (تلك في ملفات أخرى)، فقط طريقة حساب الحركة داخلياً — تفعيلها لكيان بنموذج ثنائي القدمين قد يسبب سلوكاً غريباً.",
    category: "physics",
  },
  DoHeightCorrection: {
    label: "تصحيح الارتفاع",
    description: "تصحيح تلقائي لارتفاع الكيان فوق سطح الأرض (يمنع «الغرق» في الأرض أو «التحليق» فوقها بشكل طفيف على تضاريس غير مستوية). تعطيلها قد يجعل الكيان يبدو منخفضاً أو مرتفعاً قليلاً حسب المكان.",
    category: "physics",
  },
  DisableCollision: {
    label: "تعطيل التصادم",
    description: "تجاهل التصادم مع هذا الشكل بالكامل — يصبح قابلاً للمرور خلاله (لا يوقف اللاعب أو غيره). فعّلها (نعم) للأشكال الزخرفية التي لا تحتاج تصادماً حقيقياً.",
    category: "physics",
  },
  DisableResponse: {
    label: "تعطيل استجابة التصادم",
    description: "يبقى اكتشاف التلامس يعمل (لتفعيل أحداث كاللمس) لكن دون استجابة فيزيائية فعلية (لا دفع ولا إيقاف). مفيد لمناطق «حساسة» غير مرئية تحتاج فقط معرفة أن شيئاً دخلها.",
    category: "physics",
  },
  IsClimbable: {
    label: "قابل للتسلق",
    description: "هل يمكن للاعب تسلّق هذا الشكل (كجدار أو صخرة). تفعيلها يسمح باستخدام حركة التسلّق عليه إن كانت اللعبة تدعم هذا النوع من الأسطح في مكان الكيان.",
    category: "physics",
  },
  HitByProjectile: {
    label: "يُصاب بالمقذوفات",
    description: "هل يمكن أن يُصاب هذا الكيان بمقذوفات (سهام، رماح، إلخ). تعطيلها يجعل المقذوفات تمر عبره دون إصابته أو إيقافها.",
    category: "physics",
  },
  IgnoredByTraceRay: {
    label: "يُتجاهل عند فحص خط الرؤية",
    description: "يُستثنى هذا الشكل من فحوصات الرؤية/الاصطدام الشعاعية (Raycast) — تُستخدم مثلاً لتحديد هل يرى عدوٌّ اللاعبَ أم يحجبه جدار. تفعيلها يجعل الشكل «شفافاً» لهذه الفحوصات تحديداً، حتى لو بقي صلباً فيزيائياً.",
    category: "physics",
  },
  IsUnique: {
    label: "شكل فريد",
    description: "شكل تصادم مخصَّص لهذا الكيان فقط، غير مشترَك مع كيانات أخرى بنفس القالب. إعداد بنيوي/أداء داخلي غالباً — تعديله دون فهم دقيق قد لا يُحدث أثراً مرئياً في اللعبة.",
    category: "physics",
  },
  EnableCCD: {
    label: "كشف تصادم مستمر",
    description: "يمنع الأجسام سريعة الحركة جداً (مقذوف أو كيان يتحرك بسرعة كبيرة) من «اختراق» أجسام أخرى بدل الاصطدام بها. فعّلها فقط للكيانات سريعة الحركة (تكلفتها الحسابية أعلى من الفحص العادي).",
    category: "physics",
  },
  OverrideEntityAABB: {
    label: "تجاوز الصندوق المحيط",
    description: "استخدام صندوق تصادم مخصَّص (bounding box) بدل المُحسَب تلقائياً من الشكل. يُستخدم لضبط دقيق؛ تعديله دون بيانات الصندوق الفعلية غالباً بلا فائدة عملية.",
    category: "physics",
  },
  TriggersOnTouch: {
    label: "يُفعَّل عند اللمس",
    description: "يُطلق حدثاً برمجياً (سكربت) عند بدء تلامس اللاعب أو كيان آخر مع هذا الشكل — أساس آليات كالفخاخ ومناطق التفعيل. تعطيلها يوقف الحدث دون حذف الشكل نفسه.",
    category: "physics",
  },
  TriggersOnUntouch: {
    label: "يُفعَّل عند مغادرة اللمس",
    description: "نفس مبدأ «يُفعَّل عند اللمس» لكن عند انتهاء التلامس (مغادرة المنطقة) بدل بدايته.",
    category: "physics",
  },
  TriggersOnIntersect: {
    label: "يُفعَّل عند التقاطع",
    description: "يُطلق حدثاً عند تقاطع هذا الشكل مع شكل آخر، وليس بالضرورة تلامساً مباشراً مع اللاعب — يُستخدم لتفاعلات بين كيانات وأشكال أخرى في المشهد.",
    category: "physics",
  },
  IsLazyGenerated: {
    label: "يُولَّد عند الحاجة فقط",
    description: "لا يُنشأ الشكل الفيزيائي فعلياً في الذاكرة إلا عند الحاجة الفعلية له (تحسين أداء). إعداد داخلي، أثره على السلوك المرئي في اللعبة غالباً معدوم.",
    category: "physics",
  },
  SensorAffectsDirection: {
    label: "المستشعر يؤثر على الاتجاه",
    description: "هل يؤثر مستشعر ملامسة الأرضية على اتجاه حركة الشخصية (كمحاذاة الحركة مع انحدار سطح غير مستوٍ). تعطيلها يجعل الحركة على المنحدرات أقل واقعية لكن أكثر قابلية للتنبؤ.",
    category: "physics",
  },
  ForceGroundAlignment: {
    label: "إجبار محاذاة الأرضية",
    description: "إجبار محاذاة جسم الشخصية بالكامل مع ميل سطح الأرض تحتها (كالوقوف مائلاً على منحدر). تعطيلها يُبقيها عمودية دوماً بغض النظر عن ميل الأرض.",
    category: "physics",
  },
  CanBePushedWhileIdle: {
    label: "يمكن دفعه أثناء الثبات",
    description: "هل يمكن دفع الشخصية بواسطة كيانات أخرى أو اللاعب أثناء وقوفها ساكنة دون حركة. تعطيلها يجعلها «ثابتة» فيزيائياً حتى لو صدمها شيء.",
    category: "physics",
  },
  TreatWaterAsSolid: {
    label: "معاملة الماء كسطح صلب",
    description: "يمنع الشخصية من الغوص فعلياً في الماء ويعامل سطحه كأرضية صلبة يمكن السير عليها بدل السباحة فيه — يُستخدم غالباً لكيانات لا تملك حركة سباحة.",
    category: "physics",
  },
  DisableTranslation: {
    label: "تعطيل الانتقال المكاني",
    description: "تعطيل كامل لأي تغيّر في موضع الكيان (لا يمكنه التحرك من مكانه إطلاقاً بعد التفعيل، حتى لو حاول). فعّلها فقط لكيانات ثابتة تماماً بتصميم اللعبة.",
    category: "physics",
  },
  DisableRotation: {
    label: "تعطيل الدوران",
    description: "تعطيل كامل لدوران الكيان حول نفسه — يبقى موجَّهاً بنفس الزاوية دوماً. مفيد لكيانات لا يجب أن تلتفت أبداً.",
    category: "physics",
  },

  // ما يلي من فئات gCDynamicCollisionCircle_PS (Radius)، eCRigidBody_PS (البقية
  // حتى CCDMotionTreshold)، وeCCollisionShape بلا لاحقة _PS (SkinWidth تحديداً
  // — تأكّدنا من الفارق الدقيق بين الاسمين من فحص أرشيف حقيقي كامل). كلها أيضاً
  // توجد في ملف واحد فقط عبر كل الأرشيف: NPC/World/PC_Hero.tple.
  Radius: {
    label: "نصف قطر دائرة التصادم",
    description: "نصف قطر دائرة التصادم الديناميكية المستخدمة لهذا الكيان — تُستخدم غالباً لحساب الازدحام/التنافر بين الشخصيات القريبة من بعضها.",
    category: "physics",
  },
  TotalMass: {
    label: "الكتلة الكلية",
    description: "الكتلة الفيزيائية الكلية للجسم — تؤثر على قوة الدفع/الاصطدام المطلوبة لتحريكه إن كانت الفيزياء الكاملة مفعَّلة له (PhysicsEnabled = نعم).",
    category: "physics",
  },
  WakeUpCounter: {
    label: "عدّاد الاستيقاظ الفيزيائي",
    description: "عدّاد/عتبة داخلية تحدد متى «يستيقظ» الجسم فيزيائياً من حالة السكون لإعادة حساب الفيزياء عليه — إعداد تحسين أداء داخلي.",
    category: "physics",
  },
  LinearDamping: {
    label: "تخميد الحركة الخطية",
    description: "تخميد (احتكاك افتراضي) يُبطئ توقف الحركة الخطية تدريجياً بعد أي قوة فيزيائية مؤثرة على الجسم. قيمة أعلى = توقف أسرع.",
    category: "physics",
  },
  AngularDamping: {
    label: "تخميد الدوران",
    description: "نفس مبدأ تخميد الحركة الخطية لكن للدوران — يُبطئ توقف الدوران الفيزيائي للجسم بعد أي قوة تُحدث دوراناً.",
    category: "physics",
  },
  MaxAngularVelocity: {
    label: "أقصى سرعة دوران فيزيائية",
    description: "أقصى سرعة دوران فيزيائية مسموحة للجسم — يمنع دورانه بسرعة غير واقعية بعد تصادم قوي.",
    category: "physics",
  },
  CCDMotionTreshold: {
    label: "عتبة كشف التصادم المستمر",
    description: "الحد الأدنى لسرعة الحركة التي يُفعَّل عندها كشف التصادم المستمر (CCD) تلقائياً، لمنع اختراق الأجسام السريعة الحركة لبعضها.",
    category: "physics",
  },
  SkinWidth: {
    label: "هامش سطح التصادم",
    description: "هامش رقيق حول سطح شكل التصادم يُستخدم لتحسين استقرار حسابات الفيزياء (يمنع «الارتعاش» عند التلامس الدقيق بين الأسطح).",
    category: "physics",
  },

  // الخصائص التالية (نعم/لا وعشرية) تنتمي لأنظمة أخرى — تأكّدنا من فئة كل
  // واحدة من اسم الفئة البرمجية (مثل gCDialog_PS أو gCEffect_PS) الظاهر في
  // مجمّع الأسماء داخل الملف مباشرة قبل كل مجموعة خصائصها، وليس تخميناً.
  // تبقى مصنَّفة "other" لعدم وجود قسم واجهة مخصَّص لها بعد.

  // gCNPC_PS — حالة الشخصية غير القابلة للعب (NPC) تجاه اللاعب.
  LastFightTimestamp: {
    label: "توقيت آخر قتال",
    description: "الطابع الزمني لآخر قتال خاضته هذه الشخصية — حالة تشغيل/ذاكرة محفوظة، وليست إعداداً تصممه.",
    category: "other", system: "الشخصية (NPC)",
  },
  PlayerWeaponTimestamp: {
    label: "توقيت إشهار سلاح اللاعب",
    description: "الطابع الزمني لآخر مرة أشهر فيها اللاعب سلاحه أمام هذه الشخصية — يُستخدم غالباً لتذكّر سلوك عدائي محتمل من الشخصية.",
    category: "other", system: "الشخصية (NPC)",
  },
  LastDistToTarget: {
    label: "آخر مسافة للهدف",
    description: "آخر مسافة مُسجَّلة بين هذه الشخصية وهدفها الحالي — حالة تشغيل داخلية لنظام الذكاء الاصطناعي.",
    category: "other", system: "الشخصية (NPC)",
  },
  LastDistToGuardPoint: {
    label: "آخر مسافة لنقطة الحراسة",
    description: "آخر مسافة مُسجَّلة بين الشخصية ونقطة حراستها (GuardPoint) — تُستخدم في منطق الدورية/الحراسة.",
    category: "other", system: "الشخصية (NPC)",
  },
  DefeatedByPlayer: {
    label: "هُزم على يد اللاعب",
    description: "هل هُزمت هذه الشخصية على يد اللاعب من قبل — حالة تُسجَّل بعد المعركة، وليست إعداد بداية.",
    category: "other", system: "الشخصية (NPC)",
  },
  Ransacked: {
    label: "نُهب من قبل",
    description: "هل نُهب/فُتِّش هذا الكيان (كصندوق أو جثة) من قبل اللاعب مسبقاً.",
    category: "other", system: "الشخصية (NPC)",
  },
  Discovered: {
    label: "اكتُشف من قبل",
    description: "هل اكتشف اللاعب هذا الكيان/الشخصية من قبل — يؤثر مثلاً على ظهوره على الخريطة أو سجل المعرفة.",
    category: "other", system: "الشخصية (NPC)",
  },

  // gCScriptRoutine_PS — حالة تنفيذ الروتين السلوكي والذكاء الاصطناعي.
  TaskTime: {
    label: "وقت المهمة الحالية",
    description: "الوقت المنقضي في المهمة/الروتين الحالي الذي تنفذه الشخصية — حالة تشغيل داخلية لنظام الذكاء الاصطناعي (AI).",
    category: "other", system: "الذكاء الاصطناعي والروتين",
  },
  StateTime: {
    label: "وقت الحالة السلوكية",
    description: "الوقت المنقضي في الحالة (State) السلوكية الحالية للشخصية ضمن آلة الحالات الخاصة بالذكاء الاصطناعي.",
    category: "other", system: "الذكاء الاصطناعي والروتين",
  },
  EndAttackTimestamp: {
    label: "توقيت انتهاء الهجوم",
    description: "الطابع الزمني لانتهاء آخر هجوم نفّذته الشخصية — يُستخدم لحساب فترات التهدئة (cooldown) بين الهجمات.",
    category: "other", system: "الذكاء الاصطناعي والروتين",
  },
  LockAIInterrupt: {
    label: "قفل مقاطعة الذكاء الاصطناعي",
    description: "هل الذكاء الاصطناعي للشخصية مُقفَل حالياً ضد المقاطعة (لا يمكن مقاطعة روتينه الحالي بحدث خارجي).",
    category: "other", system: "الذكاء الاصطناعي والروتين",
  },
  LockAIResult: {
    label: "قفل نتيجة الذكاء الاصطناعي",
    description: "هل نتيجة قرار الذكاء الاصطناعي الحالية مُثبَّتة (لا تُعاد حسابها) — إعداد تحكّم داخلي بمحرك السلوك.",
    category: "other", system: "الذكاء الاصطناعي والروتين",
  },
  RoutineChanged: {
    label: "تغيّر الروتين",
    description: "علامة داخلية تشير إلى أن روتين/مهمة الشخصية تغيّر مؤخراً — يستخدمها النظام ليعرف متى يُعيد تهيئة السلوك الجديد.",
    category: "other", system: "الذكاء الاصطناعي والروتين",
  },

  // gCDamage_PS — حساب الضرر العام (منفصلة عن DamageBonus/DamageAmount أدناه).
  DamageMultiplier: {
    label: "معامل الضرر",
    description: "معامل عام يُضرب في كل الضرر الذي يتلقاه هذا الكيان. أقل من 1.0 = مقاومة/تخفيف ضرر، أكبر من 1.0 = ضعف وضرر إضافي.",
    category: "other", system: "الضرر",
  },

  // gCDialog_PS — التجارة والحوار والتفاعل الاجتماعي مع الشخصية.
  EndDialogTimestamp: {
    label: "توقيت انتهاء المحادثة",
    description: "الطابع الزمني لانتهاء آخر محادثة مع هذه الشخصية — حالة تشغيل.",
    category: "other", system: "الحوار والتجارة",
  },
  SaleModifier: {
    label: "معامل سعر البيع",
    description: "معامل يُضرب في أسعار بيع هذه الشخصية (كتاجر) للاعب. أقل من 1.0 = بيع أرخص، أكبر من 1.0 = أغلى.",
    category: "other", system: "الحوار والتجارة",
  },
  PurchaseModifier: {
    label: "معامل سعر الشراء",
    description: "معامل يُضرب في السعر الذي تدفعه هذه الشخصية عند شراء أغراض اللاعب منه. أعلى = تدفع الشخصية أكثر مقابل أغراضك.",
    category: "other", system: "الحوار والتجارة",
  },
  TradeEnabled: {
    label: "التجارة مفعَّلة",
    description: "هل تفتح هذه الشخصية واجهة التجارة عند التفاعل معها (تاجر فعّال أم لا).",
    category: "other", system: "الحوار والتجارة",
  },
  TeachEnabled: {
    label: "التعليم مفعَّل",
    description: "هل يمكن لهذه الشخصية تعليم اللاعب مهارات (كمدرّب/معلّم) عند التفاعل معها.",
    category: "other", system: "الحوار والتجارة",
  },
  TalkedToPlayer: {
    label: "تحدّث مع اللاعب",
    description: "هل تحدّثت هذه الشخصية مع اللاعب من قبل — حالة تُسجَّل بعد أول محادثة معها.",
    category: "other", system: "الحوار والتجارة",
  },
  PartyEnabled: {
    label: "الانضمام كرفيق مفعَّل",
    description: "هل يمكن للاعب دعوة هذه الشخصية للانضمام كرفيق في فريقه.",
    category: "other", system: "الحوار والتجارة",
  },
  MobEnabled: {
    label: "الانضمام كعصابة مفعَّل",
    description: "هل يمكن للاعب الانضمام لهذه الشخصية كعصابة/فصيل (Mob) ضمن آليات معيّنة في اللعبة.",
    category: "other", system: "الحوار والتجارة",
  },
  SlaveryEnabled: {
    label: "الاسترقاق مفعَّل",
    description: "هل يمكن استرقاق/تجنيد هذه الشخصية قسراً ضمن آليات معيّنة في اللعبة (إن وُجدت).",
    category: "other", system: "الحوار والتجارة",
  },
  PickedPocket: {
    label: "نُشل جيبه من قبل",
    description: "هل سبق للاعب أن نشل جيب هذه الشخصية (سرقة خفية) من قبل.",
    category: "other", system: "الحوار والتجارة",
  },

  // eCAnimation_PS — الحركة والرسوم المتحركة والدُّمية الفيزيائية.
  RagDollMass: {
    label: "كتلة الدُّمية المترهّلة",
    description: "الكتلة الفيزيائية المستخدَمة عند تفعيل جسم الدُّمية المترهّلة (Ragdoll) — كعند سقوط الشخصية ميتة. تؤثر على واقعية سقوط الجثة.",
    category: "other", system: "الحركة والرسوم المتحركة",
  },
  EnableRepositioning: {
    label: "إعادة الضبط الآلي للموضع",
    description: "هل يُسمح لنظام الرسوم المتحركة بإعادة ضبط موضع الشخصية تلقائياً أثناء الحركة (Root motion) بدل الاعتماد فقط على أوامر التحكم المباشرة.",
    category: "other", system: "الحركة والرسوم المتحركة",
  },

  // eCEntityProxy — تصحيح: كانت مصنَّفة سابقاً كـ gCNavigation_PS بالخطأ؛
  // فحص أرشيف حقيقي كامل أظهر أن فئتها الفعلية السابقة لها في مجمّع الأسماء
  // هي eCEntityProxy (مؤشر/وكيل الكيان)، وليست gCNavigation_PS.
  LastUseableNavigationZoneIsPath: {
    label: "آخر منطقة ملاحة هي مسار",
    description: "هل آخر منطقة ملاحة صالحة مسجَّلة للشخصية هي «مسار» (Path) تحديداً وليست منطقة عامة — تفصيل داخلي لنظام تخطيط المسارات.",
    category: "other", system: "الملاحة",
  },

  // gCAnchor_PS — نقاط إرساء الشخصيات (تجمّع/دوريات)، تأكّدنا من فئتها
  // وسياقها من فحص أرشيف حقيقي كامل: ملفات مثل Anchor_Patrol.tple،
  // Anchor_Roam.tple، Anchor_Local.tple، Anchor_Event.tple — كلها قوالب
  // افتراضية تُستنسَخ عند وضع نقطة إرساء حقيقية في الخريطة، لذا قيمها هنا 0
  // دائماً؛ القيم الفعلية تُحدَّد عند وضع كل نقطة إرساء حقيقية.
  PatrolIndex: {
    label: "موضع الدورية",
    description: "موضع/ترتيب نقطة الإرساء هذه ضمن تسلسل دورية معيّنة (لو كانت جزءاً من مسار دوريات) — من فئة gCAnchor_PS. تبقى 0 في القوالب الافتراضية لأن الترتيب الفعلي يُحدَّد عند وضع نقطة إرساء حقيقية في الخريطة، وليس في القالب نفسه.",
    category: "other", system: "الملاحة",
  },
  MaxUsers: {
    label: "أقصى عدد مستخدمين",
    description: "أقصى عدد شخصيات يمكنها استخدام نقطة الإرساء (Anchor) هذه في نفس الوقت — من فئة gCAnchor_PS. تبقى 0 في القوالب الافتراضية؛ القيمة الفعلية تُحدَّد عند وضع نقطة إرساء حقيقية في الخريطة.",
    category: "other", system: "الملاحة",
  },
  CircleCount: {
    label: "عدد دوائر التصادم",
    description: "عدد دوائر التصادم المُعرَّفة ضمن هذا القالب — من فئة gCCollisionCircle_PS. كانت 1 دائماً في كل الملفات الحقيقية المفحوصة (15 ملفاً بأسماء مثل CC_100 وCC_900 — الرقم في اسم الملف يبدو نصف قطر الدائرة)، أي كل قالب يعرّف دائرة تصادم واحدة بحجم محدد سلفاً.",
    category: "other", system: "الملاحة",
  },

  // gCInventory_PS — توليد الغنيمة والمخزون التجاري.
  GeneratedPlunder: {
    label: "وُلِّدت الغنيمة",
    description: "هل وُلِّدت غنيمة/نهب عشوائي لهذا الكيان مسبقاً — يمنع إعادة توليدها في كل مرة يُفتَّش فيها.",
    category: "other", system: "المخزون والغنيمة",
  },
  GeneratedTrade: {
    label: "وُلِّد المخزون التجاري",
    description: "هل وُلِّد مخزون تجاري عشوائي لهذا الكيان مسبقاً (لتجّار عشوائيي المخزون).",
    category: "other", system: "المخزون والغنيمة",
  },

  // gCScriptProxyAIState — حالة سلوك مساعدة إضافية.
  GroundBias: {
    label: "انحياز الأرضية",
    description: "انحياز/تعديل ارتفاع افتراضي يُضاف عند حساب موضع الشخصية بالنسبة للأرض ضمن منطق الذكاء الاصطناعي (مثلاً لمنع أخطاء استهداف بصرية بسيطة).",
    category: "other", system: "الذكاء الاصطناعي والروتين",
  },

  // eCIlluminated_PS — الإضاءة والظلال.
  CastDirLightShadows: {
    label: "ظلال من الإضاءة الاتجاهية",
    description: "هل يُلقي هذا الكيان ظلالاً من الإضاءة الاتجاهية (كضوء الشمس). تعطيلها يحسّن الأداء قليلاً على حساب الواقعية البصرية.",
    category: "other", system: "الإضاءة والظلال",
  },
  CastPntLightShadows: {
    label: "ظلال من الإضاءة النقطية",
    description: "نفس مبدأ ظلال الإضاءة الاتجاهية، لكن من مصادر الإضاءة النقطية (كالمصابيح والشعلات).",
    category: "other", system: "الإضاءة والظلال",
  },
  CastStaticShadows: {
    label: "ظلال ثابتة محسوبة مسبقاً",
    description: "هل تُحسَب ظلال هذا الكيان ضمن الإضاءة الثابتة المُعدَّة مسبقاً (Baked lighting) بدل حسابها الفوري في كل إطار.",
    category: "other", system: "الإضاءة والظلال",
  },

  // gCParty_PS — الرفاق والفريق.
  Waiting: {
    label: "في وضع الانتظار",
    description: "هل هذا العضو في الفريق حالياً في وضع «الانتظار» — لا يتبع اللاعب بنشاط، بل يبقى في مكانه.",
    category: "other", system: "الفريق",
  },
  AutoRejoin: {
    label: "الانضمام التلقائي من جديد",
    description: "هل ينضم عضو الفريق تلقائياً للاعب من جديد بعد الانفصال عنه (كالتخلف عن الركب أو الخروج من منطقة).",
    category: "other", system: "الفريق",
  },

  // gCEffect_PS — التأثيرات البصرية المرتبطة بالكيان.
  Static: {
    label: "التأثير ثابت الموضع",
    description: "هل التأثير البصري المرتبط بهذا الكيان ثابت الموضع (لا يتبع حركة الكيان نفسه بعد تفعيله).",
    category: "other", system: "التأثيرات البصرية",
  },
  Enabled: {
    label: "التأثير مفعَّل",
    description: "هل التأثير البصري (كتوهّج أو جسيمات) المرتبط بهذا الكيان مفعَّل ويعمل حالياً.",
    category: "other", system: "التأثيرات البصرية",
  },
  UseMaxRepeats: {
    label: "استخدام حد أقصى للتكرار",
    description: "هل يُطبَّق حد أقصى لعدد مرات تكرار التأثير البصري (يعمل مع MaxNumRepeats القريبة منها في الملف) بدل تكراره إلى ما لا نهاية.",
    category: "other", system: "التأثيرات البصرية",
  },

  // gCMapInfo_PS — أيقونة الكيان على خريطة اللعبة.
  CalcRotation: {
    label: "حساب دوران أيقونة الخريطة",
    description: "هل يُحسَب دوران أيقونة هذا الكيان على خريطة اللعبة لتعكس اتجاه توجّهه الفعلي، بدل أيقونة ثابتة الاتجاه.",
    category: "other", system: "معلومات الخريطة",
  },

  // Integer (short/int/long) properties. Confidently attributed to their
  // owning class from the file's own name-pool ordering (see comments
  // above) — most currently hold 0 in the one sample checked and look like
  // transient runtime/save state (timestamps, internal counters) rather
  // than designer-authored settings, which is noted honestly below.
  InteractionCounter: {
    label: "عداد التفاعل",
    description: "قيمة عدّاد/حالة مرتبطة بالتفاعل مع هذا الكيان — من فئة gCScriptProxyAIState غالباً (أو eCEntityProxy أحياناً). تنبيه من فحص أرشيف حقيقي كامل: في كل الحالات المفحوصة (1320 حالة عبر 1320 ملفاً، أغلبها مناطق تفعيل سكربتية ونقاط تفاعل) لم تُسجَّل قيمته أبداً أعلى من صفر — فقط 0 أو -1 — ما يرجّح أنها حالة/علامة داخلية (كـ«لم يُستخدم بعد») أكثر من كونها عداداً تراكمياً فعلياً تصممه.",
    category: "other",
  },
  MaterialSwitch: {
    label: "نوع المادة",
    description: "مؤشر لنوع المادة المستخدمة (قد يؤثر مثلاً على صوت الخطى أو خامة السطح). ملاحظة: هذا الحقل مُعاد استخدامه في عدة فئات برمجية مختلفة بنفس الاسم — تأكّدنا عبر فحص أرشيف حقيقي كامل (1730 حالة في 1666 ملفاً) من ظهوره في eCMesh_PS (الأغراض، الأكثر شيوعاً)، eCAnimation_PS (الشخصيات)، eCBodyPart_PS (أجزاء الجسم)، eCBillboard_PS (لوحات العرض المسطّحة)، وeCStrip_PS (أثر الحركة البصري) — المعنى العام واحد لكن السياق يختلف حسب الفئة.",
    category: "other",
  },
  DamageBonus: { label: "إضافة على الضرر", description: "قيمة تُضاف عند حساب الضرر — من فئة gCDamage_PS.", category: "other" },
  DamageAmount: { label: "مقدار الضرر", description: "القيمة الأساسية للضرر — من فئة gCDamage_PS.", category: "other" },

  // ما يلي من ملفات الأغراض (Items) — تأكّدنا من فئتها الحقيقية (gCItem_PS،
  // eCMesh_PS) من تحليل ملف سلاح حقيقي (It_Sword_Hot.tple)، وليس تخميناً.
  Amount: {
    label: "الكمية",
    description: "عدد القطع التي يمثّلها هذا الغرض عند الحصول عليه دفعة واحدة (حجم الرزمة الافتراضي) — مثلاً كمية السهام في حزمة واحدة. للأغراض المفردة غير القابلة للتكديس تكون عادة 1. من فئة gCItem_PS. ملاحظة من فحص أرشيف حقيقي كامل: نفس الاسم يظهر أيضاً بمعنى مختلف ضمن فئة gCInventory_PS (165 حالة حقيقية) في ملفات شخصيات ميتة/قابلة للنهب — هناك يمثّل كمية كل غرض ضمن قائمة الغنيمة المولَّدة لتلك الشخصية تحديداً، وليس حجم رزمة الغرض نفسه.",
    category: "other",
    system: "الأغراض (Item)",
  },
  GoldValue: {
    label: "القيمة بالذهب",
    description: "القيمة الأساسية للغرض بالذهب — الأساس الذي يُحسَب عليه سعر البيع والشراء عند التجار (يُضرب عادة بمعامل التاجر SaleModifier/PurchaseModifier الخاص بكل شخصية على حدة). من فئة gCItem_PS.",
    category: "other",
    system: "الأغراض (Item)",
  },
  SortValue: {
    label: "قيمة الترتيب",
    description: "قيمة تقنية تحدد مكان ظهور الغرض ضمن قائمة الجرد (Inventory) بالنسبة لأغراض أخرى من نفس الفئة — لا تؤثر على أي قيمة لعب فعلية (سعر، ضرر...)، فقط ترتيب العرض في الواجهة. من فئة gCItem_PS.",
    category: "other",
    system: "الأغراض (Item)",
  },
  MaxSubMeshTriangles: {
    label: "أقصى عدد مثلثات للشكل",
    description: "الحد الأقصى لعدد المثلثات (Triangles) المسموح بها في كل جزء فرعي من نموذج هذا الغرض ثلاثي الأبعاد — إعداد أداء/عرض رسومي بحت (من فئة eCMesh_PS)، لا علاقة له بالضرر أو القيمة أو أي تأثير على اللعب. تغييره يؤثر فقط على كيفية تقسيم اللعبة للنموذج داخلياً للعرض، ونادراً ما يستحق التعديل.",
    category: "other",
    system: "الشبكة ثلاثية الأبعاد (Mesh)",
  },

  // المزيد من خصائص ملفات الأغراض (Items) — تأكّدنا من فئة كل واحدة وقيمها
  // الحقيقية من ملفات فعلية متنوعة (وصفات صناعة، مقذوفات سحرية، أثر سلاح
  // بصري، خريطة، بوابة انتقال) — وليس تخميناً.
  ItemAmount: {
    label: "كمية المكوّن",
    description: "الكمية المطلوبة من هذا المكوّن (Ingredient) داخل وصفة صناعة أو تعدين — من فئة gCRecipe_PS، جزء من قائمة المكوّنات المطلوبة لإتمام الوصفة.",
    category: "other",
    system: "الأغراض (Item)",
  },
  ResultAmount: {
    label: "كمية الناتج",
    description: "عدد القطع الناتجة من هذه الوصفة عند صناعتها بنجاح — من فئة gCRecipe_PS.",
    category: "other",
    system: "الأغراض (Item)",
  },
  EnableSweepTest: {
    label: "فحص مسار المقذوف",
    description: "هل يُستخدم فحص مسح مستمر على طول مسار طيران هذا المقذوف السحري (كرة نار أو صقيع) بدل فحص نقطة الاصطدام النهائية فقط — يمنع اختراقه لأهداف رفيعة عند سرعة عالية. من فئة gCFlightPathSeeking، مؤكَّدة بقيم true/false حقيقية في تعويذتَي Fireball، Frost.",
    category: "other",
    system: "الأغراض (Item)",
  },
  EnableSpining: {
    label: "دوران المقذوف",
    description: "هل يدور هذا المقذوف حول نفسه أثناء طيرانه في الهواء (تأثير بصري دوّار). من فئة gCFlightPathSeeking.",
    category: "other",
    system: "الأغراض (Item)",
  },
  MaxSegmentCount: {
    label: "أقصى عدد أجزاء أثر الحركة",
    description: "الحد الأقصى لعدد أجزاء أثر الحركة البصري (Trail/Strip) الذي يتبع هذا الغرض أثناء تحريكه — كأثر ضوئي خلف عصا سحرية أو سلاح. من فئة eCStrip_PS، إعداد بصري بحت لا علاقة له بالضرر أو القيمة.",
    category: "other",
    system: "التأثيرات البصرية",
  },
  Priority: {
    label: "أولوية العرض",
    description: "قيمة أولوية من فئة eCLocString (تصحيح: كانت موثّقة سابقاً كـ eCEntityStringProxy بالخطأ). تأكّدنا عبر فحص أرشيف حقيقي كامل من ظهورها في 11 ملف خريطة حقيقياً (كل ملفات It_Map_* ضمن Items/Written وItems/Quests) بقيم تتراوح بين 10 و30 — يبدو أنها مرتبطة بترتيب ظهور علامات الخريطة عند تداخلها.",
    category: "other",
    system: "الأغراض (Item)",
  },
  ManaCost: {
    label: "تكلفة المانا",
    description: "تكلفة المانا (Mana) المطلوبة لاستخدام هذا الغرض السحري (كتعويذة أو بوابة انتقال سحرية) — من فئة gCCastInfo_PS. تخفيضها يجعل استخدامه أرخص مانا؛ رفعها يجعله أغلى.",
    category: "other",
    system: "الأغراض (Item)",
  },

  FileVersion: {
    label: "إصدار بنية الملف",
    description: "رقم إصدار بنية شكل التصادم (eCCollisionShape، بلا لاحقة _PS — تصحيح من فحص أرشيف حقيقي) لهذا القالب — يستخدمه محرك اللعبة داخلياً للتوافق بين إصدارات أدوات التطوير، وليس إعداداً يُفترض تعديله. قيمته 74 في الغالبية الساحقة من 1401 حالة حقيقية مفحوصة، مع استثناءات نادرة بقيمة 0. تغييره لا يُحدث أثراً في اللعبة عادة، وقد يجعل بعض أدوات المعاينة الرسمية تسيء تفسير الملف.",
    category: "other",
  },
  CurrentRoutine: {
    label: "الروتين الحالي (ملاحة)",
    description: "مؤشر/فهرس الروتين السلوكي الحالي الذي تتبعه الشخصية — حالة تشغيل، دائماً صفر في القوالب الافتراضية (443 حالة حقيقية مفحوصة، كلها 0). تصحيح: فحص أرشيف حقيقي كامل أظهر أن الفئة السائدة فعلياً هي eCScriptProxyScript (417 من 443 ملفاً)، وأن نظام الملاحة gCNavigation_PS المذكور في التسمية أقلية صغيرة فقط (26 ملفاً) وليس الفئة الوحيدة كما أُوحي سابقاً.",
    category: "other",
  },
  TaskPosition: {
    label: "موضع المهمة",
    description: "مؤشر/فهرس موضع المهمة الحالية ضمن قائمة مهام الشخصية المبرمجة (gCScriptRoutine_PS) — حالة تشغيل، غالباً صفر عند عدم وجود مهمة نشطة.",
    category: "other",
  },
  StatePosition: {
    label: "موضع الحالة السلوكية",
    description: "مؤشر/فهرس الحالة السلوكية الحالية ضمن آلة الحالات (state machine) الخاصة بالذكاء الاصطناعي (gCScriptRoutine_PS).",
    category: "other",
  },
  CommandTime: {
    label: "توقيت الأمر السلوكي",
    description: "طابع زمني داخلي مرتبط بآخر أمر سلوكي نُفِّذ ضمن نظام الروتين (gCScriptRoutine_PS).",
    category: "other",
  },
  AIDelay: {
    label: "تأخير الذكاء الاصطناعي",
    description: "تأخير مجدوَل قبل أن يتخذ الذكاء الاصطناعي قراره التالي (gCScriptRoutine_PS) — قد يبدو صفراً إن لم يكن هناك تأخير معلَّق حالياً.",
    category: "other",
  },
  CurrentBreakBlock: {
    label: "نقطة توقف التنفيذ الحالية",
    description: "مؤشر لنقطة توقف/تجزئة حالية داخل تنفيذ الروتين البرمجي للشخصية (gCScriptRoutine_PS) — حالة تنفيذ داخلية.",
    category: "other",
  },
};

function findSentinelOffset(bytes: Uint8Array): number {
  for (let i = 0; i + 4 <= bytes.length; i++) {
    if (bytes[i] === SENTINEL[0] && bytes[i + 1] === SENTINEL[1] && bytes[i + 2] === SENTINEL[2] && bytes[i + 3] === SENTINEL[3]) {
      return i;
    }
  }
  return -1;
}

/** Parses the trailing string pool. Throws if no DEADBEEF sentinel is found (not a recognized .tple). */
export function parseTpleStringPool(bytes: Uint8Array): string[] {
  const sentinel = findSentinelOffset(bytes);
  if (sentinel < 0) {
    throw new Error("لم يُعثر على علامة بداية جدول الأسماء — هذا الملف ليس بصيغة .tple المدعومة");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("ascii");
  let p = sentinel + POOL_HEADER_SIZE;
  const names: string[] = [];
  while (p + 2 <= bytes.length) {
    const len = view.getUint16(p, true);
    p += 2;
    // A length of 0 is a legitimate empty string (e.g. a bCString property's
    // blank default value) — NOT the end of the pool. Only bail out on a
    // clearly-corrupt length or running past the end of the file.
    if (len > MAX_POOL_STRING_LEN || p + len > bytes.length) break;
    names.push(len === 0 ? "" : decoder.decode(bytes.subarray(p, p + len)));
    p += len;
  }
  return names;
}

/** Scans the whole file for float-property records matching the exact verified signature. Returns [] if the file isn't a recognized .tple (no sentinel found). */
export function findTpleFloatProperties(bytes: Uint8Array): TpleFloatProperty[] {
  const sentinel = findSentinelOffset(bytes);
  if (sentinel < 0) return [];
  const names = parseTpleStringPool(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const results: TpleFloatProperty[] = [];
  for (let off = 0; off + FLOAT_RECORD_SIZE <= sentinel; off++) {
    const idx = view.getUint16(off, true);
    if (idx >= names.length) continue;
    if (view.getUint16(off + 2, true) !== FLOAT_MAGIC_1) continue;
    if (view.getUint16(off + 4, true) !== FLOAT_MAGIC_2) continue;
    if (view.getUint16(off + 6, true) !== FLOAT_MAGIC_3) continue;
    if (view.getUint16(off + 8, true) !== FLOAT_MAGIC_4) continue;
    results.push({
      name: names[idx],
      poolIndex: idx,
      recordOffset: off,
      valueOffset: off + 10,
      value: view.getFloat32(off + 10, true),
    });
  }
  return results;
}

/** Scans the whole file for bool-property records matching the exact verified signature. Returns [] if the file isn't a recognized .tple (no sentinel found). */
export function findTpleBoolProperties(bytes: Uint8Array): TpleBoolProperty[] {
  const sentinel = findSentinelOffset(bytes);
  if (sentinel < 0) return [];
  const names = parseTpleStringPool(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const results: TpleBoolProperty[] = [];
  for (let off = 0; off + BOOL_RECORD_SIZE <= sentinel; off++) {
    const idx = view.getUint16(off, true);
    if (idx >= names.length) continue;
    if (view.getUint16(off + 2, true) !== BOOL_MAGIC_1) continue;
    if (view.getUint16(off + 4, true) !== BOOL_MAGIC_2) continue;
    if (view.getUint16(off + 6, true) !== BOOL_MAGIC_3) continue;
    if (view.getUint16(off + 8, true) !== BOOL_MAGIC_4) continue;
    results.push({
      name: names[idx],
      poolIndex: idx,
      recordOffset: off,
      valueOffset: off + 10,
      value: bytes[off + 10] !== 0,
    });
  }
  return results;
}

/** Scans the whole file for integer-property records matching the exact verified signature (type resolved via a pool-index reference, not a fixed constant). Returns [] if the file isn't a recognized .tple (no sentinel found). */
export function findTpleIntProperties(bytes: Uint8Array): TpleIntProperty[] {
  const sentinel = findSentinelOffset(bytes);
  if (sentinel < 0) return [];
  const names = parseTpleStringPool(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const results: TpleIntProperty[] = [];
  for (let off = 0; off + INT_RECORD_HEADER_SIZE <= sentinel; off++) {
    const propIdx = view.getUint16(off, true);
    if (propIdx >= names.length) continue;
    const typeIdx = view.getUint16(off + 2, true);
    if (typeIdx >= names.length) continue;
    const typeName = names[typeIdx];
    const expectedSize = INT_TYPE_SIZES[typeName];
    if (expectedSize === undefined) continue;
    if (view.getUint16(off + 4, true) !== INT_MAGIC_SLOT) continue;
    const size = view.getUint16(off + 6, true);
    if (size !== expectedSize) continue;
    if (view.getUint16(off + 8, true) !== INT_MAGIC_RESERVED) continue;
    if (off + INT_RECORD_HEADER_SIZE + size > sentinel) continue;
    const value = size === 2 ? view.getInt16(off + 10, true) : view.getInt32(off + 10, true);
    results.push({ name: names[propIdx], poolIndex: propIdx, typeName, recordOffset: off, valueOffset: off + 10, size, value });
  }
  return results;
}

/** Patches float values in place (by valueOffset) — never changes the file's length. */
export function applyTpleFloatEdits(bytes: Uint8Array, edits: Map<number, number>): Uint8Array {
  const out = new Uint8Array(bytes);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  for (const [valueOffset, value] of edits) {
    view.setFloat32(valueOffset, value, true);
  }
  return out;
}

/** Patches bool values in place (by valueOffset) — never changes the file's length. */
export function applyTpleBoolEdits(bytes: Uint8Array, edits: Map<number, boolean>): Uint8Array {
  const out = new Uint8Array(bytes);
  for (const [valueOffset, value] of edits) {
    out[valueOffset] = value ? 1 : 0;
  }
  return out;
}

/** Patches integer values in place (by valueOffset) — each edit carries its
 * own byte width (2 or 4, from the matching TpleIntProperty.size) since it
 * varies per property; never changes the file's length. */
export function applyTpleIntEdits(bytes: Uint8Array, edits: Map<number, { value: number; size: number }>): Uint8Array {
  const out = new Uint8Array(bytes);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  for (const [valueOffset, { value, size }] of edits) {
    if (size === 2) view.setInt16(valueOffset, value, true);
    else view.setInt32(valueOffset, value, true);
  }
  return out;
}

export interface ArchiveReplacement {
  offset: number;
  size: number;
  bytes: Uint8Array;
}

/** Splices same-size replacements for any number of entries back into one full
 * copy of the archive they came from. Validates every replacement BEFORE
 * touching the output buffer, so it either applies all of them or throws
 * without producing a partially-patched result. */
export function spliceMultipleFilesIntoArchive(archiveBytes: Uint8Array, replacements: ArchiveReplacement[]): Uint8Array {
  for (const r of replacements) {
    if (r.bytes.length !== r.size) {
      throw new Error(`حجم الملف المعدَّل (${r.bytes.length}) لا يطابق حجمه الأصلي (${r.size}) عند الموضع ${r.offset} — لا يمكن إدخاله بنفس المكان بأمان`);
    }
    if (r.offset + r.size > archiveBytes.length) {
      throw new Error(`موضع الملف عند ${r.offset} خارج حدود الأرشيف`);
    }
  }
  const out = new Uint8Array(archiveBytes);
  for (const r of replacements) out.set(r.bytes, r.offset);
  return out;
}

/** Splices a same-size replacement for one entry back into a full copy of the archive it came from. */
export function spliceFileIntoArchive(
  archiveBytes: Uint8Array,
  entryOffset: number,
  entrySize: number,
  newEntryBytes: Uint8Array,
): Uint8Array {
  return spliceMultipleFilesIntoArchive(archiveBytes, [{ offset: entryOffset, size: entrySize, bytes: newEntryBytes }]);
}

export interface TpleBatchOccurrence {
  path: string;
  kind: "float" | "bool" | "int";
  valueOffset: number;
  value: number | boolean;
  /** Only set (and only meaningful) for kind "int" — the byte width to write back (2 or 4). */
  size?: number;
}

/** Scans multiple already-read .tple files and groups every recognized
 * property by name, across all of them — the basis for bulk-editing one
 * property (e.g. ForwardSpeedMax) across every template in an archive at
 * once. Files with no recognized properties simply contribute nothing. */
export function buildTpleBatchIndex(files: Array<{ path: string; bytes: Uint8Array }>): Map<string, TpleBatchOccurrence[]> {
  const index = new Map<string, TpleBatchOccurrence[]>();
  const add = (name: string, occurrence: TpleBatchOccurrence) => {
    const list = index.get(name);
    if (list) list.push(occurrence);
    else index.set(name, [occurrence]);
  };
  for (const { path, bytes } of files) {
    for (const p of findTpleFloatProperties(bytes)) {
      add(p.name, { path, kind: "float", valueOffset: p.valueOffset, value: p.value });
    }
    for (const p of findTpleBoolProperties(bytes)) {
      add(p.name, { path, kind: "bool", valueOffset: p.valueOffset, value: p.value });
    }
    for (const p of findTpleIntProperties(bytes)) {
      add(p.name, { path, kind: "int", valueOffset: p.valueOffset, value: p.value, size: p.size });
    }
  }
  return index;
}
