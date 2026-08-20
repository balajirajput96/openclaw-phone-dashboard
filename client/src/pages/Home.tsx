import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Streamdown } from "streamdown";
import {
  Bot,
  Check,
  ChevronDown,
  CirclePlus,
  Command,
  Copy,
  Loader2,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
};

type StreamEvent =
  | { type: "status"; value: string }
  | { type: "delta"; value: string }
  | { type: "done"; message: DisplayMessage }
  | { type: "error"; value: string };

const prompts = [
  "Plan my next project",
  "Explain a technical concept",
  "Draft a thoughtful message",
];

function initials(name?: string | null) {
  return name?.trim().slice(0, 1).toUpperCase() || "O";
}

function formatTime(date?: Date | string | null) {
  if (!date) return "Now";
  return new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function readSseChunk(buffer: string) {
  const events = buffer.split("\n\n");
  return { events: events.slice(0, -1), remainder: events.at(-1) ?? "" };
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const utils = trpc.useUtils();
  const modelsQuery = trpc.chat.models.useQuery(undefined, { enabled: isAuthenticated });
  const sessionsQuery = trpc.chat.sessions.useQuery(undefined, { enabled: isAuthenticated });
  const createSession = trpc.chat.createSession.useMutation();
  const clearSession = trpc.chat.clearSession.useMutation();

  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    () => localStorage.getItem("openclaw-active-session")
  );
  const [selectedModel, setSelectedModel] = useState("gpt-5-mini");
  const [composer, setComposer] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamState, setStreamState] = useState<"idle" | "thinking" | "writing">("idle");
  const [draftMessages, setDraftMessages] = useState<DisplayMessage[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const creatingRef = useRef(false);

  const activeSessionQuery = trpc.chat.session.useQuery(
    { sessionId: activeSessionId ?? "" },
    { enabled: Boolean(activeSessionId && isAuthenticated), retry: false }
  );

  const storedMessages = useMemo<DisplayMessage[]>(
    () =>
      (activeSessionQuery.data?.messages ?? []).map(message => ({
        id: message.id,
        role: message.role,
        content: message.content,
      })),
    [activeSessionQuery.data]
  );
  const messages = draftMessages.length ? draftMessages : storedMessages;
  const modelOptions = modelsQuery.data?.length ? modelsQuery.data : [{ id: "gpt-5-mini", owner: "default" }];
  const activeSession = activeSessionQuery.data?.session;

  const createFreshSession = async (model = selectedModel) => {
    const session = await createSession.mutateAsync({ model });
    setActiveSessionId(session.id);
    localStorage.setItem("openclaw-active-session", session.id);
    setSelectedModel(session.model);
    setDraftMessages([]);
    setShowSessions(false);
    await utils.chat.sessions.invalidate();
    return session;
  };

  useEffect(() => {
    if (!isAuthenticated || sessionsQuery.isLoading || creatingRef.current) return;
    const sessions = sessionsQuery.data ?? [];
    const stored = localStorage.getItem("openclaw-active-session");
    const validStored = stored && sessions.some(session => session.id === stored);
    if (validStored) {
      setActiveSessionId(stored);
      return;
    }
    if (sessions[0]) {
      setActiveSessionId(sessions[0].id);
      localStorage.setItem("openclaw-active-session", sessions[0].id);
      return;
    }
    creatingRef.current = true;
    createFreshSession().finally(() => {
      creatingRef.current = false;
    });
  }, [isAuthenticated, sessionsQuery.isLoading, sessionsQuery.data]);

  useEffect(() => {
    if (activeSession?.model) setSelectedModel(activeSession.model);
  }, [activeSession?.model]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: isStreaming ? "auto" : "smooth", block: "end" });
  }, [messages, isStreaming, streamState]);

  const chooseSession = (id: string) => {
    setActiveSessionId(id);
    localStorage.setItem("openclaw-active-session", id);
    setDraftMessages([]);
    setShowSessions(false);
  };

  const parseEvent = (raw: string): StreamEvent | null => {
    const data = raw
      .split("\n")
      .find(line => line.startsWith("data: "))
      ?.slice(6);
    if (!data) return null;
    try {
      return JSON.parse(data) as StreamEvent;
    } catch {
      return null;
    }
  };

  const sendMessage = async (raw: string) => {
    const content = raw.trim();
    if (!content || isStreaming) return;
    let sessionId = activeSessionId;
    if (!sessionId) {
      const session = await createFreshSession();
      sessionId = session.id;
    }

    const optimisticUser: DisplayMessage = { id: `optimistic-user-${Date.now()}`, role: "user", content };
    const optimisticAssistant: DisplayMessage = { id: `optimistic-assistant-${Date.now()}`, role: "assistant", content: "", pending: true };
    setDraftMessages([...storedMessages, optimisticUser, optimisticAssistant]);
    setComposer("");
    setIsStreaming(true);
    setStreamState("thinking");

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, content, model: selectedModel }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({ error: "Unable to start the response." }));
        throw new Error(payload.error || "Unable to start the response.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = readSseChunk(buffer);
        buffer = parsed.remainder;

        for (const rawEvent of parsed.events) {
          const event = parseEvent(rawEvent);
          if (!event) continue;
          if (event.type === "status") setStreamState("thinking");
          if (event.type === "delta") {
            assistantText += event.value;
            setStreamState("writing");
            setDraftMessages(previous =>
              previous.map(message =>
                message.id === optimisticAssistant.id
                  ? { ...message, content: assistantText, pending: false }
                  : message
              )
            );
          }
          if (event.type === "error") throw new Error(event.value);
        }
      }

      await Promise.all([
        utils.chat.session.invalidate({ sessionId }),
        utils.chat.sessions.invalidate(),
      ]);
      setDraftMessages([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to complete that response.";
      toast.error(message);
      setDraftMessages(previous =>
        previous.map(item =>
          item.id === optimisticAssistant.id
            ? { ...item, content: `**Response unavailable.** ${message}`, pending: false }
            : item
        )
      );
    } finally {
      setIsStreaming(false);
      setStreamState("idle");
      textareaRef.current?.focus();
    }
  };

  const handleClear = async () => {
    if (!activeSessionId || isStreaming) return;
    await clearSession.mutateAsync({ sessionId: activeSessionId });
    setDraftMessages([]);
    await Promise.all([
      utils.chat.session.invalidate({ sessionId: activeSessionId }),
      utils.chat.sessions.invalidate(),
    ]);
    toast.success("Conversation cleared");
  };

  if (loading) {
    return <div className="min-h-dvh bg-[#080b12] grid place-items-center"><Loader2 className="size-5 animate-spin text-indigo-300" /></div>;
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-dvh overflow-hidden bg-[#080b12] text-white grid place-items-center p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(78,105,255,.2),transparent_35%),radial-gradient(circle_at_0%_100%,rgba(107,59,255,.14),transparent_35%)]" />
        <section className="relative w-full max-w-sm rounded-[2rem] border border-white/10 bg-white/[.045] p-7 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="mb-8 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-500 shadow-lg shadow-indigo-500/20"><Bot className="size-6" /></div>
          <p className="font-mono text-[10px] uppercase tracking-[.22em] text-indigo-200/70">Private workspace</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">OpenClaw,<br />made personal.</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">A private, persistent AI workspace designed for one owner and one focused conversation at a time.</p>
          <button onClick={startLogin} className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-sm font-bold text-slate-900 transition active:scale-[.98] hover:bg-indigo-50">
            <ShieldCheck className="size-4" /> Sign in securely
          </button>
        </section>
      </main>
    );
  }

  if (sessionsQuery.error?.data?.code === "FORBIDDEN") {
    return (
      <main className="min-h-dvh grid place-items-center bg-[#080b12] p-5 text-center text-white">
        <section className="max-w-sm rounded-[2rem] border border-red-300/15 bg-red-300/[.04] p-7">
          <ShieldCheck className="mx-auto size-9 text-red-300" />
          <h1 className="mt-4 text-xl font-bold">Owner access only</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">This private workspace is restricted to its configured owner account.</p>
          <button onClick={logout} className="mt-6 text-sm font-semibold text-indigo-200 underline underline-offset-4">Sign out</button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#080b12] text-slate-100 selection:bg-indigo-400/30">
      <div className="mx-auto flex min-h-dvh max-w-5xl overflow-hidden lg:border-x lg:border-white/[.07]">
        <aside className={`fixed inset-y-0 left-0 z-40 w-[278px] border-r border-white/[.08] bg-[#0b0f18]/95 p-4 backdrop-blur-xl transition-transform duration-200 lg:static lg:translate-x-0 ${showSessions ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 shadow-lg shadow-indigo-500/20"><Bot className="size-4" /></div>
              <div><p className="font-semibold tracking-tight">OpenClaw</p><p className="font-mono text-[9px] uppercase tracking-[.16em] text-indigo-200/60">Owner workspace</p></div>
              <button onClick={() => setShowSessions(false)} className="ml-auto grid size-8 place-items-center rounded-lg text-slate-400 lg:hidden"><X className="size-4" /></button>
            </div>
            <button onClick={() => createFreshSession()} disabled={createSession.isPending} className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-bold text-slate-950 transition active:scale-[.98] hover:bg-indigo-50 disabled:opacity-60"><Plus className="size-4" /> New chat</button>
            <div className="mt-7 flex-1 overflow-y-auto chat-scrollbar">
              <p className="px-2 pb-2 font-mono text-[9px] uppercase tracking-[.18em] text-slate-500">Conversations</p>
              <div className="space-y-1">
                {(sessionsQuery.data ?? []).map(session => (
                  <button key={session.id} onClick={() => chooseSession(session.id)} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${session.id === activeSessionId ? "bg-indigo-400/[.12] text-white" : "text-slate-400 hover:bg-white/[.045] hover:text-slate-200"}`}>
                    <Command className={`size-4 shrink-0 ${session.id === activeSessionId ? "text-indigo-300" : "text-slate-600"}`} />
                    <span className="min-w-0 flex-1 truncate text-sm">{session.title}</span>
                    {session.id === activeSessionId && <Check className="size-3.5 text-indigo-300" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-white/[.07] pt-4">
              <div className="flex items-center gap-3 px-2 py-2"><div className="grid size-8 place-items-center rounded-full bg-white/[.08] text-xs font-bold">{initials(user?.name)}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{user?.name || "Owner"}</p><p className="truncate text-[10px] text-slate-500">Private access</p></div><button onClick={logout} className="text-slate-500 hover:text-white" aria-label="Sign out"><LogOut className="size-4" /></button></div>
            </div>
          </div>
        </aside>

        {showSessions && <button onClick={() => setShowSessions(false)} className="fixed inset-0 z-30 bg-black/55 lg:hidden" aria-label="Close menu" />}

        <section className="relative flex min-h-dvh min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-white/[.07] bg-[#080b12]/75 px-4 backdrop-blur-xl sm:px-6">
            <div className="flex min-w-0 items-center gap-3"><button onClick={() => setShowSessions(true)} className="grid size-10 place-items-center rounded-xl text-slate-400 hover:bg-white/[.06] lg:hidden" aria-label="Open conversations"><Menu className="size-5" /></button><div className="min-w-0"><p className="truncate text-sm font-bold">{activeSession?.title || "New conversation"}</p><div className="mt-1 flex items-center gap-1.5 text-[10px] text-emerald-300/80"><span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,.85)]" /> Secure session</div></div></div>
            <div className="flex items-center gap-1.5"><button onClick={handleClear} disabled={!activeSessionId || isStreaming} className="hidden items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition hover:bg-white/[.06] hover:text-white disabled:opacity-40 sm:flex"><Trash2 className="size-3.5" /> Clear</button><button onClick={handleClear} disabled={!activeSessionId || isStreaming} className="grid size-10 place-items-center rounded-xl text-slate-400 hover:bg-white/[.06] sm:hidden" aria-label="Clear conversation"><Trash2 className="size-4" /></button><button className="grid size-10 place-items-center rounded-xl text-slate-400 hover:bg-white/[.06]" aria-label="More options"><MoreHorizontal className="size-5" /></button></div>
          </header>

          <div className="flex-1 overflow-y-auto chat-scrollbar">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-40 pt-7 sm:px-8">
              {!messages.length && !isStreaming ? (
                <div className="m-auto w-full max-w-xl animate-in fade-in duration-500">
                  <div className="mx-auto grid size-14 place-items-center rounded-[1.25rem] border border-indigo-300/15 bg-indigo-400/[.08] shadow-[0_0_50px_rgba(99,102,241,.16)]"><Sparkles className="size-5 text-indigo-200" /></div>
                  <h1 className="mt-6 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">What will we build?</h1>
                  <p className="mx-auto mt-3 max-w-md text-center text-sm leading-6 text-slate-400">Your private AI workspace is ready. Ask anything, explore ideas, or start with a focused prompt.</p>
                  <div className="mx-auto mt-8 grid max-w-lg gap-2 sm:grid-cols-3">{prompts.map(prompt => <button key={prompt} onClick={() => sendMessage(prompt)} className="rounded-2xl border border-white/[.08] bg-white/[.035] px-3 py-3 text-left text-xs font-medium text-slate-300 transition hover:border-indigo-300/25 hover:bg-indigo-300/[.07] hover:text-white">{prompt}</button>)}</div>
                </div>
              ) : (
                <div className="space-y-7">
                  {messages.map((message, index) => (
                    <article key={message.id} className={`flex gap-3.5 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      {message.role === "assistant" && <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-400/90 to-violet-500/90 shadow-md shadow-indigo-900/30"><Bot className="size-4" /></div>}
                      <div className={`min-w-0 ${message.role === "user" ? "max-w-[82%] sm:max-w-[70%]" : "max-w-[90%] sm:max-w-[82%]"}`}>
                        <div className={`rounded-2xl px-4 py-3 text-[14px] leading-6 ${message.role === "user" ? "rounded-tr-md bg-indigo-500 text-white shadow-lg shadow-indigo-950/25" : "rounded-tl-md border border-white/[.065] bg-white/[.045] text-slate-200"}`}>
                          {message.role === "assistant" ? (
                            message.pending && !message.content ? <TypingIndicator label={streamState === "thinking" ? "Thinking" : "Writing"} /> : <div className="markdown-response"><Streamdown>{message.content}</Streamdown>{message.pending && <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-indigo-200 align-middle" />}</div>
                          ) : <p className="whitespace-pre-wrap">{message.content}</p>}
                        </div>
                        <p className={`mt-1.5 px-1 font-mono text-[9px] uppercase tracking-[.12em] text-slate-600 ${message.role === "user" ? "text-right" : ""}`}>{message.role === "assistant" ? "OpenClaw" : "You"} · {index === messages.length - 1 ? "Now" : formatTime()}</p>
                      </div>
                      {message.role === "user" && <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-white/[.08] text-slate-300"><UserRound className="size-4" /></div>}
                    </article>
                  ))}
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#080b12] via-[#080b12]/95 to-transparent px-3 pb-[calc(env(safe-area-inset-bottom)+.75rem)] pt-10 lg:left-[calc((100vw-min(100vw,80rem))/2+278px)] lg:right-[calc((100vw-min(100vw,80rem))/2)]">
            <div className="pointer-events-auto mx-auto max-w-3xl">
              <div className="mb-2 flex items-center justify-between px-2"><div className="relative"><select value={selectedModel} onChange={event => setSelectedModel(event.target.value)} disabled={isStreaming} className="max-w-[13.5rem] appearance-none truncate rounded-lg border border-white/[.08] bg-white/[.045] py-1.5 pl-2.5 pr-7 font-mono text-[10px] text-indigo-100 outline-none transition hover:bg-white/[.08] disabled:opacity-60">{modelOptions.map(model => <option key={model.id} value={model.id} className="bg-[#111827]">{model.id}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-slate-400" /></div><p className="hidden font-mono text-[9px] uppercase tracking-[.12em] text-slate-600 sm:block">{isStreaming ? streamState === "thinking" ? "Model is thinking" : "Streaming response" : "Private & persistent"}</p></div>
              <div className="flex items-end gap-2 rounded-[1.45rem] border border-white/[.11] bg-[#101520]/95 p-2 shadow-2xl shadow-black/30 backdrop-blur-xl focus-within:border-indigo-300/35 focus-within:shadow-indigo-950/30">
                <textarea ref={textareaRef} value={composer} onChange={event => setComposer(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(composer); } }} placeholder="Message OpenClaw…" rows={1} className="max-h-32 min-h-[43px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-5 text-white outline-none placeholder:text-slate-500" />
                <button onClick={() => sendMessage(composer)} disabled={!composer.trim() || isStreaming} className="grid size-11 shrink-0 place-items-center rounded-[1rem] bg-indigo-400 text-slate-950 transition hover:bg-indigo-300 active:scale-[.96] disabled:cursor-not-allowed disabled:bg-white/[.08] disabled:text-slate-600" aria-label="Send message">{isStreaming ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}</button>
              </div>
              <p className="mt-2 text-center font-mono text-[9px] text-slate-600">Responses can make mistakes. Verify important details.</p>
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}

function TypingIndicator({ label }: { label: string }) {
  return <span className="flex items-center gap-2 text-xs font-medium text-slate-400"><span className="flex gap-1"><i className="size-1.5 animate-bounce rounded-full bg-indigo-300 [animation-delay:-.22s]" /><i className="size-1.5 animate-bounce rounded-full bg-indigo-300 [animation-delay:-.11s]" /><i className="size-1.5 animate-bounce rounded-full bg-indigo-300" /></span>{label}</span>;
}
