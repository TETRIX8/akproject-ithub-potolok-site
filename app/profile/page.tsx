import { redirect } from "next/navigation"
import { getAuth } from "@/lib/auth/session"
import { AppShell } from "@/components/layout/app-shell"
import { ProfileScreen } from "@/components/profile/profile-screen"

export const dynamic = "force-dynamic"

export default async function ProfilePage() {
  const auth = await getAuth()
  if (!auth) redirect("/login")
  return (
    <AppShell title="Профиль">
      <ProfileScreen />
    </AppShell>
  )
}
