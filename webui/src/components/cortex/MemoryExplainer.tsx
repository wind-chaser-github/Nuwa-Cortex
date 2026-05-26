import { useTranslation } from "react-i18next";

import type { CortexMemoryGuide } from "@/lib/types";

interface MemoryExplainerProps {
  guide: CortexMemoryGuide | null | undefined;
}

export function MemoryExplainer({ guide }: MemoryExplainerProps) {
  const { t } = useTranslation();
  if (!guide) return null;

  return (
    <div className="space-y-4 pb-4">
      {guide.layers.map((layer) => (
        <section key={layer.id} className="rounded-xl border border-border/50 bg-background/40 p-3">
          <h3 className="text-sm font-medium">{layer.title}</h3>
          <dl className="mt-2 space-y-2 text-xs">
            <div>
              <dt className="text-muted-foreground">{t("cortex.memoryGuide.what")}</dt>
              <dd className="mt-0.5 leading-relaxed">{layer.what}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("cortex.memoryGuide.when")}</dt>
              <dd className="mt-0.5 leading-relaxed">{layer.when}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("cortex.memoryGuide.path")}</dt>
              <dd className="mt-0.5">
                <code className="block break-all rounded bg-muted/50 px-2 py-1 text-[10px]">
                  {layer.path}
                </code>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("cortex.memoryGuide.uiAction")}</dt>
              <dd className="mt-0.5 leading-relaxed text-guide-jade">{layer.ui_action}</dd>
            </div>
          </dl>
        </section>
      ))}
    </div>
  );
}
