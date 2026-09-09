import { Composer, Keyboard } from "grammy";
import type { Ctx } from "../bot.js";
import {
  adminChatId,
  inlineButton,
  inlineKeyboard,
  isOwner,
  persistentDatabase,
  registerMainMenuItem,
  type PersistentDatabase,
} from "../toolkit/index.js";

registerMainMenuItem({ label: "🗓 Онлайн запись", data: "booking:start", order: 10 });
registerMainMenuItem({ label: "Yozuvlarni boshqarish", data: "booking:manage", order: 40 });

const composer = new Composer<Ctx>();

const SERVICES = [
  ["treatment", "Tishlarni davolash"],
  ["removal", "Tishlarni olib tashlash"],
  ["cleaning", "Professional tozalash"],
  ["implant", "Implantatsiya"],
  ["braces", "Breketlar"],
  ["prosthesis", "Protezlash"],
] as const;
type ServiceId = (typeof SERVICES)[number][0];

const TASHKENT = "Asia/Tashkent";
let clock: () => Date = () => new Date();
/** Test seam for all booking-calendar time decisions. */
export function setBookingClock(next?: () => Date): void { clock = next ?? (() => new Date()); }
function now(): Date { return clock(); }

function serviceName(id: string): string | undefined {
  return SERVICES.find(([serviceId]) => serviceId === id)?.[1];
}
function dateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TASHKENT, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (kind: string) => parts.find((part) => part.type === kind)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
function weekday(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
function isAvailableDate(iso: string): boolean {
  const today = dateKey(now());
  const offset = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return offset >= 0 && offset < 90 && weekday(iso) !== 0;
}
function labelDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("uz-UZ", { timeZone: TASHKENT, day: "numeric", month: "long", weekday: "short" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
function slots(): string[] {
  const result: string[] = [];
  for (let minutes = 8 * 60 + 30; minutes <= 22 * 60; minutes += 30) {
    result.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  return result;
}
function clearBooking(ctx: Ctx): void { ctx.session.booking = undefined; }
function bookingKeyboard(rows: ReturnType<typeof inlineButton>[][]) {
  return inlineKeyboard([...rows, [inlineButton("Bosh menyu", "menu:main")]]);
}
async function ensureSchema(db: PersistentDatabase): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, service_id TEXT NOT NULL, date TEXT NOT NULL, time_slot TEXT NOT NULL, patient_name TEXT NOT NULL, patient_phone TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, created_by_telegram_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS slots (date TEXT NOT NULL, time TEXT NOT NULL, is_taken INTEGER NOT NULL, appointment_id TEXT NOT NULL, PRIMARY KEY(date, time));
CREATE TABLE IF NOT EXISTS patients (telegram_user_id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, last_booking_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admin_notifications (appointment_id TEXT PRIMARY KEY, sent_at TEXT NOT NULL, admin_chat_id TEXT, status TEXT NOT NULL);`);
}
async function takenSlots(db: PersistentDatabase | undefined, date: string): Promise<Set<string>> {
  if (!db) return new Set();
  await ensureSchema(db);
  const row = await db.prepare("SELECT time FROM slots WHERE date = ? AND is_taken = 1").bind(date).run<{ time: string }>();
  return new Set(((row.results ?? []) as Array<{ time: string }>).map((item) => item.time));
}
async function showDates(ctx: Ctx, page: number, edit = true): Promise<void> {
  const today = dateKey(now());
  const dates = Array.from({ length: 90 }, (_, i) => addDays(today, i)).filter(isAvailableDate);
  const pageDates = dates.slice(Math.max(0, page) * 6, Math.max(0, page) * 6 + 6);
  const controls = [] as ReturnType<typeof inlineButton>[];
  if (page > 0) controls.push(inlineButton("‹ Oldingi", `b:p:${page - 1}`));
  if ((page + 1) * 6 < dates.length) controls.push(inlineButton("Keyingi ›", `b:p:${page + 1}`));
  const markup = bookingKeyboard([
    ...pageDates.map((date) => [inlineButton(labelDate(date), `b:d:${date}`)]),
    ...(controls.length ? [controls] : []),
  ]);
  const text = "Qabul kunini tanlang. Yakshanba dam olish kuni.";
  if (edit) await ctx.editMessageText(text, { reply_markup: markup });
  else await ctx.reply(text, { reply_markup: markup });
}
async function showSlots(ctx: Ctx, date: string, page = 0): Promise<void> {
  const db = persistentDatabase(ctx);
  const taken = await takenSlots(db, date);
  const free = slots().filter((time) => !taken.has(time));
  if (free.length === 0) {
    await ctx.editMessageText("Bu kunda bo'sh vaqt qolmadi. Boshqa kunni tanlang.", { reply_markup: bookingKeyboard([[inlineButton("Boshqa kun", "b:dates")]]) });
    return;
  }
  const shown = free.slice(page * 12, page * 12 + 12);
  const controls = [] as ReturnType<typeof inlineButton>[];
  if (page > 0) controls.push(inlineButton("‹ Oldingi", `b:s:${date}:${page - 1}`));
  if ((page + 1) * 12 < free.length) controls.push(inlineButton("Keyingi ›", `b:s:${date}:${page + 1}`));
  const rows: ReturnType<typeof inlineButton>[][] = [];
  for (let i = 0; i < shown.length; i += 3) rows.push(shown.slice(i, i + 3).map((time) => inlineButton(time, `b:t:${date}:${time}`)));
  if (controls.length) rows.push(controls);
  rows.push([inlineButton("Boshqa kun", "b:dates")]);
  await ctx.editMessageText(`${labelDate(date)} uchun bo'sh vaqtni tanlang.`, { reply_markup: bookingKeyboard(rows) });
}
function summary(booking: NonNullable<Ctx["session"]["booking"]>): string {
  return `Yozuvingizni tekshiring:\nXizmat: ${serviceName(booking.serviceId) ?? ""}\nSana: ${labelDate(booking.date)}\nVaqt: ${booking.time}\nIsm: ${booking.name}\nTelefon: ${booking.phone}`;
}
function validPhone(value: string): string | undefined {
  const compact = value.replace(/[\s()\-]/g, "");
  return /^\+?\d{9,15}$/.test(compact) ? compact : undefined;
}

composer.callbackQuery("booking:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  clearBooking(ctx);
  await ctx.editMessageText("Qaysi xizmat kerak?", { reply_markup: bookingKeyboard(SERVICES.map(([id, name]) => [inlineButton(name, `b:service:${id}`)])) });
});
composer.callbackQuery(/^b:service:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match[1];
  if (!serviceName(id)) { await ctx.reply("Bu xizmat topilmadi. Qaytadan tanlang."); return; }
  ctx.session.booking = { step: "awaiting_name", serviceId: id, date: "", time: "" };
  await showDates(ctx, 0);
});
composer.callbackQuery(/^b:p:(\d+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await showDates(ctx, Number(ctx.match[1])); });
composer.callbackQuery("b:dates", async (ctx) => { await ctx.answerCallbackQuery(); await showDates(ctx, 0); });
composer.callbackQuery(/^b:d:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const date = ctx.match[1];
  if (!ctx.session.booking || !isAvailableDate(date)) { await ctx.reply("Bu sana endi mavjud emas. Boshqa kunni tanlang."); return; }
  ctx.session.booking.date = date;
  await showSlots(ctx, date);
});
composer.callbackQuery(/^b:s:(\d{4}-\d{2}-\d{2}):(\d+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await showSlots(ctx, ctx.match[1], Number(ctx.match[2])); });
composer.callbackQuery(/^b:t:(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const [, date, time] = ctx.match;
  if (!ctx.session.booking || ctx.session.booking.date !== date || !slots().includes(time)) { await ctx.reply("Bu vaqtni qaytadan tanlang."); return; }
  ctx.session.booking.time = time;
  ctx.session.booking.step = "awaiting_name";
  await ctx.reply("Ismingizni kiriting.", { reply_markup: { force_reply: true, input_field_placeholder: "Ismingiz" } });
});
composer.on("message:contact", async (ctx) => {
  if (ctx.session.booking?.step !== "awaiting_phone") return;
  const phone = validPhone(ctx.message.contact.phone_number);
  if (!phone) { await ctx.reply("Raqamni o'qiy olmadim. Kontaktni qayta yuboring yoki qo'lda yozing."); return; }
  ctx.session.booking.phone = phone;
  ctx.session.booking.step = "confirming";
  await ctx.reply(summary(ctx.session.booking), { reply_markup: inlineKeyboard([[inlineButton("Tasdiqlash", "b:confirm"), inlineButton("Bekor qilish", "b:cancel")], [inlineButton("Bosh menyu", "menu:main")]]) });
});
composer.on("message:text", async (ctx, next) => {
  const booking = ctx.session.booking;
  if (!booking) return next();
  const text = ctx.message.text.trim();
  if (booking.step === "awaiting_name") {
    if (text.length < 2 || text.length > 80) { await ctx.reply("Ismni kamida 2 harf bilan kiriting."); return; }
    booking.name = text;
    booking.step = "awaiting_phone";
    await ctx.reply("Telefon raqamingizni yuboring yoki qo'lda yozing.", { reply_markup: new Keyboard().requestContact("Kontaktimni yuborish").resized().oneTime().placeholder("+998 ...") });
    return;
  }
  if (booking.step === "awaiting_phone") {
    const phone = validPhone(text);
    if (!phone) { await ctx.reply("Raqam to'g'ri ko'rinmadi. +998 bilan yozing yoki kontaktni yuboring."); return; }
    booking.phone = phone;
    booking.step = "confirming";
    await ctx.reply(summary(booking), { reply_markup: inlineKeyboard([[inlineButton("Tasdiqlash", "b:confirm"), inlineButton("Bekor qilish", "b:cancel")], [inlineButton("Bosh menyu", "menu:main")]]) });
  }
});
composer.callbackQuery("b:cancel", async (ctx) => { await ctx.answerCallbackQuery(); clearBooking(ctx); await ctx.editMessageText("Yozuv bekor qilindi. Kerak bo'lsa, yangidan boshlang.", { reply_markup: inlineKeyboard([[inlineButton("Bosh menyu", "menu:main")]]) }); });
composer.callbackQuery("b:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const booking = ctx.session.booking;
  const userId = ctx.from?.id;
  if (!booking || booking.step !== "confirming" || !booking.name || !booking.phone || !userId || !isAvailableDate(booking.date)) { clearBooking(ctx); await ctx.editMessageText("Yozuvni tekshirib bo'lmadi. Iltimos, yangidan boshlang.", { reply_markup: inlineKeyboard([[inlineButton("Yozilish", "booking:start")]]) }); return; }
  const db = persistentDatabase(ctx);
  if (!db) { await ctx.editMessageText("Yozuvni hozir saqlab bo'lmadi. Birozdan keyin qayta urinib ko'ring.", { reply_markup: inlineKeyboard([[inlineButton("Bosh menyu", "menu:main")]]) }); return; }
  try {
    await ensureSchema(db);
    const id = crypto.randomUUID();
    const createdAt = now().toISOString();
    const result = await db.batch([
      db.prepare("INSERT INTO slots(date, time, is_taken, appointment_id) VALUES (?, ?, 1, ?) ON CONFLICT(date, time) DO NOTHING").bind(booking.date, booking.time, id),
      db.prepare("INSERT INTO appointments(id, service_id, date, time_slot, patient_name, patient_phone, status, created_at, created_by_telegram_id) SELECT ?, ?, ?, ?, ?, ?, 'confirmed', ?, ? WHERE changes() = 1").bind(id, booking.serviceId, booking.date, booking.time, booking.name, booking.phone, createdAt, String(userId)),
      db.prepare("INSERT INTO patients(telegram_user_id, name, phone, last_booking_id) SELECT ?, ?, ?, ? WHERE changes() = 1 ON CONFLICT(telegram_user_id) DO UPDATE SET name = excluded.name, phone = excluded.phone, last_booking_id = excluded.last_booking_id").bind(String(userId), booking.name, booking.phone, id),
    ]);
    if ((result[0]?.meta?.changes ?? 0) !== 1) { await ctx.editMessageText("Bu vaqt hozirgina band bo'ldi. Boshqa bo'sh vaqtni tanlang.", { reply_markup: inlineKeyboard([[inlineButton("Bo'sh vaqtlar", `b:d:${booking.date}`)]]) }); return; }
    const admin = adminChatId(ctx as Ctx & { env?: Record<string, unknown> });
    let notice = "";
    let notificationStatus = "not_configured";
    if (admin) {
      try {
        await ctx.api.sendMessage(admin, `Yangi yozuv\nXizmat: ${serviceName(booking.serviceId)}\nSana: ${booking.date}\nVaqt: ${booking.time}\nIsm: ${booking.name}\nTelefon: ${booking.phone}\nTelegram ID: ${userId}`);
        notificationStatus = "sent";
      } catch { notificationStatus = "failed"; notice = " Klinika xabardor qilinmadi; iltimos, telefon orqali ham bog'laning."; }
    } else notice = " Klinika xabardor qilinmadi, chunki administrator aloqasi sozlanmagan.";
    await db.prepare("INSERT INTO admin_notifications(appointment_id, sent_at, admin_chat_id, status) VALUES (?, ?, ?, ?)").bind(id, now().toISOString(), admin ?? null, notificationStatus).run();
    const confirmation = summary(booking).replace("Yozuvingizni tekshiring:", "Yozuvingiz tasdiqlandi:");
    clearBooking(ctx);
    await ctx.editMessageText(`${confirmation}${notice}`, { reply_markup: inlineKeyboard([[inlineButton("Bosh menyu", "menu:main")]]) });
  } catch { await ctx.editMessageText("Yozuvni saqlashda muammo bo'ldi. Birozdan keyin qayta urinib ko'ring.", { reply_markup: inlineKeyboard([[inlineButton("Bosh menyu", "menu:main")]]) }); }
});

type AdminAppointment = { id: string; date: string; time_slot: string; patient_name: string; service_id: string };
async function showOwnerBookings(ctx: Ctx, edit: boolean): Promise<void> {
  const db = persistentDatabase(ctx);
  if (!db) {
    const text = "Yozuvlar bazasi hali sozlanmagan.";
    if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard([[inlineButton("Bosh menyu", "menu:main")]]) });
    else await ctx.reply(text);
    return;
  }
  await ensureSchema(db);
  const response = await db.prepare("SELECT id, date, time_slot, patient_name, service_id FROM appointments WHERE status = 'confirmed' ORDER BY date, time_slot LIMIT 12").run<AdminAppointment>();
  const appointments = (response.results ?? []) as AdminAppointment[];
  if (!appointments.length) {
    await ctx.editMessageText("Hozircha faol yozuvlar yo'q.", { reply_markup: inlineKeyboard([[inlineButton("Bosh menyu", "menu:main")]]) });
    return;
  }
  const rows = appointments.map((appointment) => [inlineButton(`${appointment.date} ${appointment.time_slot} — ${appointment.patient_name}`, `b:a:${appointment.id}`)]);
  rows.push([inlineButton("Bosh menyu", "menu:main")]);
  await ctx.editMessageText("Faol yozuvni tanlang.", { reply_markup: inlineKeyboard(rows) });
}
function ownerAllowed(ctx: Ctx): boolean { return isOwner(ctx as Ctx & { env?: Record<string, unknown> }); }
composer.callbackQuery("booking:manage", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ownerAllowed(ctx)) { await ctx.reply("Bu bo'lim faqat klinika administratori uchun."); return; }
  await showOwnerBookings(ctx, true);
});
composer.callbackQuery(/^b:a:([0-9a-f-]{36})$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ownerAllowed(ctx)) { await ctx.reply("Bu bo'lim faqat klinika administratori uchun."); return; }
  const db = persistentDatabase(ctx);
  if (!db) { await ctx.reply("Yozuvlar bazasi hali sozlanmagan."); return; }
  await ensureSchema(db);
  const appointment = await db.prepare("SELECT id, date, time_slot, patient_name, service_id FROM appointments WHERE id = ? AND status = 'confirmed'").bind(ctx.match[1]).first<AdminAppointment>();
  if (!appointment) { await ctx.editMessageText("Bu yozuv allaqachon yopilgan."); return; }
  await ctx.editMessageText(`${appointment.date}, ${appointment.time_slot}\n${appointment.patient_name} — ${serviceName(appointment.service_id)}\n\nYozuvni bekor qilasizmi?`, { reply_markup: inlineKeyboard([[inlineButton("Bekor qilish", `b:x:${appointment.id}`)], [inlineButton("Ro'yxat", "booking:manage")]]) });
});
composer.callbackQuery(/^b:x:([0-9a-f-]{36})$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ownerAllowed(ctx)) { await ctx.reply("Bu bo'lim faqat klinika administratori uchun."); return; }
  const db = persistentDatabase(ctx);
  if (!db) { await ctx.reply("Yozuvlar bazasi hali sozlanmagan."); return; }
  await ensureSchema(db);
  const appointment = await db.prepare("SELECT date, time_slot FROM appointments WHERE id = ? AND status = 'confirmed'").bind(ctx.match[1]).first<{ date: string; time_slot: string }>();
  if (!appointment) { await ctx.editMessageText("Bu yozuv allaqachon yopilgan."); return; }
  await db.batch([
    db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ? AND status = 'confirmed'").bind(ctx.match[1]),
    db.prepare("DELETE FROM slots WHERE appointment_id = ? AND changes() = 1").bind(ctx.match[1]),
  ]);
  await ctx.editMessageText("Yozuv bekor qilindi. Bu vaqt yana bo'sh.", { reply_markup: inlineKeyboard([[inlineButton("Yozuvlar ro'yxati", "booking:manage")]]) });
});

export default composer;
