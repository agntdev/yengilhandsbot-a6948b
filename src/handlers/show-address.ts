import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "📍 Адрес", data: "show:address", order: 20 });
const composer = new Composer<Ctx>();

composer.callbackQuery("show:address", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Termiz shahar, Ibn Sino ko'chasi 27A", {
    reply_markup: inlineKeyboard([[inlineButton("Bosh menyu", "menu:main")]]),
  });
});

export default composer;
