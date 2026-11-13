// Public, opaque change marker. Never a credential or an authorization proof.
export const SESSION_MARKER_COOKIE = "ferreteria_sb_session_marker";

export function readSessionMarker(cookie: string): string | null {
  const prefix = `${SESSION_MARKER_COOKIE}=`;
  return cookie.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(prefix))?.slice(prefix.length) ?? null;
}
