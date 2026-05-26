import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MemoryAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { title: string; content: string }) => Promise<void>;
}

export function MemoryAddDialog({ open, onOpenChange, onSubmit }: MemoryAddDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setContent("");
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const canSubmit = title.trim().length > 0 && content.trim().length > 0 && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim(), content: content.trim() });
      handleOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("cortex.memory.addTitle")}</DialogTitle>
          <DialogDescription>{t("cortex.memory.addDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">{t("cortex.memory.addFieldTitle")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("cortex.memory.addFieldTitlePlaceholder")}
              className="h-10 w-full rounded-xl border border-border/60 bg-background/70 px-3 text-sm outline-none focus:border-guide-jade/50"
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">{t("cortex.memory.addFieldContent")}</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder={t("cortex.memory.addFieldContentPlaceholder")}
              className="w-full rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm outline-none focus:border-guide-jade/50"
            />
          </label>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={() => void handleSubmit()}>
            {saving ? t("cortex.memory.addSaving") : t("cortex.memory.addSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
