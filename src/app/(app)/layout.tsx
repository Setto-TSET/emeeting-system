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
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col md:pl-[280px]">
        <TopNav />
        <main className="flex-1 pt-20 px-2 md:pr-4">
          <RouteGuard>
            <PageTransition>{children}</PageTransition>
          </RouteGuard>
        </main>
      </div>
    </div>
  );
}
