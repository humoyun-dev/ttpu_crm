export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      {children}
    </div>
  );
}
