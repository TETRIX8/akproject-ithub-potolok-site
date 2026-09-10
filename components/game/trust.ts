import type { TrustLevel } from "@/lib/game/config"

export const TRUST_LABELS: Record<TrustLevel, { label: string; tone: "success" | "warning" | "accent" | "danger" | "muted" | "primary" }> = {
  normal: { label: "Статус: норма", tone: "success" },
  suspicious: { label: "Предупреждение", tone: "warning" },
  verification: { label: "Нужна проверка", tone: "accent" },
  cooldown: { label: "Пауза", tone: "warning" },
  restricted: { label: "Ограничение", tone: "danger" },
  blocked: { label: "Заблокировано", tone: "danger" },
}
