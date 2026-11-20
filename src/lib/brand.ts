/** システムごとの名前（Vercel の環境変数 NEXT_PUBLIC_BRAND_NAME で上書き） */
export const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || "pickleland";
export const BRAND_MARK = BRAND.slice(0, BRAND.match(/^\d+[A-Za-z]?/)?.[0].length || 1).toUpperCase();
