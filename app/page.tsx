import { redirect } from "next/navigation"
import { getAuth } from "@/lib/auth/session"
import { AppShell } from "@/components/layout/app-shell"
import { TapScreen } from "@/components/game/tap-screen"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const auth = await getAuth()
  if (!auth) redirect("/login")
  return (
    <AppShell>
      <TapScreen />
    </AppShell>
  )
}
