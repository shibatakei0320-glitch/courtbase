"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="w-full rounded-xl bg-[#0B6B4F] py-4 text-sm font-bold text-white transition hover:bg-[#08553F]">
      印刷・PDFで保存
    </button>
  );
}
