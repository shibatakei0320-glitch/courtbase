/*
 * どのシステムとして動くか
 *
 * このコードは 2つの別々のシステムとしてデプロイされる（データベースも Vercel のプロジェクトも別）：
 *   - 48Kテニススクール（Vercel プロジェクト 48k-tennis）… スクール専用：クラス・在籍・出欠・振替・月謝など
 *   - pickleland（Vercel プロジェクト pickleland）… コート施設・大会イベント
 *
 * 決め方（上が優先）
 *   1. 環境変数 NEXT_PUBLIC_SPORT=tennis（NEXT_PUBLIC_SCHOOL=1/0 で個別に切り替えも可）
 *   2. Vercel が自動で入れる URL（VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL）に「48k」「tennis」が含まれる
 *      → 本番・プレビューのどちらでも、48k-tennis プロジェクトならテニススクールになる
 * サーバー側でだけ使う（クライアントのコンポーネントからは読まない）
 */
const vercelHost = `${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? ""} ${process.env.VERCEL_URL ?? ""} ${process.env.VERCEL_BRANCH_URL ?? ""}`;
const tennisByHost = /48k|tennis/i.test(vercelHost);

export const SPORT = process.env.NEXT_PUBLIC_SPORT || (tennisByHost ? "tennis" : "");
export const TENNIS = SPORT === "tennis";

/** システムの名前（Vercel の環境変数 NEXT_PUBLIC_BRAND_NAME で上書き） */
export const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || (TENNIS ? "48Kテニススクール" : "pickleland");
export const BRAND_MARK = BRAND.slice(0, BRAND.match(/^\d+[A-Za-z]?/)?.[0].length || 1).toUpperCase();

/** スクール機能（クラス・在籍・出欠・振替・月謝・ジュニア・ガット張替・協会大会）を使うか */
export const SCHOOL = process.env.NEXT_PUBLIC_SCHOOL ? process.env.NEXT_PUBLIC_SCHOOL === "1" : TENNIS;
