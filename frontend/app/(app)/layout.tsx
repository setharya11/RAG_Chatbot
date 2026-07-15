import { AppShell } from "@/components/AppShell";
import { Suspense } from "react";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="loading-screen"><p>Loading...</p></div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
