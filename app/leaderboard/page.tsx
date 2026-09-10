import { redirect } from "next/navigation"
import { getAuth } from "@/lib/auth/session"
import { AppShell } from "@/components/layout/app-shell"
import { LeaderboardScreen } from "@/components/leaderboard/leaderboard-screen"

export const dynamic = "force-dynamic"

export default async function LeaderboardPage() {
  const auth = await getAuth()
  if (!auth) redirect("/login")
  return (
    <AppShell title="Рейтинг">
      <LeaderboardScreen />
    </AppShell>
  )
}
