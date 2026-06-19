export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — TTPU branding */}
      <div
        className="hidden lg:flex lg:w-5/12 xl:w-2/5 flex-col items-center justify-center p-12"
        style={{ backgroundColor: "oklch(0.19 0.13 264)" }}
      >
        <div className="max-w-xs text-center">
          <div
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black"
            style={{
              backgroundColor: "oklch(0.42 0.20 263)",
              color: "white",
            }}
          >
            T
          </div>
          <h1 className="text-3xl font-black tracking-tight" style={{ color: "white" }}>
            TTPU
          </h1>
          <p
            className="mt-1 text-base font-semibold"
            style={{ color: "oklch(0.75 0.12 263)" }}
          >
            Bandlik Markazi
          </p>
          <p
            className="mt-6 text-sm leading-relaxed"
            style={{ color: "rgba(255,255,255,0.50)" }}
          >
            Turin Politexnika Universiteti Toshkentda — kasbiy yo&apos;nalish va bandlik tizimi
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center p-8 bg-background">
        {children}
      </div>
    </div>
  );
}
