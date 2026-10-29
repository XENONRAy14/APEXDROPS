import { useEffect, useState, useCallback, useRef } from "react";
import {
  ArrowUpRight,
  CarFront,
  Check,
  ChevronRight,
  Flag,
  Gauge,
  HelpCircle,
  History,
  Menu,
  RefreshCw,
  ShoppingBag,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  act,
  checkOAuthEnabled,
  fetchState,
  isDemo,
  login,
  loginEmail,
  logout,
  providerName,
  supabase,
} from "./api";
import { resetDemo } from "./demo";
import { CATALOG, SALVAGE } from "./catalog";
import { PACK_COOLDOWN_MS } from "./rules";
import { CarArt, FilterBar } from "./components";
import { money, refUrl } from "./format";
import {
  AccountModal,
  BuyModal,
  ConfirmModal,
  DetailModal,
  DrawsModal,
  DuelFormModal,
  DuelResultModal,
  GuideModal,
  HistoryModal,
  SellModal,
} from "./modals";
import type { ConfirmKind } from "./modals";
import { Paddock } from "./views/Paddock";
import { Garage } from "./views/Garage";
import { Market } from "./views/Market";
import { Arena } from "./views/Arena";
import { Ranking } from "./views/Ranking";
import type {
  Action,
  ActionResult,
  Card,
  Draw,
  Duel,
  DuelResult,
  GameState,
  Listing,
  Owned,
} from "./types";

type Tab = "paddock" | "garage" | "market" | "arena" | "ranking";
const nav = [
  { id: "paddock", label: "Le paddock", short: "Paddock", icon: Gauge },
  { id: "garage", label: "Mon garage", short: "Garage", icon: CarFront },
  { id: "market", label: "Le marché", short: "Marché", icon: ShoppingBag },
  { id: "arena", label: "L’arène", short: "Arène", icon: Flag },
  { id: "ranking", label: "Classement", short: "Top", icon: Trophy },
] as const;
const PAGE_SIZE = 12;

export default function App() {
  const [state, setState] = useState<GameState | null>(null),
    [tab, setTab] = useState<Tab>("paddock"),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [now, setNow] = useState(Date.now()),
    [menu, setMenu] = useState(false),
    [guide, setGuide] = useState(false),
    [history, setHistory] = useState(false),
    [detail, setDetail] = useState<Card | null>(null),
    [draws, setDraws] = useState<Draw[]>([]),
    [sell, setSell] = useState<Owned | null>(null),
    [price, setPrice] = useState(""),
    [buy, setBuy] = useState<Listing | null>(null),
    [create, setCreate] = useState(false),
    [challenge, setChallenge] = useState<Duel | null>(null),
    [selected, setSelected] = useState(""),
    [bet, setBet] = useState("1000"),
    [duelResult, setDuelResult] = useState<DuelResult | null>(null),
    [confirm, setConfirm] = useState<ConfirmKind | null>(null),
    [query, setQuery] = useState(""),
    [rarity, setRarity] = useState("all"),
    [division, setDivision] = useState("all"),
    [favorites, setFavorites] = useState(false),
    [sort, setSort] = useState("recent"),
    [marketMine, setMarketMine] = useState(false),
    [page, setPage] = useState(1),
    [refCode, setRefCode] = useState(""),
    [account, setAccount] = useState(false),
    [signedIn, setSignedIn] = useState(isDemo),
    [signup, setSignup] = useState(true),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [pseudo, setPseudo] = useState(""),
    [oauthReady, setOauthReady] = useState(false);
  const lock = useRef(false),
    epoch = useRef(0);

  const load = useCallback(async () => {
    const token = ++epoch.current;
    try {
      const s = await fetchState();
      if (token === epoch.current) {
        setState(s);
        setError("");
        const pendingRef = localStorage.getItem("apex-ref")?.trim();
        if (
          pendingRef &&
          !s.profile.referred_by &&
          pendingRef.toUpperCase() !== s.profile.referral_code.toUpperCase()
        ) {
          localStorage.removeItem("apex-ref");
          act("CLAIM_REFERRAL", { code: pendingRef })
            .then((r) => {
              if (r.message) setToast(r.message);
              void fetchState().then(setState);
            })
            .catch(() => {});
        }
      }
    } catch (e) {
      if (token === epoch.current)
        setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      if (token === epoch.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("ref")) localStorage.setItem("apex-ref", params.get("ref")!);
    setRefCode(localStorage.getItem("apex-ref") || "");
    let active = true;
    if (!supabase) {
      void load();
      return;
    }
    void checkOAuthEnabled().then((ok) => {
      if (active) setOauthReady(ok);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message);
      setSignedIn(!!data.session);
      if (data.session) void load();
      else setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setSignedIn(!!session);
      if (session)
        setTimeout(() => {
          if (active) void load();
        }, 0);
      else {
        epoch.current++;
        setState(null);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !lock.current) void load();
    }, 15000);
    const refresh = () => {
      if (document.visibilityState === "visible" && !lock.current) void load();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, signedIn]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(
    () => setPage(1),
    [query, rarity, division, favorites, sort, marketMine, tab],
  );

  async function run(
    action: Action,
    payload: Record<string, unknown> = {},
    done?: (r: ActionResult) => void,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await act(action, payload);
      if (r.message) setToast(r.message);
      done?.(r);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible. Réessaie.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function changeTab(t: Tab) {
    setTab(t);
    setMenu(false);
    setQuery("");
    setRarity("all");
    setDivision("all");
    setFavorites(false);
    setSort("recent");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        refUrl(state?.profile.referral_code),
      );
      setToast("Lien de parrainage copié.");
    } catch {
      setError("Copie impossible : sélectionne le lien affiché dans ton profil.");
    }
  }

  const p = state?.profile,
    inv = state?.inventory || [],
    cooldown = p
      ? Math.min(
          600,
          Math.max(
            0,
            Math.ceil(
              (new Date(p.last_pack_opened_at).getTime() +
                PACK_COOLDOWN_MS -
                now) /
                1000,
            ),
          ),
        )
      : 0;
  const unique = new Set(inv.map((u) => u.card_id)).size;
  const duplicates = inv.reduce(
    (a, u) => a + (!u.favorite ? Math.max(0, u.quantity - 1) : 0),
    0,
  );
  const recycleValue = inv.reduce(
    (a, u) =>
      a +
      (!u.favorite ? Math.max(0, u.quantity - 1) * SALVAGE[u.cards.rarity] : 0),
    0,
  );
  const matches = (c: Card) =>
    c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
    (rarity === "all" || c.rarity === rarity) &&
    (division === "all" || c.division === division);
  const garage = inv
    .filter((u) => matches(u.cards) && (!favorites || u.favorite))
    .sort((a, b) =>
      sort === "value"
        ? b.cards.market_value - a.cards.market_value
        : sort === "name"
          ? a.cards.name.localeCompare(b.cards.name)
          : 0,
    );
  const listings = (state?.listings || [])
    .filter((m) => matches(m.cards) && (!marketMine || m.seller_id === p?.id))
    .sort((a, b) => (sort === "price" ? a.price - b.price : 0));
  const heroCard = CATALOG[0];
  const catalogSize = state?.catalog_size || CATALOG.length;

  const filterBar = (market = false) => (
    <FilterBar
      market={market}
      query={query}
      rarity={rarity}
      division={division}
      sort={sort}
      toggled={market ? marketMine : favorites}
      onQuery={setQuery}
      onRarity={setRarity}
      onDivision={setDivision}
      onSort={setSort}
      onToggle={() =>
        market ? setMarketMine(!marketMine) : setFavorites(!favorites)
      }
    />
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            changeTab("paddock");
          }}
        >
          <span className="brand-mark">A</span>
          <span>
            APEX<span className="brand-light">DROPS</span>
            <small>COLLECT. RACE. REPEAT.</small>
          </span>
        </a>
        <div className="sidebar-label">TON UNIVERS AUTOMOBILE</div>
        <nav aria-label="Navigation principale">
          {nav.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              aria-current={tab === n.id ? "page" : undefined}
              onClick={() => changeTab(n.id)}
            >
              <n.icon size={20} />
              {n.label}
              {n.id === "garage" && <span className="nav-count">{unique}</span>}
              {tab === n.id && n.id !== "garage" && (
                <ChevronRight className="nav-arrow" size={16} />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Flag size={23} />
          <h4>La passion fait le pilote.</h4>
          <p>
            Les icônes d’hier.
            <br />
            Ton garage de demain.
          </p>
          <span>SAISON 01 / ORIGINS</span>
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setGuide(true)}>
            <HelpCircle size={18} /> Comment jouer
          </button>
          <button onClick={() => setHistory(true)}>
            <History size={18} /> Mes transactions
          </button>
          <div className="sidebar-version">
            <span className="status-dot" />{" "}
            {isDemo ? "DÉMO LOCALE" : "PADDOCK CONNECTÉ"}
            <span>V5.0</span>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-overlay"
          aria-label="Fermer le menu"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Ouvrir le menu"
            >
              <Menu />
            </button>
            <span>SAISON 01</span>
            <i>/</i>
            <b>{nav.find((n) => n.id === tab)?.label}</b>
          </div>
          <div className="top-actions">
            <span className="demo-pill">
              {isDemo ? "DÉMO · SOLO" : "CRÉDITS VIRTUELS"}
            </span>
            <button className="balance" onClick={() => setHistory(true)}>
              <Wallet size={17} />
              {money(p?.cash_balance || 0)} <span>CR</span>
            </button>
            <button
              className="avatar"
              onClick={() =>
                signedIn
                  ? setAccount(true)
                  : void login().catch((e) => setError(e.message))
              }
              aria-label={signedIn ? "Mon profil" : `Connexion ${providerName}`}
            >
              {signedIn ? (
                (p?.username[0] || "P").toUpperCase()
              ) : (
                <Users size={18} />
              )}
            </button>
          </div>
        </header>
        <main className="content" id="main-content">
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                onClick={() => {
                  setError("");
                  if (signedIn) void load();
                }}
              >
                Réessayer
              </button>
              <button
                className="icon-btn"
                aria-label="Fermer l’erreur"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading-state">
              <RefreshCw className="spin" />
              <p>Ouverture du paddock…</p>
            </div>
          ) : !signedIn ? (
            <section className="welcome">
              <div>
                <span className="eyebrow">BIENVENUE AU PADDOCK</span>
                <h1>
                  Un garage.
                  <br />
                  Mille légendes.
                </h1>
                <p>
                  Collectionne les voitures qui te font vibrer. Ouvre tes
                  boosters, échange tes cartes et défie les passionnés.
                </p>
                <form
                  className="auth-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError("");
                    try {
                      const msg = await loginEmail(
                        email,
                        password,
                        signup ? pseudo : undefined,
                      );
                      if (msg) setToast(msg);
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : "Connexion impossible.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <div className="auth-tabs">
                    <button
                      type="button"
                      className={signup ? "active" : ""}
                      onClick={() => setSignup(true)}
                    >
                      Créer un compte
                    </button>
                    <button
                      type="button"
                      className={!signup ? "active" : ""}
                      onClick={() => setSignup(false)}
                    >
                      J’ai déjà un compte
                    </button>
                  </div>
                  {signup && (
                    <input
                      type="text"
                      placeholder="Pseudo pilote"
                      maxLength={32}
                      required
                      value={pseudo}
                      onChange={(e) => setPseudo(e.target.value)}
                    />
                  )}
                  <input
                    type="email"
                    placeholder="Adresse e-mail"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <input
                    type="password"
                    placeholder="Mot de passe (6 caractères min.)"
                    minLength={6}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button className="btn primary full" disabled={busy}>
                    {signup ? "Entrer au paddock" : "Se connecter"}
                  </button>
                </form>
                {oauthReady && (
                  <button
                    className="btn secondary"
                    onClick={() =>
                      void login().catch((e) => setError(e.message))
                    }
                  >
                    <Users size={18} /> Continuer avec {providerName}
                  </button>
                )}
                <small>
                  2 boosters bonus + 5 000 crédits offerts. Aucun argent réel.
                </small>
              </div>
              <CarArt card={heroCard} hero />
            </section>
          ) : (
            <>
              {tab === "paddock" && (
                <Paddock
                  p={p}
                  inv={inv}
                  unique={unique}
                  catalogSize={catalogSize}
                  cooldown={cooldown}
                  busy={busy}
                  heroCard={heroCard}
                  onDetail={setDetail}
                  onOpenPack={() =>
                    void run("OPEN_PACK", {}, (r) => {
                      setDraws(r.cards || []);
                    })
                  }
                  onBuyPack={() => setConfirm("pack")}
                  onGuide={() => setGuide(true)}
                  goGarage={() => changeTab("garage")}
                  goArena={() => changeTab("arena")}
                  onCopy={() => void copy()}
                />
              )}
              {tab === "garage" && (
                <Garage
                  unique={unique}
                  catalogSize={catalogSize}
                  totalCards={inv.reduce((a, u) => a + u.quantity, 0)}
                  duplicates={duplicates}
                  busy={busy}
                  garage={garage.slice(0, page * PAGE_SIZE)}
                  hasMore={garage.length > page * PAGE_SIZE}
                  filterBar={filterBar()}
                  onRecycle={() => setConfirm("recycle")}
                  onDetail={(u) => setDetail(u.cards)}
                  onFavorite={(u) => {
                    if (!busy) void run("FAVORITE", { cardId: u.id });
                  }}
                  onSell={(u) => {
                    setSell(u);
                    setPrice(String(u.cards.market_value));
                  }}
                  onLoadMore={() => setPage(page + 1)}
                />
              )}
              {tab === "market" && (
                <Market
                  isDemo={isDemo}
                  listings={listings.slice(0, page * PAGE_SIZE)}
                  hasMore={listings.length > page * PAGE_SIZE}
                  filterBar={filterBar(true)}
                  myId={p?.id}
                  busy={busy}
                  p={p}
                  onDetail={setDetail}
                  onCancel={(m) => void run("CANCEL_LISTING", { id: m.id })}
                  onBuy={setBuy}
                  goGarage={() => changeTab("garage")}
                  onLoadMore={() => setPage(page + 1)}
                />
              )}
              {tab === "arena" && (
                <Arena
                  isDemo={isDemo}
                  duels={state?.duels || []}
                  p={p}
                  inv={inv}
                  now={now}
                  busy={busy}
                  onCreate={() => {
                    setSelected(inv[0]?.id || "");
                    setCreate(true);
                  }}
                  onCancel={(d) => void run("CANCEL_DUEL", { id: d.id })}
                  onChallenge={(d) => {
                    setSelected(
                      inv.find((u) => u.cards.division === d.cards.division)
                        ?.id || "",
                    );
                    setChallenge(d);
                  }}
                />
              )}
              {tab === "ranking" && (
                <Ranking
                  isDemo={isDemo}
                  leaderboard={state?.leaderboard || []}
                  myId={p?.id}
                  onRefresh={() => void load()}
                />
              )}
            </>
          )}
          <footer>
            <span>
              <b>APEX DROPS</b> — La passion, carte après carte.
            </span>
            <button onClick={() => setGuide(true)}>
              Règles & probabilités <ArrowUpRight size={13} />
            </button>
            <span>Crédits virtuels · Aucun retrait en argent</span>
          </footer>
        </main>
        {signedIn && (
          <nav className="tabbar" aria-label="Navigation mobile">
            {(["garage", "market"] as const).map((id) => {
              const n = nav.find((x) => x.id === id)!;
              return (
                <button
                  key={id}
                  className={tab === id ? "active" : ""}
                  aria-current={tab === id ? "page" : undefined}
                  onClick={() => changeTab(id)}
                >
                  <n.icon size={20} />
                  <span>{n.short}</span>
                  {id === "garage" && unique > 0 && <i>{unique}</i>}
                </button>
              );
            })}
            {(() => {
              const ready = (cooldown === 0 ? 1 : 0) + (p?.bonus_packs || 0);
              return (
                <button
                  className={`tabbar-fab ${tab === "paddock" ? "active" : ""} ${ready > 0 ? "ready" : ""}`}
                  disabled={busy}
                  onClick={() =>
                    tab === "paddock" && ready > 0
                      ? void run("OPEN_PACK", {}, (r) => setDraws(r.cards || []))
                      : changeTab("paddock")
                  }
                  aria-label="Paddock & boosters"
                >
                  <span className="fab-core">
                    <b>A</b>
                    {ready > 0 && <i>{ready}</i>}
                  </span>
                  <span>{tab === "paddock" && ready > 0 ? "Ouvrir" : "Paddock"}</span>
                </button>
              );
            })()}
            {(["arena", "ranking"] as const).map((id) => {
              const n = nav.find((x) => x.id === id)!;
              return (
                <button
                  key={id}
                  className={tab === id ? "active" : ""}
                  aria-current={tab === id ? "page" : undefined}
                  onClick={() => changeTab(id)}
                >
                  <n.icon size={20} />
                  <span>{n.short}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
      {error && (sell || buy || create || challenge || confirm || account) && (
        <div className="toast error-toast" role="alert">
          <span>{error}</span>
          <button
            className="icon-btn"
            aria-label="Fermer le message"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {detail && <DetailModal card={detail} onClose={() => setDetail(null)} />}
      {draws.length > 0 && (
        <DrawsModal
          draws={draws}
          onInspect={(d) => {
            setDraws([]);
            setDetail(d);
          }}
          onDone={() => {
            setDraws([]);
            changeTab("garage");
          }}
          onClose={() => setDraws([])}
        />
      )}
      {sell && (
        <SellModal
          sell={sell}
          price={price}
          onPrice={setPrice}
          busy={busy}
          run={run}
          onClose={() => setSell(null)}
        />
      )}
      {buy && (
        <BuyModal
          buy={buy}
          cash={p?.cash_balance || 0}
          busy={busy}
          run={run}
          onClose={() => setBuy(null)}
        />
      )}
      {(create || challenge) && (
        <DuelFormModal
          challenge={challenge}
          inv={inv}
          selected={selected}
          onSelected={setSelected}
          bet={bet}
          onBet={setBet}
          busy={busy}
          run={run}
          onClose={() => {
            setCreate(false);
            setChallenge(null);
          }}
          onResult={setDuelResult}
        />
      )}
      {duelResult && (
        <DuelResultModal
          result={duelResult}
          myId={p?.id}
          onClose={() => setDuelResult(null)}
        />
      )}
      {confirm && (
        <ConfirmModal
          kind={confirm}
          duplicates={duplicates}
          recycleValue={recycleValue}
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === "reset") {
              setState(resetDemo());
              setConfirm(null);
              setAccount(false);
              changeTab("paddock");
              setToast("La démo est prête pour un nouveau départ.");
            } else
              void run(
                confirm === "recycle" ? "QUICK_SELL" : "BUY_PACK",
                {},
                () => setConfirm(null),
              );
          }}
        />
      )}
      {history && (
        <HistoryModal
          history={state?.history || []}
          onClose={() => setHistory(false)}
        />
      )}
      {account && (
        <AccountModal
          p={p}
          isDemo={isDemo}
          providerName={providerName}
          refCode={refCode}
          onRefCode={setRefCode}
          busy={busy}
          run={run}
          onCopy={() => void copy()}
          onReset={() => {
            setAccount(false);
            setConfirm("reset");
          }}
          onLogout={() =>
            void logout()
              .then(() => setAccount(false))
              .catch((e) => setError(e.message))
          }
          onClose={() => setAccount(false)}
        />
      )}
      {guide && <GuideModal isDemo={isDemo} onClose={() => setGuide(false)} />}
    </div>
  );
}
