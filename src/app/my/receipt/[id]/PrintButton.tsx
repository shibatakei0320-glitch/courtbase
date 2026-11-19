"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="w-full rounded-xl bg-[#0F3D2E] py-4 text-sm font-bold text-white transition hover:bg-[#0B2F23]">
      印刷・PDFで保存
    </button>
  );
}
