/* Style reminder: «مختبر البلاطات» يحافظ على واجهة تقنية RTL ويعرض مسارَي WCT وReshef بوضوح دون إخفاء حدود التحقق. */
import { useState } from "react";
import { ReshefWorkspace } from "@/components/ReshefWorkspace";
import { WctWorkspace } from "@/components/WctWorkspace";

export default function Home() {
  const [gameProfile, setGameProfile] = useState<"wct" | "reshef">("wct");
  return gameProfile === "reshef"
    ? <ReshefWorkspace onSwitch={() => setGameProfile("wct")} />
    : <WctWorkspace onSwitch={() => setGameProfile("reshef")} />;
}
