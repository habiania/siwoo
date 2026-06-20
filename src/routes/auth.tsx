import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bot, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "로그인 | AI Commerce Agent" },
      { name: "description", content: "관리자 계정으로 로그인하세요" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("계정이 생성되었습니다", { description: "최초 사용자는 자동으로 관리자 권한을 받습니다." });
        // 자동 확인이 켜져 있으면 즉시 로그인 가능
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (!signInErr) navigate({ to: "/", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/", replace: true });
      }
    } catch (err) {
      toast.error(mode === "signup" ? "가입 실패" : "로그인 실패", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md rounded-2xl">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Bot className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">AI Commerce Agent</CardTitle>
          <CardDescription>
            {mode === "signin" ? "관리자 계정으로 로그인" : "관리자 계정 생성 (최초 1회)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl h-11"
              />
              <p className="text-[11px] text-muted-foreground">최소 8자, 유출 이력이 있는 비밀번호는 차단됩니다.</p>
            </div>
            <Button type="submit" size="lg" className="w-full rounded-xl h-12" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "signin" ? "로그인" : "관리자 계정 생성"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-sm"
              onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
            >
              {mode === "signin"
                ? "처음 사용하시나요? 관리자 계정 만들기"
                : "이미 계정이 있어요 — 로그인"}
            </Button>
          </form>
          <p className="text-[11px] text-muted-foreground text-center mt-4">
            가장 먼저 가입한 계정만 관리자가 됩니다. 이후 가입자는 권한이 없습니다.
          </p>
          <div className="text-center mt-3">
            <Link to="/" className="text-xs text-muted-foreground hover:underline">홈으로</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}