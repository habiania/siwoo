import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  const message = String(error?.message ?? "");
  const isAuthError =
    /unauthor|401|no authorization|jwt|forbidden|403/i.test(message);

  if (isAuthError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            로그인이 필요합니다
          </h1>
          <p className="text-sm text-muted-foreground">
            세션이 만료되었거나 인증 정보가 전달되지 않았습니다.
            다시 로그인한 후 시도해주세요.
          </p>
          <p className="text-xs text-muted-foreground">
            (원인: {message || "Unauthorized"})
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/auth";
              }}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              로그인 페이지로 이동
            </button>
            <button
              onClick={() => {
                router.invalidate();
                reset();
              }}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              다시 시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "위탁자동화" },
      { name: "description", content: "AI Commerce Agent automates dropshipping operations, from trend analysis to inventory management." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "위탁자동화" },
      { property: "og:description", content: "AI Commerce Agent automates dropshipping operations, from trend analysis to inventory management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "위탁자동화" },
      { name: "twitter:description", content: "AI Commerce Agent automates dropshipping operations, from trend analysis to inventory management." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b04db060-6757-4e4b-945f-abea9f2d1c0d/id-preview-55204da0--acffd17a-b227-4e00-abf5-6bc4d4b99855.lovable.app-1781870778911.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b04db060-6757-4e4b-945f-abea9f2d1c0d/id-preview-55204da0--acffd17a-b227-4e00-abf5-6bc4d4b99855.lovable.app-1781870778911.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublicShell = pathname === "/auth";

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  const [unlocked, setUnlocked] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user && localStorage.getItem("site_unlocked") === "1") {
        setUnlocked(true);
      }
    })();
  }, []);

  const SHARED_EMAIL = "shared-251108@local.app";
  const SHARED_PASSWORD = "shared-251108-secret-key";

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== "251108") { setErr(true); return; }
    setLoading(true);
    try {
      let res = await supabase.auth.signInWithPassword({
        email: SHARED_EMAIL, password: SHARED_PASSWORD,
      });
      if (res.error) {
        const signup = await supabase.auth.signUp({
          email: SHARED_EMAIL, password: SHARED_PASSWORD,
          options: { emailRedirectTo: window.location.origin },
        });
        if (signup.error) throw signup.error;
        if (!signup.data.session) {
          res = await supabase.auth.signInWithPassword({
            email: SHARED_EMAIL, password: SHARED_PASSWORD,
          });
          if (res.error) throw res.error;
        }
      }
      localStorage.setItem("site_unlocked", "1");
      setUnlocked(true);
    } catch (e: unknown) {
      console.error(e);
      setErr(true);
    } finally {
      setLoading(false);
    }
  }

  if (!unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <form
          onSubmit={handleUnlock}
          className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
        >
          <h1 className="text-lg font-semibold text-foreground">비밀번호를 입력하세요</h1>
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => { setPw(e.target.value); setErr(false); }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            placeholder="비밀번호"
          />
          {err && <p className="text-xs text-destructive">접속에 실패했습니다. 비밀번호를 확인해주세요.</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {loading ? "접속 중..." : "접속"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      {isPublicShell ? (
        <>
          <Outlet />
          <Toaster richColors position="top-right" />
        </>
      ) : (
        <SidebarProvider>
          <div className="flex min-h-screen w-full bg-background">
            <AppSidebar />
            <div className="flex flex-1 flex-col min-w-0">
              <header className="flex h-14 items-center gap-3 border-b border-border bg-card/60 px-4 backdrop-blur sticky top-0 z-40">
                <SidebarTrigger />
                <div className="text-sm font-semibold text-foreground">AI Commerce Agent</div>
                <div className="ml-auto text-xs text-muted-foreground hidden md:block">
                  위탁판매 자동화 시스템
                </div>
              </header>
              <main className="flex-1 p-4 md:p-6">
                <Outlet />
              </main>
            </div>
          </div>
          <Toaster richColors position="top-right" />
        </SidebarProvider>
      )}
    </QueryClientProvider>
  );
}
