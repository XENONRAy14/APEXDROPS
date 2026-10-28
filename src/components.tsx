import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Box,
  Flame,
  Search,
  ShoppingBag,
  Star,
  X,
} from "lucide-react";
import type { Card, Owned } from "./types";
import { RARITY_LABEL } from "./catalog";

export function CarArt({ card, hero = false }: { card: Card; hero?: boolean }) {
  const [imgError, setImgError] = useState(false);
  const uid = useId().replace(/:/g, "");
  const color = card.color || "#ef4444";

  // Si la carte possède une vraie photo HD et qu'elle charge, on affiche la vraie photo !
  if (card.image_url && !imgError) {
    return (
      <div className={`real-photo-wrap ${hero ? "hero-photo-wrap" : ""}`}>
        <img
          src={card.image_url}
          alt={card.name}
          loading="lazy"
          onError={() => setImgError(true)}
          className={`car-photo ${hero ? "hero-photo" : ""}`}
        />
        <div className="photo-vignette" />
      </div>
    );
  }

  // Fallback SVG stylisé uniquement si le joueur est hors-ligne
  const wheel = (x: number, y = 171, r = 28) => (
    <g key={x}>
      <circle cx={x} cy={y} r={r + 5} fill="#090d14" />
      <circle
        cx={x}
        cy={y}
        r={r - 3}
        fill="#1e293b"
        stroke="#94a3b8"
        strokeWidth="3"
      />
      <circle cx={x} cy={y} r="7" fill="#ef4444" />
    </g>
  );

  return (
    <svg
      className={`car-art ${hero ? "hero-art" : ""}`}
      viewBox="0 0 500 240"
      role="img"
      aria-label={card.name}
    >
      <defs>
        <linearGradient id={`${uid}paint`} x1="0" y1="0" x2="0.4" y2="1">
          <stop stopColor={color} />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      <ellipse cx="253" cy="206" rx="211" ry="14" fill="#000" opacity=".55" />
      <path
        d="M43 155 74 132 145 122 214 76 289 80 351 123 430 139 458 161 449 187 46 187Z"
        fill={`url(#${uid}paint)`}
        stroke="#334155"
        strokeWidth="2"
      />
      {wheel(126)}
      {wheel(375)}
    </svg>
  );
}

export function VehicleCard({
  card,
  foil = false,
  owned,
  children,
  onInspect,
  onFavorite,
}: {
  card: Card;
  foil?: boolean;
  owned?: Owned;
  children?: React.ReactNode;
  onInspect?: () => void;
  onFavorite?: () => void;
}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientY - rect.top) / rect.height - 0.5) * -16;
    const y = ((e.clientX - rect.left) / rect.width - 0.5) * 16;
    setTilt({ x, y });
  };

  const officialVal = Math.floor(card.market_value * (foil ? 2.5 : 1));

  return (
    <article
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={{
        transform:
          tilt.x || tilt.y
            ? `perspective(950px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(-4px)`
            : undefined,
      }}
      className={`vehicle-card rarity-${card.rarity.toLowerCase()} ${foil ? "foil" : ""}`}
    >
      <div className="vehicle-image">
        <div className="card-top">
          <span className="rarity-dot">
            {RARITY_LABEL[card.rarity]}
            {foil ? " ✨ HOLO" : ""}
          </span>
          <div className="card-top-right">
            <span className="card-market-badge">
              {officialVal.toLocaleString("fr-FR")} CR
            </span>
            {onFavorite ? (
              <button
                className={`icon-btn favorite ${owned?.favorite ? "active" : ""}`}
                onClick={onFavorite}
                aria-label={`${owned?.favorite ? "Retirer des" : "Ajouter aux"} favoris : ${card.name}`}
              >
                <Star
                  size={16}
                  fill={owned?.favorite ? "currentColor" : "none"}
                />
              </button>
            ) : (
              <span className="card-number">
                #{String(card.id).padStart(3, "0")}
              </span>
            )}
          </div>
        </div>
        <button
          className="art-button"
          onClick={onInspect}
          aria-label={`Détails de ${card.name}`}
        >
          <CarArt card={card} />
        </button>
        <div className="card-bottom">
          <span className="division-tag">{card.division}</span>
          <span className="year-qty-tag">
            {card.year}
            {owned ? ` · ×${owned.quantity}` : ""}
          </span>
        </div>
      </div>
      <div className="vehicle-body">
        <button className="card-title" onClick={onInspect}>
          <span>{card.name}</span>
          <ArrowUpRight size={16} />
        </button>
        <div className="vehicle-stats">
          <div>
            <small>PUISSANCE</small>
            <b>{card.power_hp} ch</b>
          </div>
          <div>
            <small>POIDS</small>
            <b>{card.weight_kg} kg</b>
          </div>
          <div>
            <small>V-MAX</small>
            <b>{card.top_speed_kmh} km/h</b>
          </div>
          <div>
            <small>CHÂSSIS</small>
            <b className="stat-chassis">{card.handling_score}/100</b>
          </div>
        </div>
        {children}
      </div>
    </article>
  );
}

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const id = useId();
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]',
        );
        if (!items?.length) {
          e.preventDefault();
          return;
        }
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", fn);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", fn);
      prior?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <div className="modal-header">
          <h2 id={id}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Empty({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="empty">
      <Box size={32} />
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  );
}

export function FilterBar({
  market = false,
  query,
  rarity,
  division,
  sort,
  toggled,
  onQuery,
  onRarity,
  onDivision,
  onSort,
  onToggle,
}: {
  market?: boolean;
  query: string;
  rarity: string;
  division: string;
  sort: string;
  toggled: boolean;
  onQuery: (v: string) => void;
  onRarity: (v: string) => void;
  onDivision: (v: string) => void;
  onSort: (v: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="filters">
      <label className="search">
        <Search size={18} />
        <input
          aria-label="Rechercher un véhicule"
          placeholder="Rechercher un véhicule…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </label>
      <select
        aria-label="Rareté"
        value={rarity}
        onChange={(e) => onRarity(e.target.value)}
      >
        <option value="all">Toutes les raretés</option>
        {Object.entries(RARITY_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <select
        aria-label="Catégorie"
        value={division}
        onChange={(e) => onDivision(e.target.value)}
      >
        <option value="all">Toutes les catégories</option>
        {["Route", "Compétition", "Moto"].map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
      <select
        aria-label="Trier"
        value={sort}
        onChange={(e) => onSort(e.target.value)}
      >
        <option value="recent">Plus récentes</option>
        <option value={market ? "price" : "value"}>
          {market ? "Prix croissant" : "Cote décroissante"}
        </option>
        {!market && <option value="name">Nom A → Z</option>}
      </select>
      <button
        className={`chip ${toggled ? "selected" : ""}`}
        onClick={onToggle}
      >
        {market ? <ShoppingBag size={15} /> : <Star size={15} />}{" "}
        {market ? "Mes annonces" : "Favoris"}
      </button>
    </div>
  );
}

export function TrackArt() {
  return (
    <svg viewBox="0 0 420 220" aria-hidden="true" className="track-art">
      <path
        d="m28 150 47-70q10-16 31-8l42 12 43-39q17-16 33 0l27 26 75-6q29-1 31 27l4 37q2 17-17 22l-74 20-32-36-63 44-58-18-49 27q-28 13-40-16Z"
        fill="none"
        stroke="#ef4444"
        strokeWidth="12"
        opacity="0.35"
      />
      <path
        d="m28 150 47-70q10-16 31-8l42 12 43-39q17-16 33 0l27 26 75-6q29-1 31 27l4 37q2 17-17 22l-74 20-32-36-63 44-58-18-49 27q-28 13-40-16Z"
        fill="none"
        stroke="#f59e0b"
        strokeWidth="3"
        strokeDasharray="6 8"
      />
      <circle
        cx="345"
        cy="148"
        r="10"
        fill="#ef4444"
        stroke="#fff"
        strokeWidth="3"
      />
    </svg>
  );
}
