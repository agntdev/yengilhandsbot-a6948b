import { Composer, Keyboard } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "☎️ Контакты", data: "show:contacts", order: 30 });
const composer = new Composer<Ctx>();

composer.callbackQuery("show:contacts", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Biz bilan bog'laning: +998 99 278 14 14", {
    reply_markup: inlineKeyboard([[inlineButton("Bosh menyu", "menu:main")]]),
  });
  await ctx.reply("Raqamingizni ham yuborishingiz mumkin.", {
    reply_markup: new Keyboard().requestContact("Kontaktimni yuborish").resized().oneTime(),
  });
});

export default composer;
