import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { CATALOG, PACK_PRICE, SALVAGE, loadCatalog } from "../src/catalog";
import { draw, race, score, integer } from "../src/engine";
await loadCatalog();
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
async function database() {
  const db = new PGlite();
  await db.exec(
    `CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key,raw_user_meta_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;`,
  );
  for (const f of [
    "001_base.sql",
    "002_hardening.sql",
    "003_catalog.sql",
    "004_concurrency.sql",
    "005_catalog_schema.sql",
    "006_catalog_data.sql",
  ])
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + f, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    `INSERT INTO auth.users VALUES('${A}','{"name":"Alice"}'),('${B}','{"name":"Bob"}');`,
  );
  return db;
}
async function identity(db: PGlite, who = A) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${who}',false);`);
}
async function action(
  db: PGlite,
  kind: string,
  payload: Record<string, unknown> = {},
  request = crypto.randomUUID(),
) {
  const r = await db.query<{ result: any }>(
    "SELECT public.game_action($1,$2::jsonb,$3::uuid) result",
    [kind, JSON.stringify(payload), request],
  );
  return r.rows[0].result;
}
async function snapshot(db: PGlite) {
  return (await db.query<{ s: any }>("SELECT public.game_state() s")).rows[0].s;
}
async function owned(db: PGlite, who = A, card = 1, quantity = 1) {
  return (
    await db.query<{ id: string }>(
      "INSERT INTO public.user_cards(user_id,card_id,quantity) VALUES($1,$2,$3) RETURNING id",
      [who, card, quantity],
    )
  ).rows[0].id;
}
test("Catalog, economy, pity and duel invariants", () => {
  assert.ok(CATALOG.length > 1000);
  assert.equal(new Set(CATALOG.map((c) => c.id)).size, CATALOG.length);
  // Les 24 cartes d'origine gardent leurs ids (inventaires existants).
  for (let id = 1; id <= 24; id++)
    assert.equal(CATALOG.find((c) => c.id === id)?.id, id);
  for (const c of CATALOG) {
    assert.ok(c.handling_score >= 1 && c.handling_score <= 100, c.name);
    assert.ok(c.power_hp > 0 && c.weight_kg > 0 && c.top_speed_kmh > 0, c.name);
    assert.ok(c.market_value > 0, c.name);
  }
  assert.ok(Math.max(...Object.values(SALVAGE)) * 3 < PACK_PRICE);
  assert.ok(
    ["Common", "Rare", "Epic", "Legendary", "Mythic"].every((r) =>
      CATALOG.some((c) => c.rarity === r),
    ),
  );
  assert.equal(draw(29, () => 0.5).card.rarity, "Legendary");
  assert.equal(draw(29, () => 0.01).card.rarity, "Mythic");
  assert.equal(draw(29, () => 0.5).pity, 0);
  assert.throws(() => integer(1.2, 1, 10));
  assert.throws(() => race(CATALOG[0], CATALOG[2]));
  assert.equal(
    race(CATALOG[0], CATALOG[0], () => 0.5).aScore,
    race(CATALOG[0], CATALOG[0], () => 0.5).bScore,
  );
  for (const c of CATALOG)
    for (let t = 0; t < 4; t++)
      assert.ok(score(c, t) > 0 && score(c, t) <= 100);
});
test("PostgreSQL migrations and authenticated transaction scenarios", async (t) => {
  const db = await database();
  try {
    await t.test("24 cards, profiles and starting grant", async () => {
      await identity(db);
      const s = await snapshot(db);
      assert.equal(s.catalog_size, CATALOG.length);
      assert.equal("catalog" in s, false);
      assert.equal(s.profile.cash_balance, 5000);
      assert.equal(s.profile.bonus_packs, 2);
    });
    await t.test("anonymous RPC and direct writes forbidden", async () => {
      await db.exec("SET ROLE anon");
      await assert.rejects(
        db.query("SELECT public.game_state()"),
        /permission denied/,
      );
      await db.exec("RESET ROLE; SET ROLE authenticated");
      await assert.rejects(
        db.query(
          `UPDATE public.profiles SET cash_balance=999999 WHERE id='${A}'`,
        ),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT public.expire_duels()"),
        /permission denied/,
      );
      await db.exec("RESET ROLE");
    });
    await t.test("missing auth rejected even as function owner", async () => {
      await identity(db, "");
      await assert.rejects(action(db, "OPEN_PACK"), /Connecte-toi/);
      await identity(db);
    });
    await t.test("pack is atomic and retry idempotent", async () => {
      const request = crypto.randomUUID();
      const first = await action(db, "OPEN_PACK", {}, request);
      const second = await action(db, "OPEN_PACK", {}, request);
      assert.deepEqual(first, second);
      assert.equal(first.cards.length, 3);
      assert.equal(
        (await snapshot(db)).inventory.reduce(
          (n: number, u: any) => n + u.quantity,
          0,
        ),
        3,
      );
      await assert.rejects(action(db, "BUY_PACK", {}, request), /déjà utilisé/);
    });
    await t.test("cooldown and two bonus packs enforced", async () => {
      await action(db, "OPEN_PACK");
      await action(db, "OPEN_PACK");
      await assert.rejects(action(db, "OPEN_PACK"), /pas encore prêt/);
      assert.equal((await snapshot(db)).profile.bonus_packs, 0);
    });
    await t.test("cannot spend unavailable cash", async () => {
      await assert.rejects(action(db, "BUY_PACK"), /15 000/);
      assert.equal((await snapshot(db)).profile.cash_balance, 5000);
    });
    await t.test(
      "SQL race math matches frontend for all cards / tracks",
      async () => {
        const r = await db.query<{ id: number; s: string[] }>(
          "SELECT id, ARRAY[public.race_score(c,0),public.race_score(c,1),public.race_score(c,2),public.race_score(c,3)]::text[] s FROM public.cards c",
        );
        assert.equal(r.rows.length, CATALOG.length);
        const byId = new Map(CATALOG.map((c) => [c.id, c]));
        for (const row of r.rows)
          for (let track = 0; track < 4; track++)
            assert.ok(
              Math.abs(Number(row.s[track]) - score(byId.get(row.id)!, track)) <
                1e-8,
              `card ${row.id} track ${track}`,
            );
      },
    );
    await t.test("favorites protected and recycle corrects score", async () => {
      await db.exec(`DELETE FROM public.user_cards WHERE user_id='${A}';`);
      const card = await owned(db, A, 1, 3);
      await action(db, "FAVORITE", { cardId: card });
      await assert.rejects(action(db, "QUICK_SELL"), /Aucun doublon/);
      await action(db, "FAVORITE", { cardId: card });
      await action(db, "QUICK_SELL");
      const s = await snapshot(db);
      assert.equal(s.profile.cash_balance, 6200);
      assert.equal(s.profile.collection_score, 18500);
      assert.equal(s.inventory[0].quantity, 1);
    });
    await t.test("cross-account inventory access rejected", async () => {
      const s = await snapshot(db);
      await identity(db, B);
      await assert.rejects(
        action(db, "LIST", { cardId: s.inventory[0].id, price: 1000 }),
        /plus disponible/,
      );
      await identity(db);
    });
    await t.test(
      "listing cancel restores card without creating money",
      async () => {
        const s = await snapshot(db);
        await action(db, "LIST", { cardId: s.inventory[0].id, price: 1000 });
        let next = await snapshot(db);
        assert.equal(next.profile.collection_score, 0);
        const listing = next.listings[0].id;
        await identity(db, B);
        await assert.rejects(
          action(db, "CANCEL_LISTING", { id: listing }),
          /appartient pas/,
        );
        await identity(db);
        await action(db, "CANCEL_LISTING", { id: listing });
        next = await snapshot(db);
        assert.equal(next.inventory[0].quantity, 1);
        assert.equal(next.profile.cash_balance, 6200);
        assert.equal(next.profile.collection_score, 18500);
      },
    );
    await t.test(
      "market transfer charges buyer and pays seller 90 percent exactly once",
      async () => {
        const s = await snapshot(db);
        await action(db, "LIST", { cardId: s.inventory[0].id, price: 1000 });
        const listing = (await snapshot(db)).listings[0].id;
        await assert.rejects(
          action(db, "BUY", { id: listing }),
          /propre annonce/,
        );
        await identity(db, B);
        const req = crypto.randomUUID();
        await action(db, "BUY", { id: listing }, req);
        await action(db, "BUY", { id: listing }, req);
        assert.equal((await snapshot(db)).profile.cash_balance, 4000);
        await assert.rejects(
          action(db, "BUY", { id: listing }),
          /plus disponible/,
        );
        await identity(db);
        assert.equal((await snapshot(db)).profile.cash_balance, 7100);
      },
    );
    await t.test(
      "duel locks card, enforces category and settles both accounts",
      async () => {
        const aid = await owned(db, A, 8);
        const other = await owned(db, B, 3);
        await action(db, "CREATE_DUEL", { cardId: aid, bet: 1000 });
        const d = (await snapshot(db)).duels[0];
        await assert.rejects(
          action(db, "LIST", { cardId: aid, price: 1000 }),
          /engagée/,
        );
        await identity(db, B);
        await assert.rejects(
          action(db, "ACCEPT_DUEL", { id: d.id, cardId: other }),
          /même catégorie/,
        );
        const bid = (await snapshot(db)).inventory.find(
          (u: any) => u.card_id === 1,
        ).id;
        const r = await action(db, "ACCEPT_DUEL", { id: d.id, cardId: bid });
        assert.equal(r.duel.pot_won, 1900);
        const sum = (
          await db.query<{ sum: string }>(
            "SELECT sum(cash_balance) sum FROM public.profiles",
          )
        ).rows[0].sum;
        assert.equal(Number(sum), 11000);
        await assert.rejects(
          action(db, "ACCEPT_DUEL", { id: d.id, cardId: bid }),
          /plus ouvert/,
        );
        await identity(db);
      },
    );
    await t.test("cancel and expiration refund precisely once", async () => {
      const aid = (await snapshot(db)).inventory[0].id;
      const before = (await snapshot(db)).profile.cash_balance;
      await action(db, "CREATE_DUEL", { cardId: aid, bet: 1000 });
      let d = (await snapshot(db)).duels.find((d: any) => d.status === "OPEN");
      await action(db, "CANCEL_DUEL", { id: d.id });
      assert.equal((await snapshot(db)).profile.cash_balance, before);
      await action(db, "CREATE_DUEL", { cardId: aid, bet: 1000 });
      d = (await snapshot(db)).duels.find((d: any) => d.status === "OPEN");
      await db.query(
        "UPDATE public.duel_lobbies SET expires_at=now()-interval '1 second' WHERE id=$1",
        [d.id],
      );
      assert.equal((await snapshot(db)).profile.cash_balance, before);
      assert.equal((await snapshot(db)).profile.cash_balance, before);
    });
    await t.test(
      "referral is single use, credits viral boosters & cash, self-referral blocked",
      async () => {
        const s = await snapshot(db);
        await assert.rejects(
          action(db, "CLAIM_REFERRAL", { code: s.profile.referral_code }),
          /invalide/,
        );
        await identity(db, B);
        const b = await snapshot(db);
        await action(db, "CLAIM_REFERRAL", { code: s.profile.referral_code });
        const bAfter = await snapshot(db);
        assert.equal(bAfter.profile.cash_balance, b.profile.cash_balance + 5000);
        assert.equal(bAfter.profile.bonus_packs, b.profile.bonus_packs + 2);
        await assert.rejects(
          action(db, "CLAIM_REFERRAL", { code: s.profile.referral_code }),
          /déjà utilisé/,
        );
        await identity(db);
        const aAfter = await snapshot(db);
        assert.equal(aAfter.profile.referrals_count, 1);
        assert.equal(aAfter.profile.bonus_packs, s.profile.bonus_packs + 3);
      },
    );
    await t.test(
      "authenticated role can use RPC but cannot read private tables",
      async () => {
        await identity(db);
        await db.exec("SET ROLE authenticated");
        assert.equal((await snapshot(db)).profile.id, A);
        await assert.rejects(
          db.query("SELECT * FROM public.game_requests"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("SELECT * FROM public.user_cards"),
          /permission denied/,
        );
        await db.exec("RESET ROLE");
      },
    );
    await t.test(
      "invalid amounts and cross-account duel cancellation are rejected",
      async () => {
        const u = (await snapshot(db)).inventory[0].id;
        await assert.rejects(
          action(db, "CREATE_DUEL", { cardId: u, bet: -1000 }),
          /Mise autorisée/,
        );
        await assert.rejects(
          action(db, "CREATE_DUEL", { cardId: u, bet: 1000001 }),
          /Mise autorisée/,
        );
        await assert.rejects(
          action(db, "LIST", { cardId: u, price: 0 }),
          /Prix autorisé/,
        );
        await action(db, "CREATE_DUEL", { cardId: u, bet: 1000 });
        const d = (await snapshot(db)).duels.find(
          (d: any) => d.status === "OPEN",
        );
        await identity(db, B);
        await assert.rejects(
          action(db, "CANCEL_DUEL", { id: d.id }),
          /appartient pas/,
        );
        await identity(db);
        await action(db, "CANCEL_DUEL", { id: d.id });
      },
    );
    await t.test(
      "ledger and RLS are present, leaderboard excludes balances and referral codes",
      async () => {
        const s = await snapshot(db);
        assert.ok(s.history.length > 0);
        assert.ok(
          s.leaderboard.every(
            (p: any) => !("cash_balance" in p) && !("referral_code" in p),
          ),
        );
        const r = await db.query<{ relrowsecurity: boolean }>(
          "SELECT relrowsecurity FROM pg_class WHERE relname IN ('profiles','cards','user_cards','market_listings','duel_lobbies','game_requests','wallet_history')",
        );
        assert.equal(r.rows.length, 7);
        assert.ok(r.rows.every((r) => r.relrowsecurity));
      },
    );
  } finally {
    await db.close();
  }
});
