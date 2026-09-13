import type { ActionErrorCode, ActionErrorPayload } from '@kartishki/shared';

export type ActionOk = { ok: true; discover?: boolean };
export type ActionFail = { ok: false; code: ActionErrorCode };
export type ActionResult = ActionOk | ActionFail;

export const ok = (extra?: { discover?: boolean }): ActionOk => extra?.discover ? { ok: true, discover: true } : { ok: true };
export const fail = (code: ActionErrorCode): ActionFail => ({ ok: false, code });

export function errorPayload(code: ActionErrorCode): ActionErrorPayload {
  return { code, message: code };
}
