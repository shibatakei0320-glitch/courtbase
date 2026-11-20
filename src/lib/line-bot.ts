import "server-only";
import { db } from "./db";
import { BookingError } from "./booking";
import { recordLine, replyMessages, type LineMsg } from "./line-message";
import { appUrl } from "./url";
import { fmtTime, jstDateKey } from "./format";
import { WEEKDAYS, absentableLessons, availableCredits, bookMakeup, makeupCandidates, memberReportAbsence } from "./school";

/*
 * LINE公式アカウントの自動応答
 *
 * 会員はトーク画面のボタン（クイックリプライ／リッチメニュー）から
 *   欠席連絡 → 回を選ぶ → 確認 → 受付（振替が付く）
 *   振替予約 → 回を選ぶ → 確認 → 予約
 *   予定確認 → これからのレッスンと使える振替
 * ができる。それ以外のメッセージは受信箱に「要対応」として届き、スタッフが管理画面から返信する。
 *
 * リッチメニューは LINE Official Account Manager で作り、各ボタンのアクションを「テキスト」にして
 * 「欠席連絡」「振替予約」「予定確認」「メニュー」を送るように設定する。
 */

export const KEYWORDS: Record<string, string> = {
  欠席連絡: "absent_menu",
  欠席: "absent_menu",
  振替予約: "makeup_menu",
  振替: "makeup_menu",
  振り替え: "makeup_menu",
  予定確認: "schedule",
  予定: "schedule",
  メニュー: "menu",
};

type Event = {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { id: string; type: string; text?: string; packageId?: string; stickerId?: string; fileName?: string };
  postback?: { data: string };
  webhookEventId?: string;
};

const md = (d: Date) => {
  const [, m, day] = jstDateKey(d).split("-").map(Number);
  return `${m}/${day}(${WEEKDAYS[new Date(d.getTime() + 9 * 3600_000).getUTCDay()]})`;
};
const label = (s: string) => (s.length > 20 ? s.slice(0, 19) + "…" : s);

function pb(lbl: string, data: Record<string, string>, displayText?: string) {
  return { type: "action", action: { type: "postback", label: label(lbl), data: new URLSearchParams(data).toString(), displayText: displayText ?? lbl } };
}
const menuItems = () => [
  pb("欠席連絡", { a: "absent_menu" }),
  pb("振替予約", { a: "makeup_menu" }),
  pb("予定確認", { a: "schedule" }),
  { type: "action", action: { type: "uri", label: "マイページ", uri: `${appUrl()}/my/school` } },
];
const text = (t: string, quick: unknown[] = menuItems()): LineMsg => ({ type: "text", text: t.slice(0, 4900), ...(quick.length ? { quickReply: { items: quick.slice(0, 13) } } : {}) });
const confirm = (t: string, yes: Record<string, string>, yesLabel: string): LineMsg => ({
  type: "template",
  altText: t.slice(0, 390),
  template: {
    type: "confirm",
    text: t.slice(0, 240),
    actions: [
      { type: "postback", label: yesLabel, data: new URLSearchParams(yes).toString(), displayText: yesLabel },
      { type: "postback", label: "やめる", data: "a=menu", displayText: "やめる" },
    ],
  },
});

async function facilityName() {
  return (await db.setting.findUnique({ where: { id: 1 } }))?.facilityName ?? "スクール";
}

/** 会員とつながっていない友だちへの案内 */
async function linkPrompt() {
  return text(
    `会員情報とLINEがまだつながっていません。\n下のリンクから「LINEでログイン」すると、このトークで欠席連絡・振替予約ができるようになります。\n\n${appUrl()}/my/login\n\nご不明な点はこのままメッセージをお送りください。スタッフがお返事します。`,
    [],
  );
}

/** 1つの操作（postback の data、またはキーワード）に応答する */
export async function botAction(lineUserId: string, data: URLSearchParams): Promise<LineMsg[]> {
  const member = await db.member.findUnique({ where: { lineUserId } });
  if (!member) return [await linkPrompt()];
  if (member.status !== "ACTIVE") return [text("現在、休会・退会の扱いになっています。スクールにお問い合わせください。", [])];
  const a = data.get("a");

  if (a === "absent_menu") {
    const list = await absentableLessons(member.id, 12);
    if (!list.length) return [text("欠席連絡できるレッスンはありません（在籍クラスの予定がないか、連絡の期限を過ぎています）。")];
    return [text("お休みするレッスンを選んでください。", list.map((r) => pb(`${md(r.slot.startsAt)} ${fmtTime(r.slot.startsAt)}`, { a: "absent", r: r.id }, `${md(r.slot.startsAt)} ${fmtTime(r.slot.startsAt)} を欠席`)))];
  }
  if (a === "absent") {
    const r = await db.reservation.findFirst({ where: { id: data.get("r") ?? "", memberId: member.id, kind: "REGULAR", status: "RESERVED" }, include: { slot: true } });
    if (!r) return [text("この回は欠席連絡できません。")];
    return [confirm(`${md(r.slot.startsAt)} ${fmtTime(r.slot.startsAt)}〜\n${r.slot.title}\nを欠席しますか？`, { a: "absent_ok", r: r.id }, "欠席する")];
  }
  if (a === "absent_ok") {
    try {
      const { reservation: r, credit } = await memberReportAbsence(member.id, data.get("r") ?? "");
      await db.auditLog.create({ data: { action: "absence.line", target: r.id } });
      return [
        text(
          `欠席を受け付けました。\n${md(r.slot.startsAt)} ${fmtTime(r.slot.startsAt)}〜 ${r.slot.title}\n\n振替が1回分付きました${credit ? `（${jstDateKey(credit.expiresAt).replaceAll("-", "/")}まで）` : ""}。`,
          [pb("続けて振替を予約", { a: "makeup_menu" }), ...menuItems().slice(0, 1), ...menuItems().slice(2)],
        ),
      ];
    } catch (e) {
      if (e instanceof BookingError) return [text(e.message)];
      throw e;
    }
  }
  if (a === "makeup_menu") {
    const credits = await availableCredits(member.id);
    if (!credits.length) return [text("使える振替がありません。レッスンを欠席連絡すると、振替が1回分付きます。")];
    const credit = credits[0];
    const slots = (await makeupCandidates(member.id, credit)).slice(0, 12);
    const head = `使える振替：${credits.length}回（いちばん早い期限 ${jstDateKey(credit.expiresAt).replaceAll("-", "/")}）`;
    if (!slots.length) return [text(`${head}\n\nいま空きのある回はありません。空きが出ると、ここから選べるようになります。`)];
    return [
      text(
        `${head}\n\n振替する回を選んでください（残り席数）。\n一覧はマイページでも見られます：${appUrl()}/my/school/makeup`,
        slots.map((s) => pb(`${md(s.startsAt)}${fmtTime(s.startsAt)} ${s.title}`, { a: "makeup", c: credit.id, s: s.id }, `${md(s.startsAt)} ${fmtTime(s.startsAt)} ${s.title} に振替`)),
      ),
    ];
  }
  if (a === "makeup") {
    const s = await db.slot.findUnique({ where: { id: data.get("s") ?? "" }, include: { court: true } });
    if (!s) return [text("この回は見つかりません。")];
    return [confirm(`${md(s.startsAt)} ${fmtTime(s.startsAt)}〜\n${s.title}（${s.court.name}）\nに振替しますか？`, { a: "makeup_ok", c: data.get("c") ?? "", s: s.id }, "振替する")];
  }
  if (a === "makeup_ok") {
    try {
      const r = await bookMakeup(data.get("c") ?? "", data.get("s") ?? "", member.id);
      const s = await db.slot.findUniqueOrThrow({ where: { id: r.slotId }, include: { court: true } });
      await db.auditLog.create({ data: { action: "makeup.line_book", target: r.id } });
      return [text(`振替の予約が確定しました。\n${md(s.startsAt)} ${fmtTime(s.startsAt)}〜 ${s.title}\n${s.court.name}\n\n取り消すときはマイページからどうぞ（振替は戻ります）。\n${appUrl()}/my/school`)];
    } catch (e) {
      if (e instanceof BookingError) return [text(e.message, [pb("ほかの回を選ぶ", { a: "makeup_menu" }), ...menuItems()])];
      throw e;
    }
  }
  if (a === "schedule") {
    const now = new Date();
    const [lessons, credits] = await Promise.all([
      db.reservation.findMany({
        where: { memberId: member.id, status: "RESERVED", slot: { status: "OPEN", startsAt: { gt: now, lte: new Date(now.getTime() + 35 * 86400_000) } } },
        include: { slot: true },
        orderBy: { slot: { startsAt: "asc" } },
        take: 10,
      }),
      availableCredits(member.id),
    ]);
    const lines = lessons.map((r) => `・${md(r.slot.startsAt)} ${fmtTime(r.slot.startsAt)} ${r.slot.title}${r.kind === "MAKEUP" ? "（振替）" : ""}`);
    return [
      text(
        `${member.lastName}さんのこれからの予定\n${lines.length ? lines.join("\n") : "（5週間以内の予定はありません）"}\n\n使える振替：${credits.length}回${credits[0] ? `（${jstDateKey(credits[0].expiresAt).replaceAll("-", "/")}まで）` : ""}`,
      ),
    ];
  }
  // menu・その他
  return [text(`${await facilityName()}です。ご用件を選んでください。\nほかのご用件は、このままメッセージを送っていただければスタッフがお返事します。`)];
}

/** Webhook の1イベントを処理する */
export async function handleEvent(ev: Event) {
  const userId = ev.source?.type === "user" ? ev.source.userId : undefined;
  if (!userId) return;
  const reply = (msgs: LineMsg[]) => (ev.replyToken ? replyMessages(ev.replyToken, userId, msgs) : Promise.resolve(false));

  if (ev.type === "follow") {
    await recordLine(userId, { direction: "IN", type: "follow", text: "友だち追加", auto: true });
    await db.lineContact.update({ where: { lineUserId: userId }, data: { followed: true } });
    const member = await db.member.findUnique({ where: { lineUserId: userId } });
    await reply(member ? [text(`友だち追加ありがとうございます。\n欠席連絡・振替予約は下のボタンからできます。`)] : [await linkPrompt()]);
    return;
  }
  if (ev.type === "unfollow") {
    await recordLine(userId, { direction: "IN", type: "unfollow", text: "ブロック・友だち解除", auto: true });
    await db.lineContact.update({ where: { lineUserId: userId }, data: { followed: false } });
    return;
  }
  if (ev.type === "postback" && ev.postback) {
    const data = new URLSearchParams(ev.postback.data);
    await recordLine(userId, { direction: "IN", type: "postback", text: `［ボタン］${describe(data)}`, auto: true });
    await reply(await botAction(userId, data));
    return;
  }
  if (ev.type === "message" && ev.message) {
    const m = ev.message;
    if (m.type === "text") {
      const t = (m.text ?? "").trim();
      const key = KEYWORDS[t.replace(/\s/g, "")];
      if (key) {
        await recordLine(userId, { direction: "IN", type: "text", text: t, auto: true, lineMessageId: m.id });
        await reply(await botAction(userId, new URLSearchParams({ a: key })));
        return;
      }
      // 自由文：スタッフの対応が必要。欠席・振替の話題ならボタンも案内する
      await recordLine(userId, { direction: "IN", type: "text", text: t, needsReply: true, lineMessageId: m.id });
      if (/欠席|休み|休ませ|振替|振り替え|ふりかえ/.test(t)) {
        const member = await db.member.findUnique({ where: { lineUserId: userId } });
        if (member) await reply([text("メッセージを受け付けました。スタッフが確認してお返事します。\n欠席連絡・振替予約は、下のボタンからすぐに手続きできます。")]);
      }
      return;
    }
    const kind = { image: "[画像]", video: "[動画]", audio: "[音声]", file: `[ファイル] ${m.fileName ?? ""}`, sticker: "[スタンプ]", location: "[位置情報]" }[m.type] ?? `[${m.type}]`;
    await recordLine(userId, { direction: "IN", type: m.type, text: kind, needsReply: m.type !== "sticker", lineMessageId: m.id });
  }
}

function describe(d: URLSearchParams) {
  return { absent_menu: "欠席連絡", absent: "欠席する回を選択", absent_ok: "欠席を確定", makeup_menu: "振替予約", makeup: "振替先を選択", makeup_ok: "振替を確定", schedule: "予定確認", menu: "メニュー" }[d.get("a") ?? ""] ?? "操作";
}
