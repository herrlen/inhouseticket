export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border bg-surface p-8">
        <p className="mb-6 text-[15px] font-semibold">
          inhouse<span className="text-accent">ticket</span>
        </p>
        {children}
      </div>
    </main>
  );
}
