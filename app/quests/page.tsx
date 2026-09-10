import { redirect } from "next/navigation"
import { getAuth } from "@/lib/auth/session"
import { AppShell } from "@/components/layout/app-shell"
import { QuestsScreen } from "@/components/quests/quests-screen"

export const dynamic = "force-dynamic"

export default async function QuestsPage() {
  const auth = await getAuth()
  if (!auth) redirect("/login")
  return (
    <AppShell title="Квесты">
      <QuestsScreen />
    </AppShell>
  )
}
