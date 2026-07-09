import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Icon toggle between the dark (default) and light themes, persisted via next-themes. */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // Avoids a flash of the wrong icon before next-themes reads the persisted value on mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Button variant="ghost" size="icon" disabled aria-hidden="true" />;
  }

  const isLight = theme === "light";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isLight ? "dark" : "light")}
      title={isLight ? "التبديل إلى الوضع الداكن" : "التبديل إلى الوضع المشرق"}
      aria-label={isLight ? "التبديل إلى الوضع الداكن" : "التبديل إلى الوضع المشرق"}
    >
      {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </Button>
  );
}
