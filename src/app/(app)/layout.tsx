import Sidebar from "@/components/layout/Sidebar";
import TopNav from "@/components/layout/TopNav";
import PageTransition from "@/components/layout/PageTransition";
import RouteGuard from "@/components/layout/RouteGuard";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex flex-1 flex-col md:pl-sidebar">
        <TopNav />
        <main className="flex-1 pt-[calc(5rem+env(safe-area-inset-top))] px-2 pb-[env(safe-area-inset-bottom)] md:pr-4 min-w-0">
          <RouteGuard>
            <PageTransition>{children}</PageTransition>
          </RouteGuard>
        </main>
      </div>
    </div>
  );
}
