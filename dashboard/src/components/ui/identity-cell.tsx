import { initials } from "@/lib/utils";

function toneFor(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return Math.abs(hash) % 6;
}

export function IdentityCell({ displayName, email, suffix }: { displayName: string; email: string; suffix?: string }) {
  const name = displayName.trim() || email;
  return <span className="identity-cell">
    <span className={`identity-avatar tone-${toneFor(`${name}:${email}`)}`} aria-hidden="true">{initials(name)}</span>
    <span className="identity-copy"><strong>{name}</strong><small>{email}{suffix ? ` · ${suffix}` : ""}</small></span>
  </span>;
}
