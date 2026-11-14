import { initials, type AuthUser } from "../lib/authSession"

export function UserAvatar({
  user,
  className = "avatar",
}: {
  user: AuthUser | null
  className?: string
}) {
  if (user?.avatarUrl) {
    return <img className={className} src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
  }

  return (
    <div className={className} aria-hidden="true">
      {initials(user?.name ?? "Warung Pintar")}
    </div>
  )
}
