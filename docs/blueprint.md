# YengilHandsBot — Onlayn yozuv — Bot specification

**Archetype:** booking

**Voice:** warm and concise — write every user-facing message, button label, error, and empty state in this voice.

Telegram-bot klinika «Yengil qo'llar stomatologiya» uchun onlayn yozuvlarni qabul qiladi: xizmat tanlash, sana va vaqt slotini band qilish, bemor maʼlumotlarini qabul qilish va har bir yangi yozuv haqida administrator chatiga Telegram-xabar yuborish. Hamkorlik faqat bitta shifokor (Javohir) va bir xil vaqtda bitta bemor modeli asosida ishlaydi.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Klinika bemorlari (uzbekcha so'zlashuvchi)
- Klinika administratorlari

## Success criteria

- Foydalanuvchi /start yoki bosh menyudan 🗓 Онлайн запись tugmasi orqali 5 daqiqadan kam vaqt ichida yozuvni yakunlay oladi
- Yozuv saqlanadi va tanlangan vaqt-slot darhol boshqa foydalanuvchilar uchun yo'q qilinadi (bloklanadi)
- Administratorga har bir yangi yozuv uchun to'liq tafsilotli Telegram-xabar jo'natiladi (ADMIN_CHAT_ID ga)
- Bemorga Telegram orqali yozuv tasdiqlash ekrani ko'rsatiladi (xizmat, sana, vaqt, ism, telefon)

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Asosiy menyuni ochadi (🗓 Онлайн запись, 📍 Адрес, ☎️ Контакты)
- **🗓 Онлайн запись** (button, actor: user, callback: booking:start) — Yozuv oqimini boshlaydi — xizmatni tanlashdan boshlanadi
  - outputs: Service list, Calendar (sana tanlash), Available time slots
- **📍 Адрес** (button, actor: user, callback: show:address) — Klinika manzilini ko'rsatadi
  - outputs: Text: 'Termiz shahar, Ibn Sino ko'chasi 27A'
- **☎️ Контакты** (button, actor: user, callback: show:contacts) — Telefon raqam va tez qo'ng'iroq tugmasini ko'rsatadi
  - outputs: Text with phone + inline button 'Отправить мой контакт' or the phone number
- **/help** (command, actor: user, command: /help) — Yordam va qisqacha qo'llanma (fallback).

## Flows

### Patient booking flow
_Trigger:_ callback booking:start or pressing '🗓 Онлайн запись' button

1. 1) Ko'rsatiladi: xizmatlar ro'yxati (Lечение зубов; Удаление зубов; Профессиональная чистка; Имплантация; Брекеты; Протезирование) — bemor bittasini tanlaydi
2. 2) Sana tanlash: kalendar ko'rsatiladi (faqat ish kunlari: Dushanba—Shanba; dam olish: Yakshanba), sanalar 90 kungacha mavjud
3. 3) Vaqt slotlari: tanlangan sanaga mos mavjud slotlar (08:30–22:00 oralig'ida, 30 daqiqalik qadamlar) ko'rsatiladi; band bo'lgan slotlar ko'rinmaydi
4. 4) Bemor vaqt-slotni tanlaydi
5. 5) Bot ismni so'raydi (matn) — foydalanuvchi kiritadi
6. 6) Bot telefonni so'raydi: 'Отправить мой контакт' tugmasi yoki qo'lda kiritish
7. 7) Bot yakuniy tasdiqlash ekranini ko'rsatadi (xizmat, sana, vaqt, ism, telefon) va 'Подтвердить' tugmasi bilan so'raydi
8. 8) Agar bemor 'Подтвердить'ni bosgan bo'lsa: yozuv saqlanadi, slot darhol bloklanadi (atomik operatsiya), bemorga tasdiq ekrani ko'rsatiladi va ADMIN_CHAT_ID ga yangi yozuv haqida tafsilotli bildirishnoma jo'natiladi
9. 9) Agar rezervatsiya zakaz paytida boshqa foydalanuvchi tomonidan allaqachon band qilingan bo'lsa: xatolik xabari ko'rsatiladi va foydalanuvchiga navbatdagi mavjud slotlarni taklif qiladi

_Data touched:_ Service, Appointment, Slot, Patient (name, phone), AdminNotification

### Show address
_Trigger:_ callback show:address or press '📍 Адрес'

1. Display static text: 'Termiz shahar, Ibn Sino ko'chasi 27A' and button 'Главное меню'

_Data touched:_ Static content

### Show contacts
_Trigger:_ callback show:contacts or press '☎️ Контакты'

1. Display phone number '+998 99 278 14 14' and inline button to 'Отправить мой контакт' (uses ForceReply or request_contact when available)

_Data touched:_ Static contact

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Administrator yoki klinika chat-id — yangi yozuvlar shu chatga yuboriladi
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Service** _(retention: persistent)_ — Klinika taklif etayotgan xizmatlar (statiк ro'yxat — olti element)
  - fields: id, name_uz
- **Appointment** _(retention: persistent)_ — Saqlangan yozuvlar
  - fields: id, service_id, date (ISO yyyy-mm-dd), time_slot (HH:MM), patient_name, patient_phone, status (confirmed), created_at, created_by_telegram_id
- **Patient** _(retention: persistent)_ — Oddiy bemor kartasi minimal ma'lumotlar (for convenience and prefill on next booking)
  - fields: telegram_user_id, name, phone, last_booking_id
- **Slot** _(retention: persistent)_ — Avvaldan yaratilgan vaqtlarga asoslangan bandlik holati (kalendarga asoslangan, 30 min qadam)
  - fields: date, time, is_taken, appointment_id
- **AdminNotification** _(retention: persistent)_ — Administratorga jo'natilgan xabarlar (log maqsadida saqlanishi mumkin)
  - fields: appointment_id, sent_at, admin_chat_id, status

## Integrations

- **Telegram** (required) — Bot API messaging for user interaction, inline keyboards, contact request and admin notifications
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- ADMIN_CHAT_ID konfiguratsiyasi (platforma orqali sozlanadi) — yangi yozuvlar shu chatga ketadi
- Qabul qilingan yangi yozuvlarni administrator Telegram xabaridan ko'rish
- Administrator yangilik xabariga javob orqali bemor bilan qo'lda muloqot qilish (manual; botga avtomatik amallar kiritilmaydi)

## Notifications

- Patient: chat tasdiqlovchi ekrani va matn (xizmat, sana, vaqt, ism, telefon) — ozbekcha
- Admin: har bir yangi yozuv haqida to'liq tafsilot (xizmat, sana, vaqt, ism, telefon, bemorning telegram id) yuboriladi ADMIN_CHAT_ID ga

## Permissions & privacy

- Bot telefonni olish uchun contact request (request_contact) so'raydi; foydalanuvchi kontaktni yuborishi ixtiyoriy — qo'lda kiritish variant mavjud
- Saqlangan telefon raqamlari va yozuvlar faqat klinika uchun saqlanadi va faqat ADMIN_CHAT_ID ga xabar yuborish uchun ishlatiladi
- Hech qanday tashqi SMS yoki qo'ng'iroq xizmatiga integratsiya yo'q (maʼlumotlar faqat Telegram va botning o'z bazasida saqlanadi)

## Edge cases

- Race condition: ikki foydalanuvchi bir vaqtning o'zida bir slotni tanlasa — backend atomik bloklash va birinchisini qabul qilish, ikkinchisiga xatolik ko'rsatish kerak
- ADMIN_CHAT_ID noto'g'ri yoki sozlanmagan bo'lsa — yangi yozuvlar yuborilmaydi; bot bemorga hamma narsa muvaffaqiyatli yozib qo'yildimi deb noto'g'ri signal bermasligi lozim (xabardorlik kerak)
- Foydalanuvchi jarayonni o'rtasida to'xtatsa — yarim to'ldirilgan draft saqlanishi kerak emas (session saqlash minimal), lekin oxirgi bosqichda tekshirish talab qilinadi
- Bemor noto'g'ri telefon formatini kiritadi — minimal validatsiya (raqam uzunligi) va kontakt tugmasi tavsiya etiladi
- Maksimal band bo'lsa (bitta kun yoki davr bo'yicha barcha slotlar band) — mos xabar va boshqa sanalarni taklif qilish
- Vaqt zonalari yoki yozgi/zimisti soat o'zgarishi bilan sinxronizatsiya — klinika lokal vaqt zonasini (default: Asia/Tashkent) hisobga olish; agar boshqa bo'lsa, bu missing_fields ga qo'shiladi

## Required tests

- Dialog-level acceptance test: bemor butun oqim bo'ylab (xizmat tanlash → sana → vaqt → ism → telefon → tasdiq) muvaffaqiyatli yozuv qoldiradi va tasdiq oladi
- Concurrency test: bir nechta parallel so'rovlar bilan bir slotga bo'lgan raqobat — faqat bitta yozuv qabul qilinishi va boshqalarga xato berilishi
- Persistence test: saqlangan yozuv bazada paydo bo'lishi va keyingi slot so'rovlarida bloklangan sifatida ko'rinishi
- Admin notification test: ADMIN_CHAT_ID ga to'liq tafsilotli xabar kelishi (va noto'g'ri yoki yo'q bo'lsa, xato loglanishi)
- Contact share test: request_contact tugmasi ishlashi va qo'lda kiritilgan telefonlarning to'g'ri qabul qilinishi

## Assumptions

- Barcha foydalanuvchi-facing matn va tugmalar ozbek tilida bo'ladi
- Foydalanuvchilar uchun bitta shifokor (Javohir) va bitta parallel slot modeli; shu sababli slotlar global ravishda bandlanadi
- Ish vaqti: Dushanba—Shanba 08:30–22:00, Yakshanba dam olish — slotlar 30 daqiqalik qadam bilan yaratiladi
- Mavjudlik oynasi: 90 kun oldinga sanalar mavjud
- To'lovlar va integratsiyalar yo'q — faqat rezervatsiya va bildirishnomalar
