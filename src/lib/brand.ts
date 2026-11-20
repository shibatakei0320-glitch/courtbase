/** システムごとの名前（Vercel の環境変数 NEXT_PUBLIC_BRAND_NAME で上書き） */
export const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || "pickleland";
export const BRAND_MARK = BRAND.slice(0, BRAND.match(/^\d+[A-Za-z]?/)?.[0].length || 1).toUpperCase();

/**
 * スクール機能（定期クラス・在籍・欠席連絡・振替・月謝・ジュニア）を使うシステムか。
 * テニススクール（NEXT_PUBLIC_SPORT=tennis）で有効。NEXT_PUBLIC_SCHOOL=1/0 で個別に切り替えられる
 */
export const SCHOOL = process.env.NEXT_PUBLIC_SCHOOL ? process.env.NEXT_PUBLIC_SCHOOL === "1" : process.env.NEXT_PUBLIC_SPORT === "tennis";
