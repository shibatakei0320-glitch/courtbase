import nodemailer from "nodemailer";

export async function sendMail(to: string, subject: string, text: string) {
  const url = process.env.SMTP_URL;
  if (!url) {
    console.log(`\n[mail] (SMTP_URL未設定のためコンソール出力)\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  const transport = nodemailer.createTransport(url);
  await transport.sendMail({ from: process.env.MAIL_FROM ?? "no-reply@example.com", to, subject, text });
}
