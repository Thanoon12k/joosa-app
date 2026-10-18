// Telegram webhook for @my99apps_bot.
// - Lists apps by status; other people unlock it with the PIN, the owner never needs it.
// - Builds arrive three ways: the owner sends an APK to the bot; a GitHub Actions run in one of the
//   owner's repos proves itself with an OIDC token ({event: "gh_upload_url" | "gh_publish"}); or a
//   secret-holder uploads to Storage ({event: "upload_url" | "publish"}). The app is added to
//   Developing or its build is updated. No file is sent until someone presses Download, and
//   people other than the owner can only download Released apps.
// - Anyone with access can comment on an app; the owner is told and the website lists them.
// - The database calls this with {event: "released"} when an app moves to Released → everyone is told.
// Data lives in the private app_manager schema (read over the direct DB URL).
import postgres from "npm:postgres@3.4.5";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "app-builds";
const GH_ISSUER = "https://token.actions.githubusercontent.com";
const GH_JWKS = createRemoteJWKSet(new URL(`${GH_ISSUER}/.well-known/jwks`));
const COMMENT_MINUTES = 30;

const STATUSES = [
  { key: "developing", label: "Developing", icon: "🛠" },
  { key: "released", label: "Released", icon: "✅" },
  { key: "needs_update", label: "Needs update", icon: "🔄" },
  { key: "has_issues", label: "Has issues", icon: "⚠️" },
  { key: "not_started", label: "Not started", icon: "⏸" },
] as const;

const MAX_TRIES = 5;
const LOCK_MINUTES = 15;

type App = {
  id: string; name: string; description: string; status: string; link: string;
  file_id: string; file_name: string; storage_path: string | null;
};
const appCols = () => sql`id::text, name, description, status, link, file_id, file_name, storage_path`;
const hasFile = (a: App) => Boolean(a.file_id || a.storage_path);
const canDownload = (a: App, isOwner: boolean) => hasFile(a) && (isOwner || a.status === "released");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ok = () => new Response("ok");
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

const storage = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/storage/v1/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, ...(init.headers ?? {}) },
  });

/** The first two lines, each cut at ~110 characters on a word boundary. */
function brief(text: string): string {
  return text.split("\n").map((l) => l.trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, 2).map((l) => {
    if (l.length <= 110) return l;
    const cut = l.slice(0, 110);
    return cut.slice(0, cut.lastIndexOf(" ") > 70 ? cut.lastIndexOf(" ") : 110) + "…";
  }).join("\n");
}

let token = "";
async function tg(method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(method, res.status, await res.text());
}
const send = (chat_id: number, text: string, extra: Record<string, unknown> = {}) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

function appBlock(a: App): string {
  let s = `• <b>${esc(a.name)}</b>`;
  if (a.description.trim()) s += `\n${esc(brief(a.description))}`;
  if (a.link.trim()) s += `\n${esc(a.link.trim())}`;
  return s;
}

/** Per app: Download (when this person may) and Comment. */
const appRow = (a: App, isOwner: boolean) => canDownload(a, isOwner)
  ? [{ text: `⬇️ ${a.name}`.slice(0, 40), callback_data: `dl:${a.id}` }, { text: "💬 Comment", callback_data: `cm:${a.id}` }]
  : [{ text: `💬 Comment on ${a.name}`.slice(0, 60), callback_data: `cm:${a.id}` }];

function summaryKeyboard(counts: Record<string, number>, total: number) {
  const rows = [];
  for (let i = 0; i < STATUSES.length; i += 2) {
    rows.push(STATUSES.slice(i, i + 2).map((s) => ({
      text: `${s.icon} ${s.label} (${counts[s.key] ?? 0})`,
      callback_data: `cat:${s.key}`,
    })));
  }
  rows.push([{ text: `📋 All apps (${total})`, callback_data: "cat:all" }]);
  return { inline_keyboard: rows };
}

function renderApps(apps: App[], key: string): { text: string; buttons: App[] }[] {
  const groups = key === "all" ? STATUSES : STATUSES.filter((s) => s.key === key);
  const blocks: { text: string; buttons: App[] }[] = [];
  for (const g of groups) {
    const list = apps.filter((a) => a.status === g.key);
    if (key === "all" && list.length === 0) continue;
    let text = `<b>${g.icon} ${g.label} (${list.length})</b>\n`;
    if (list.length === 0) text += "\nNo apps here yet.";
    for (const a of list) text += "\n" + appBlock(a) + "\n";
    blocks.push({ text, buttons: list });
  }
  if (blocks.length === 0) blocks.push({ text: "No apps yet.", buttons: [] });
  // Telegram messages are capped at 4096 characters.
  const out: { text: string; buttons: App[] }[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && (last.text + "\n" + b.text).length <= 3800) { last.text += "\n" + b.text; last.buttons.push(...b.buttons); }
    else out.push({ text: b.text, buttons: [...b.buttons] });
  }
  return out;
}

const loadApps = () => sql<App[]>`select ${appCols()} from app_manager.apps order by sort_order, lower(name)`;
const findApp = async (id: string) =>
  /^[0-9a-f-]{36}$/i.test(id) ? (await sql<App[]>`select ${appCols()} from app_manager.apps where id = ${id}::uuid`)[0] : undefined;

async function sendSummary(chatId: number) {
  const apps = await loadApps();
  const counts: Record<string, number> = {};
  for (const a of apps) counts[a.status] = (counts[a.status] ?? 0) + 1;
  const lines = STATUSES.map((s) => `${s.icon} ${s.label}: <b>${counts[s.key] ?? 0}</b>`).join("\n");
  await send(chatId, `<b>📱 My apps — ${apps.length} total</b>\n\n${lines}\n\nPick a category to see each app:`,
    { reply_markup: summaryKeyboard(counts, apps.length) });
}

/** Owner plus everyone who unlocked the bot. */
async function audience(owner: number | null): Promise<number[]> {
  const rows = await sql`select chat_id from app_manager.chats where authorized`;
  const ids = new Set<number>(rows.map((r) => Number(r.chat_id)));
  if (owner) ids.add(owner);
  return [...ids];
}

async function broadcast(owner: number | null, a: App, headline: string) {
  const text = `${headline}\n\n${appBlock(a)}`;
  const extra = { reply_markup: { inline_keyboard: [appRow(a, a.status === "released")] } };
  for (const id of await audience(owner)) await send(id, text, extra);
}

/** "joosa-v3.0.0-arm64.apk" → "joosa" */
function packageKey(fileName: string): string {
  return fileName.toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[-_ ]v?\d+(\.\d+)+.*$/, "")
    .replace(/[-_ ](release|debug|arm64|armv7|x86_64|universal).*$/, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
}

type Build = { fileName: string; fileId?: string; storagePath?: string; name?: string; description?: string; repo?: string };

/** A new build: add the app to Developing, or attach the build to it. Only text is sent, never the file. */
async function publish(owner: number | null, b: Build): Promise<string> {
  const key = packageKey(b.fileName);
  const fileId = b.fileId ?? "", path = b.storagePath ?? null;
  const [existing] = b.repo
    ? await sql<App[]>`select ${appCols()} from app_manager.apps where lower(repo) = lower(${b.repo})`
    : await sql<App[]>`select ${appCols()} from app_manager.apps where package_key = ${key}`;
  if (existing) {
    await sql`update app_manager.apps set file_id = ${fileId}, storage_path = ${path}, file_name = ${b.fileName},
              published_at = now() where id = ${existing.id}::uuid`;
    const label = STATUSES.find((s) => s.key === existing.status)?.label ?? existing.status;
    if (owner) await send(owner, `📦 New build of <b>${esc(existing.name)}</b> saved (<code>${esc(b.fileName)}</code>). Status: ${label}.`);
    if (existing.status === "released") {
      await broadcast(owner, { ...existing, file_id: fileId, storage_path: path }, `🆕 <b>New version of ${esc(existing.name)}</b>`);
    }
    return existing.id;
  }
  const base = b.repo ? packageKey(b.repo.split("/")[1] + ".x") : key;
  const name = (b.name?.trim() || base.replace(/(^|-)([a-z])/g, (_, d, c) => (d ? " " : "") + c.toUpperCase())).slice(0, 80);
  const description = (b.description ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 2).join("\n").slice(0, 300);
  const [row] = await sql`insert into app_manager.apps
              (name, description, status, package_key, repo, link, file_id, storage_path, file_name, published_at, sort_order)
            values (${name}, ${description}, 'developing', ${b.repo ? null : key}, ${b.repo ?? null},
                    ${b.repo ? `https://github.com/${b.repo}` : ""}, ${fileId}, ${path}, ${b.fileName}, now(),
                    (select coalesce(max(sort_order), 0) + 1 from app_manager.apps))
            returning id::text`;
  if (owner) await send(owner, `➕ <b>${esc(name)}</b> added to 🛠 Developing.\nMove it to Released on the My Apps website to announce it here.`);
  return row.id;
}

/** Sends an app's build to one chat: by Telegram file id, or uploaded once from Storage and then cached. */
async function sendBuild(chatId: number, a: App) {
  if (a.file_id) return tg("sendDocument", { chat_id: chatId, document: a.file_id, caption: a.name });
  if (!a.storage_path) return;
  const res = await storage(`object/${BUCKET}/${a.storage_path}`);
  if (!res.ok) { console.error("storage", res.status, await res.text()); return send(chatId, "Couldn't fetch this build. Try again later."); }
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", a.name);
  form.append("document", await res.blob(), a.file_name || "app.apk");
  const up = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form });
  const out = await up.json().catch(() => ({}));
  const fileId = out?.result?.document?.file_id;
  if (fileId) await sql`update app_manager.apps set file_id = ${fileId} where id = ${a.id}::uuid and storage_path = ${a.storage_path}`;
  else console.error("sendDocument", up.status, JSON.stringify(out).slice(0, 300));
}

/** The repository ("owner/name") a GitHub Actions OIDC token speaks for, if it is one of the owner's. */
async function githubRepo(req: Request, ghOwner: string): Promise<string | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, GH_JWKS, { issuer: GH_ISSUER, audience: "my-apps" });
    if (String(payload.repository_owner).toLowerCase() !== ghOwner.toLowerCase()) return null;
    if (!/^refs\/(heads\/(main|master)|tags\/)/.test(String(payload.ref))) return null;
    return String(payload.repository);
  } catch (e) {
    console.error("oidc", String(e));
    return null;
  }
}

const whoIs = (from: any) =>
  [from?.first_name, from?.username ? `@${from.username}` : ""].filter(Boolean).join(" ") || "Someone";

/** Comment button pressed: the next message from this chat becomes the comment. */
async function askComment(chatId: number, from: any, a: App) {
  await sql`insert into app_manager.chats (chat_id, first_name, username, pending_comment_app, pending_at)
            values (${chatId}, ${String(from?.first_name ?? "")}, ${String(from?.username ?? "")}, ${a.id}::uuid, now())
            on conflict (chat_id) do update set pending_comment_app = excluded.pending_comment_app, pending_at = now()`;
  await send(chatId, `💬 Write your comment about <b>${esc(a.name)}</b> and send it.\n/cancel to stop.`,
    { reply_markup: { force_reply: true, input_field_placeholder: "Your comment" } });
}

/** If this chat is writing a comment, saves the message as one. Returns true when handled. */
async function takeComment(chatId: number, msg: any, owner: number | null): Promise<boolean> {
  const [st] = await sql`select pending_comment_app::text as app_id from app_manager.chats
                         where chat_id = ${chatId} and pending_comment_app is not null
                           and pending_at > now() - make_interval(mins => ${COMMENT_MINUTES})`;
  if (!st) return false;
  const text = String(msg.text ?? "").trim();
  if (text.startsWith("/")) {
    await sql`update app_manager.chats set pending_comment_app = null where chat_id = ${chatId}`;
    if (text === "/cancel") { await send(chatId, "Cancelled."); return true; }
    return false;
  }
  if (!text) { await send(chatId, "Please send your comment as text."); return true; }
  const a = await findApp(st.app_id);
  await sql`update app_manager.chats set pending_comment_app = null where chat_id = ${chatId}`;
  if (!a) return true;
  const who = whoIs(msg.from);
  await sql`insert into app_manager.comments (app_id, chat_id, author, body)
            values (${a.id}::uuid, ${chatId}, ${who}, ${text.slice(0, 1000)})`;
  await send(chatId, `✅ Thanks! Your comment on <b>${esc(a.name)}</b> was sent.`);
  if (owner && owner !== chatId) await send(owner, `💬 <b>${esc(who)}</b> on <b>${esc(a.name)}</b>:\n${esc(text.slice(0, 1000))}`);
  return true;
}

/** A non-owner chat that hasn't unlocked the bot yet: ask for the PIN and check it. */
async function pinGate(chatId: number, msg: any, from: any, pinHash: string | null, owner: number | null): Promise<boolean> {
  const [chat] = await sql`insert into app_manager.chats (chat_id, first_name, username)
                           values (${chatId}, ${String(from.first_name ?? "")}, ${String(from.username ?? "")})
                           on conflict (chat_id) do update set first_name = excluded.first_name, username = excluded.username
                           returning authorized, failed_attempts, locked_until`;
  if (chat.authorized) return true;
  if (!msg) return false; // a button press before unlocking
  if (chat.locked_until && new Date(chat.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(chat.locked_until).getTime() - Date.now()) / 60000);
    await send(chatId, `🔒 Too many wrong PINs. Try again in ${mins} min.`);
    return false;
  }
  const text = String(msg.text ?? "").trim();
  if (!/^\d{4,8}$/.test(text)) {
    await send(chatId, "🔐 This bot is private. Send the PIN to see the apps.");
    return false;
  }
  // The PIN shouldn't stay in the chat history.
  await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
  const [check] = await sql`select ${pinHash}::text is not null and extensions.crypt(${text}::text, ${pinHash ?? ""}::text) = ${pinHash}::text as ok`;
  if (!check.ok) {
    const tries = chat.failed_attempts + 1;
    if (tries >= MAX_TRIES) {
      await sql`update app_manager.chats set failed_attempts = 0,
                locked_until = now() + make_interval(mins => ${LOCK_MINUTES}) where chat_id = ${chatId}`;
      await send(chatId, `🔒 Wrong PIN. Locked for ${LOCK_MINUTES} minutes.`);
    } else {
      await sql`update app_manager.chats set failed_attempts = ${tries} where chat_id = ${chatId}`;
      await send(chatId, `❌ Wrong PIN. ${MAX_TRIES - tries} tries left.`);
    }
    return false;
  }
  await sql`update app_manager.chats set authorized = true, failed_attempts = 0, locked_until = null,
            authorized_at = now() where chat_id = ${chatId}`;
  await send(chatId, "✅ Unlocked. You'll also get a message here when an app is released.");
  if (owner) {
    await send(owner, `👤 ${esc(whoIs(from))} unlocked the bot with the PIN.`);
  }
  await sendSummary(chatId);
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok();
  const [settings] = await sql`select bot_token, webhook_secret, owner_chat_id, pin_hash, github_owner
                               from app_manager.bot_settings`;
  if (!settings) return new Response("not configured", { status: 503 });
  token = settings.bot_token;
  let owner = settings.owner_chat_id ? Number(settings.owner_chat_id) : null;
  const body = await req.json().catch(() => ({}));

  // From GitHub Actions in one of the owner's repos (see the my-apps.yml workflow).
  if (body.event === "gh_upload_url" || body.event === "gh_publish") {
    const repo = await githubRepo(req, settings.github_owner);
    if (!repo) return json({ error: "not a trusted GitHub Actions token" }, 401);
    const file = String(body.file_name ?? "");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.apk$/.test(file)) return json({ error: "bad file_name" }, 400);
    const path = `${repo.split("/")[1].toLowerCase()}/${file}`;
    if (body.event === "gh_upload_url") {
      const res = await storage(`object/upload/sign/${BUCKET}/${path}`, { method: "POST", headers: { "x-upsert": "true" } });
      const out = await res.json().catch(() => ({}));
      return out.url ? json({ url: `${SB_URL}/storage/v1${out.url}`, path }) : json({ error: out }, 502);
    }
    const id = await publish(owner, {
      fileName: file, storagePath: path, repo,
      name: body.name ? String(body.name) : undefined, description: body.description ? String(body.description) : undefined,
    });
    return json({ id, path });
  }

  if (req.headers.get("x-telegram-bot-api-secret-token") !== settings.webhook_secret) {
    return new Response("forbidden", { status: 401 });
  }

  // From the database trigger: an app just moved to Released.
  if (body.event === "released") {
    const a = await findApp(String(body.app_id));
    if (a && a.status === "released") await broadcast(owner, a, `🚀 <b>${esc(a.name)} is released!</b>`);
    return ok();
  }

  // Build uploads: get a signed URL to PUT the APK into Storage, then announce it.
  const validPath = (p: unknown) => typeof p === "string" && /^[a-z0-9][a-z0-9._-]{0,120}$/i.test(p);
  if (body.event === "upload_url") {
    if (!validPath(body.path)) return json({ error: "bad path" }, 400);
    const res = await storage(`object/upload/sign/${BUCKET}/${body.path}`, { method: "POST", headers: { "x-upsert": "true" } });
    const out = await res.json().catch(() => ({}));
    return out.url ? json({ url: `${SB_URL}/storage/v1${out.url}` }) : json({ error: out }, 502);
  }
  if (body.event === "publish") {
    if (!validPath(body.path)) return json({ error: "bad path" }, 400);
    const id = await publish(owner, {
      fileName: String(body.file_name || body.path), storagePath: body.path,
      name: body.name ? String(body.name) : undefined, description: body.description ? String(body.description) : undefined,
    });
    return json({ id });
  }

  const msg = body.message;
  const cb = body.callback_query;
  const chat = msg?.chat ?? cb?.message?.chat;
  const chatId: number | undefined = chat?.id;
  if (!chatId || chat.type !== "private") return ok();

  // The first private chat to write claims the bot.
  if (owner === null && msg) {
    const [row] = await sql`update app_manager.bot_settings set owner_chat_id = ${chatId}
                             where owner_chat_id is null returning owner_chat_id`;
    owner = row ? Number(row.owner_chat_id) : null;
  }

  const isOwner = chatId === owner;
  if (!isOwner && !(await pinGate(chatId, msg, (msg ?? cb)?.from ?? {}, settings.pin_hash, owner))) {
    if (cb) await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Send the PIN first." });
    return ok();
  }

  if (cb) {
    const data = String(cb.data ?? "");
    if (data.startsWith("dl:")) {
      const a = await findApp(data.slice(3));
      const ready = a && canDownload(a, isOwner);
      const why = !a || !hasFile(a) ? "No file for this app yet." : "Available to download once it's released.";
      await tg("answerCallbackQuery", { callback_query_id: cb.id, text: ready ? "Sending…" : why, show_alert: !ready });
      if (ready) await sendBuild(chatId, a);
      return ok();
    }
    if (data.startsWith("cm:")) {
      const a = await findApp(data.slice(3));
      await tg("answerCallbackQuery", { callback_query_id: cb.id });
      if (a) await askComment(chatId, cb.from, a);
      return ok();
    }
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    const key = data.replace(/^cat:/, "");
    if (key !== "all" && !STATUSES.some((s) => s.key === key)) return ok();
    for (const part of renderApps(await loadApps(), key)) {
      const extra = part.buttons.length ? { reply_markup: { inline_keyboard: part.buttons.map((a) => appRow(a, isOwner)) } } : {};
      await send(chatId, part.text, extra);
    }
    return ok();
  }

  if (isOwner && msg?.document) {
    const [first, ...rest] = String(msg.caption ?? "").trim().split("\n");
    await publish(chatId, {
      fileName: msg.document.file_name ?? "app.apk", fileId: msg.document.file_id,
      name: first, description: rest.join("\n"),
    });
    return ok();
  }

  if (msg && (await takeComment(chatId, msg, owner))) return ok();

  // /start, /apps or any other text: the summary with category buttons.
  await sendSummary(chatId);
  return ok();
});
