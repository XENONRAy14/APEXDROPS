import { uuid } from "./engine";
import { createClient } from "@supabase/supabase-js";
import type { Provider } from "@supabase/supabase-js";
import { demoState, demoAction } from "./demo";
import type { Action, ActionResult, GameState } from "./types";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
export const isDemo = !supabase;
// Fournisseur OAuth configurable au build (discord par défaut : github, google…).
const provider = (import.meta.env.VITE_OAUTH_PROVIDER || "discord") as Provider;
export const providerName =
  provider === "discord"
    ? "Discord"
    : provider.charAt(0).toUpperCase() + provider.slice(1);
export async function checkOAuthEnabled(): Promise<boolean> {
  if (!url || !key) return false;
  try {
    const r = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
    });
    const j = await r.json();
    return Boolean(j?.external?.[provider]);
  } catch {
    return false;
  }
}
export async function fetchState(): Promise<GameState> {
  if (!supabase) return demoState();
  const { data, error } = await supabase.rpc("game_state");
  if (error) throw Error(error.message);
  return data as GameState;
}
// Keep the same request UUID across uncertain network failures, including reloads.
export async function act(
  action: Action,
  payload: Record<string, unknown> = {},
): Promise<ActionResult> {
  if (!supabase) return demoAction(action, payload);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw Error("Reconnecte-toi pour continuer.");
  const storageKey = `apex-pending-${user.id}`;
  const fingerprint = JSON.stringify([action, payload]);
  let requestId = uuid();
  try {
    const old = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (old?.fingerprint === fingerprint) requestId = old.id;
    else if (old) {
      const retry = await supabase.rpc("game_action", {
        p_action: JSON.parse(old.fingerprint)[0],
        p_payload: JSON.parse(old.fingerprint)[1],
        p_request_id: old.id,
      });
      if (retry.error)
        throw Error(
          "Une action précédente reste incertaine. Réessaie d’abord cette action.",
        );
      sessionStorage.removeItem(storageKey);
    }
  } catch (e) {
    if (e instanceof SyntaxError) sessionStorage.removeItem(storageKey);
    else throw e;
  }
  sessionStorage.setItem(
    storageKey,
    JSON.stringify({ fingerprint, id: requestId }),
  );
  const { data, error } = await supabase.rpc("game_action", {
    p_action: action,
    p_payload: payload,
    p_request_id: requestId,
  });
  if (error) {
    if (error.code && error.code !== "") sessionStorage.removeItem(storageKey);
    throw Error(
      error.message || "Connexion interrompue. Réessaie la même action.",
    );
  }
  sessionStorage.removeItem(storageKey);
  return data as ActionResult;
}
export async function login() {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: location.origin + location.pathname },
  });
  if (error) throw Error(error.message);
}
export async function loginEmail(
  email: string,
  password: string,
  username?: string,
): Promise<string | null> {
  if (!supabase) return null;
  if (username) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: username.trim() || "Pilote" },
        emailRedirectTo: location.origin + location.pathname,
      },
    });
    if (error) throw Error(error.message);
    return data.session
      ? null
      : "Vérifie ta boîte mail et clique sur le lien de confirmation pour entrer au paddock.";
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw Error(error.message);
  return null;
}
export async function logout() {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw Error(error.message);
  }
}
