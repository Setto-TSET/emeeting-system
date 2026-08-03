/**
 * Magic Link token management for guest meeting invitations.
 *
 * Production: replace localStorage with POST /api/invite + DB table.
 * Interface stays the same — functions are already async-ready.
 */

export interface InviteToken {
  token: string;
  meetingId: string;
  guestEmail: string;
  guestName?: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
  usedAt?: string;
  createdBy: string;
}

const STORAGE_KEY = "meeting_system_invite_tokens";

function loadTokens(): InviteToken[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTokens(tokens: InviteToken[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

function generateTokenId(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
}

export function createInviteToken(
  meetingId: string,
  guestEmail: string,
  createdBy: string,
  guestName?: string,
  expiresInHours = 48,
): InviteToken {
  const now = new Date();
  const expires = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);

  const token: InviteToken = {
    token: generateTokenId(),
    meetingId,
    guestEmail,
    guestName,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    used: false,
    createdBy,
  };

  const tokens = loadTokens();
  tokens.push(token);
  saveTokens(tokens);
  return token;
}

export type VerifyResult =
  | { ok: true; invite: InviteToken }
  | { ok: false; reason: "not_found" | "expired" | "already_used" };

export function verifyToken(tokenId: string): VerifyResult {
  const tokens = loadTokens();
  const invite = tokens.find((t) => t.token === tokenId);

  if (!invite) return { ok: false, reason: "not_found" };
  if (invite.used) return { ok: false, reason: "already_used" };
  if (new Date(invite.expiresAt) < new Date()) return { ok: false, reason: "expired" };

  return { ok: true, invite };
}

export function markTokenUsed(tokenId: string) {
  const tokens = loadTokens();
  const idx = tokens.findIndex((t) => t.token === tokenId);
  if (idx >= 0) {
    tokens[idx].used = true;
    tokens[idx].usedAt = new Date().toISOString();
    saveTokens(tokens);
  }
}

export function getTokensForMeeting(meetingId: string): InviteToken[] {
  return loadTokens().filter((t) => t.meetingId === meetingId);
}

export function revokeToken(tokenId: string) {
  const tokens = loadTokens().filter((t) => t.token !== tokenId);
  saveTokens(tokens);
}

export function buildJoinUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://emeeting.org";
  return `${origin}/join/${token}`;
}
