import {
  Bell,
  Clock,
  BookOpen,
  ChartBar,
  Home,
  Layers,
  LogOut,
  Pause,
  Pencil,
  PieChart,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Settings,
  SkipForward,
  Trash2,
  Trophy,
  X
} from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState
} from "react";

import type { Session, User } from "@supabase/supabase-js";
import { GiPanda } from "react-icons/gi";
import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Progress } from "./components/ui/progress";
import { Separator } from "./components/ui/separator";
import { cn } from "./lib/utils";
import { Toast } from "./components/ui/toast";
import { supabase, isSupabaseConfigured } from "./lib/supabaseClient";

type ExamScore = {
  paper: string;
  total: number;
  mcq: number;
  essay: number;
};

type ExamEntry = {
  id: string;
  paper: string;
  mcq: number;
  essay: number;
  total: number;
  completion: number;
};

type ExamFormState = {
  paper: string;
  mcq: string;
  essay: string;
  completion: string;
};

type ExamPayload = Omit<ExamEntry, "id">;

type Subject = {
  id: string;
  name: string;
  exams: ExamEntry[];
};

type FocusEntry = {
  id: string;
  timestamp: string;
  duration: number;
};

type SupabaseExamRow = {
  id: string;
  paper: string;
  mcq: number | null;
  essay: number | null;
  total: number | null;
  completion: number | null;
};

type SupabaseSubjectRow = {
  id: string;
  name: string;
  exams: SupabaseExamRow[] | null;
};

type SupabaseFocusEntryRow = {
  id: string;
  duration: number | null;
  started_at: string | null;
};

type ProductivityState = {
  focusEntries: FocusEntry[];
};

type ConfirmDialogConfig = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void | Promise<void>;
};

type AppState = {
  subjects: Subject[];
  activeSubjectId: string;
  productivity: ProductivityState;
};

const FOCUS_DURATION = 25 * 60;
const BREAK_DURATION = 5 * 60;
const HISTORY_LIMIT_DAYS = 120;
const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

function getStartOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const minutesPerDay = 24 * 60;
  const days = Math.floor(totalMinutes / minutesPerDay);
  const hours = Math.floor((totalMinutes % minutesPerDay) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

const sidebarItems = [
  { icon: Home, label: "Overview", gradient: "from-sky-400 to-blue-600" },
  { icon: BookOpen, label: "Papers", gradient: "from-emerald-400 to-emerald-500" },
  { icon: Clock, label: "Alerts", gradient: "from-amber-400 to-orange-500" },
  { icon: ChartBar, label: "Analytics", gradient: "from-fuchsia-400 to-purple-500" },
  { icon: Layers, label: "Resources", gradient: "from-indigo-400 to-indigo-600" },
  { icon: Settings, label: "Settings", gradient: "from-rose-400 to-rose-600" }
];

function getCompletionGradient(value: number): string {
  if (value >= 85) {
    return "from-emerald-400 via-emerald-500 to-emerald-600";
  }
  if (value >= 60) {
    return "from-orange-400 via-orange-500 to-orange-600";
  }
  return "from-rose-400 via-rose-500 to-rose-600";
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

const createEmptyForm = (): ExamFormState => ({
  paper: "",
  mcq: "",
  essay: "",
  completion: ""
});

function prepareExamPayload(form: ExamFormState): ExamPayload | null {
  const paper = form.paper.trim();
  if (!paper) {
    return null;
  }

  const mcqValue = Number(form.mcq);
  const essayValue = Number(form.essay);
  const completionValue = Number(form.completion);

  const mcq = Number.isFinite(mcqValue) ? Math.max(0, mcqValue) : 0;
  const essay = Number.isFinite(essayValue) ? Math.max(0, essayValue) : 0;
  const total = Math.max(0, mcq + essay);
  const completion = Number.isFinite(completionValue)
    ? Math.min(100, Math.max(0, completionValue))
    : 0;

  return {
    paper,
    mcq,
    essay,
    total,
    completion
  };
}

function examToForm(exam: ExamEntry): ExamFormState {
  return {
    paper: exam.paper,
    mcq: exam.mcq.toString(),
    essay: exam.essay.toString(),
    completion: exam.completion.toString()
  };
}

function LineChart({ data }: { data: ExamScore[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 text-sm text-slate-500">
        Add your first paper to visualize the trend.
      </div>
    );
  }

  const gradientId = useId();
  const height = 240;
  const width = Math.max(480, data.length * 160);
  const maxValue = Math.max(...data.map((item) => Math.max(item.total, item.mcq, item.essay)), 20);
  const paddingX = 32;
  const paddingY = 24;

  // Convert exam scores into an SVG path string for the requested metric.
  const getPath = (key: keyof ExamScore) => {
    return data
      .map((point, index) => {
        const x = paddingX + (index / Math.max(1, data.length - 1)) * (width - paddingX * 2);
        const value = point[key] as number;
        const y = height - paddingY - (value / maxValue) * (height - paddingY * 2);
        return `${index === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
  };

  // Close the "total" path so the area beneath can be filled with a gradient.
  const totalPath = `${getPath("total")} L${width - paddingX},${height - paddingY} L${paddingX},${height - paddingY} Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full">
        <defs>
          <linearGradient id={`${gradientId}-area`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4C6ED7" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#4C6ED7" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = paddingY + (height - paddingY * 2) * fraction;
          const value = Math.round((1 - fraction) * maxValue);
          return (
            <g key={fraction}>
              <line
                x1={paddingX}
                x2={width - paddingX}
                y1={y}
                y2={y}
                stroke="rgba(148, 163, 184, 0.25)"
                strokeDasharray="6 6"
              />
              <text
                x={paddingX - 12}
                y={y + 4}
                fontSize={10}
                textAnchor="end"
                fill="rgba(100,116,139,0.7)"
              >
                {value}
              </text>
            </g>
          );
        })}

        <path d={totalPath} fill={`url(#${gradientId}-area)`} stroke="none" />
        <path d={getPath("total")} fill="none" stroke="#4C6ED7" strokeWidth={3} strokeLinecap="round" />
        <path d={getPath("mcq")} fill="none" stroke="#22c55e" strokeWidth={2.4} strokeLinecap="round" />
        <path d={getPath("essay")} fill="none" stroke="#f97316" strokeWidth={2.4} strokeLinecap="round" />

        {data.map((point, index) => {
          const x = paddingX + (index / Math.max(1, data.length - 1)) * (width - paddingX * 2);
          const getY = (value: number) => height - paddingY - (value / maxValue) * (height - paddingY * 2);
          return (
            <g key={point.paper}>
              <circle cx={x} cy={getY(point.total)} r={5} fill="#4C6ED7" />
              <circle cx={x} cy={getY(point.mcq)} r={4} fill="#22c55e" />
              <circle cx={x} cy={getY(point.essay)} r={4} fill="#f97316" />
              <text
                x={x}
                y={height - paddingY + 18}
                textAnchor="middle"
                fontSize={10}
                fill="rgba(100,116,139,0.8)"
              >
                {point.paper.split(" ").slice(-2).join(" ")}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [authView, setAuthView] = useState<"sign-in" | "sign-up">("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [showEmailToast, setShowEmailToast] = useState(false);
  const [emailToastDismissed, setEmailToastDismissed] = useState(false);
  const [emailToastMessage, setEmailToastMessage] = useState<string | null>(null);
  const [isResendingEmail, setIsResendingEmail] = useState(false);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [focusEntries, setFocusEntries] = useState<FocusEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<ExamFormState>(() => createEmptyForm());
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ExamFormState>(() => createEmptyForm());
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [timerOpen, setTimerOpen] = useState(false);
  const [sessionType, setSessionType] = useState<"focus" | "break">("focus");
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_DURATION);
  const [isRunning, setIsRunning] = useState(false);
  const [productivityOpen, setProductivityOpen] = useState(false);
  const [productivityView, setProductivityView] = useState<"day" | "week" | "month">("day");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsAuthLoading(false);
      return;
    }

    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setIsAuthLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setShowEmailToast(false);
      setEmailToastDismissed(false);
      setEmailToastMessage(null);
      return;
    }

    if (!user.email_confirmed_at && !emailToastDismissed) {
      setShowEmailToast(true);
    } else {
      setShowEmailToast(false);
    }
  }, [user, emailToastDismissed]);

  const activeSubject = subjects.find((subject) => subject.id === activeSubjectId) ?? subjects[0];
  const exams = activeSubject?.exams ?? [];

  const loadSubjects = useCallback(async () => {
    if (!user) {
      setSubjects([]);
      setActiveSubjectId(null);
      return;
    }

    if (!isSupabaseConfigured) {
      setSubjects([]);
      setActiveSubjectId(null);
      return;
    }
    setError(null);
    const { data, error } = await supabase
      .from("subjects")
      .select(
        "id, name, created_at, exams:exams(id, subject_id, paper, mcq, essay, total, completion, created_at, updated_at)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setError(error.message);
      setSubjects([]);
      return;
    }

    const mapped: Subject[] = (data ?? []).map((subject: SupabaseSubjectRow) => ({
      id: subject.id,
      name: subject.name,
      exams: (subject.exams ?? []).map((exam: SupabaseExamRow): ExamEntry => ({
        id: exam.id,
        paper: exam.paper,
        mcq: Number(exam.mcq ?? 0),
        essay: Number(exam.essay ?? 0),
        total: Number(exam.total ?? 0),
        completion: Number(exam.completion ?? 0)
      }))
    }));

    setSubjects(mapped);
    setActiveSubjectId((previous) => {
      if (previous && mapped.some((subject) => subject.id === previous)) {
        return previous;
      }
      return mapped[0]?.id ?? null;
    });
  }, [user]);

  const loadFocusEntries = useCallback(async () => {
    if (!user) {
      setFocusEntries([]);
      return;
    }

    if (!isSupabaseConfigured) {
      setFocusEntries([]);
      return;
    }
    setError(null);
    const cutoff = new Date(Date.now() - HISTORY_LIMIT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("focus_entries")
      .select("id, duration, started_at")
      .eq("user_id", user.id)
      .gte("started_at", cutoff)
      .order("started_at", { ascending: true });

    if (error) {
      console.error(error);
      setError(error.message);
      setFocusEntries([]);
      return;
    }

    const mapped: FocusEntry[] = (data ?? []).map((entry: SupabaseFocusEntryRow): FocusEntry => ({
      id: entry.id,
      duration: Number(entry.duration ?? 0),
      timestamp: entry.started_at ?? new Date().toISOString()
    }));

    setFocusEntries(mapped);
  }, [user]);

  const refreshAll = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setSubjects([]);
      setFocusEntries([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    await Promise.all([loadSubjects(), loadFocusEntries()]);
    setIsLoading(false);
  }, [user, loadSubjects, loadFocusEntries]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    setAuthError(null);
    setAuthMessage(null);
    setAuthPassword("");
    setAuthConfirmPassword("");
  }, [authView]);

  const recordFocusSession = useCallback(
    async (duration: number) => {
      if (!user) {
        setError("You must be signed in to record focus sessions.");
        return;
      }

      if (!isSupabaseConfigured) {
        setError("Supabase environment variables are missing.");
        return;
      }
      const { error } = await supabase.from("focus_entries").insert({
        duration,
        started_at: new Date().toISOString(),
        user_id: user.id
      });

      if (error) {
        console.error(error);
        setError(error.message);
        return;
      }

      await loadFocusEntries();
    },
    [loadFocusEntries, user]
  );

  useEffect(() => {
    setForm(createEmptyForm());
    setEditingId(null);
    setEditForm(createEmptyForm());
  }, [activeSubjectId]);

  useEffect(() => {
    if (!timerOpen) {
      setIsRunning(false);
    }
  }, [timerOpen]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const sessionDuration = sessionType === "focus" ? FOCUS_DURATION : BREAK_DURATION;

    if (secondsLeft <= 0) {
      setIsRunning(false);
      if (sessionType === "focus") {
        recordFocusSession(sessionDuration).catch((err) => console.error(err));
      }
      const nextSession = sessionType === "focus" ? "break" : "focus";
      setSessionType(nextSession);
      setSecondsLeft(nextSession === "focus" ? FOCUS_DURATION : BREAK_DURATION);
      return;
    }

    const interval = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, secondsLeft, sessionType, recordFocusSession]);

  const chartData = useMemo<ExamScore[]>(() => {
    return [...exams]
      .slice(0, 6)
      .reverse()
      .map(({ paper, total, mcq, essay }) => ({
        paper,
        total,
        mcq,
        essay
      }));
  }, [exams]);

  const progressData = useMemo(() => {
    return [...exams]
      .sort((a, b) => b.completion - a.completion)
      .slice(0, 3)
      .map((exam) => ({
        id: exam.id,
        paper: exam.paper,
        value: Math.round(Math.max(0, Math.min(100, exam.completion))),
        gradient: getCompletionGradient(exam.completion)
      }));
  }, [exams]);

  const productivityStats = useMemo(() => {
    type ParsedFocusEntry = FocusEntry & { date: Date };

    const now = new Date();
    const todayStart = getStartOfDay(now);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(todayStart);
    monthStart.setDate(monthStart.getDate() - 29);

    const parsedEntries = focusEntries
      .map((entry) => {
        const date = new Date(entry.timestamp);
        if (Number.isNaN(date.getTime())) {
          return null;
        }
        return { ...entry, date } as ParsedFocusEntry;
      })
      .filter(Boolean) as ParsedFocusEntry[];

    const sumDurations = (entries: ParsedFocusEntry[]) =>
      entries.reduce((acc, entry) => acc + entry.duration, 0);

    const dayEntries = parsedEntries.filter((entry) => entry.date >= todayStart);
    const weekEntries = parsedEntries.filter((entry) => entry.date >= weekStart);
    const monthEntries = parsedEntries.filter((entry) => entry.date >= monthStart);

    const weekBreakdown: { label: string; totalSeconds: number }[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      if (day > todayStart) {
        break;
      }
      const total = weekEntries
        .filter((entry) => isSameDay(entry.date, day))
        .reduce((acc, entry) => acc + entry.duration, 0);
      weekBreakdown.push({
        label: day.toLocaleDateString(undefined, { weekday: "short" }),
        totalSeconds: total
      });
    }

    const monthBreakdown: { label: string; totalSeconds: number }[] = [];
    const cursor = new Date(monthStart);
    let weekIndex = 1;
    while (cursor <= todayStart) {
      const periodStart = new Date(cursor);
      const periodEnd = new Date(cursor);
      periodEnd.setDate(periodEnd.getDate() + 6);
      if (periodEnd > todayStart) {
        periodEnd.setTime(todayStart.getTime());
      }
      const total = monthEntries
        .filter((entry) => entry.date >= periodStart && entry.date <= periodEnd)
        .reduce((acc, entry) => acc + entry.duration, 0);
      monthBreakdown.push({ label: `Week ${weekIndex}`, totalSeconds: total });
      cursor.setDate(cursor.getDate() + 7);
      weekIndex += 1;
    }

    const recentSessions = dayEntries
      .slice()
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5)
      .map((entry) => ({ timestamp: entry.date, duration: entry.duration }));

    return {
      day: {
        totalSeconds: sumDurations(dayEntries),
        entries: dayEntries
      },
      week: {
        totalSeconds: sumDurations(weekEntries),
        breakdown: weekBreakdown
      },
      month: {
        totalSeconds: sumDurations(monthEntries),
        breakdown: monthBreakdown
      },
      recentSessions
    };
  }, [focusEntries]);

  const todaysPomodoros = productivityStats.day.entries.length;
  const todaysFocusSeconds = productivityStats.day.totalSeconds;
  const weeklyFocusSeconds = productivityStats.week.totalSeconds;
  const monthlyFocusSeconds = productivityStats.month.totalSeconds;

  const examSummaries = useMemo(() => exams.slice(0, 4), [exams]);

  const isSignUp = authView === "sign-up";
  const displayName = useMemo(() => {
    if (!user) {
      return "";
    }
    const metadataName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
    if (metadataName) {
      return metadataName;
    }
    return user.email ?? "";
  }, [user]);

  const userInitials = useMemo(() => {
    if (!user) {
      return "PB";
    }
    const base = displayName || user.email || "PB";
    const parts = base.split(/[\s@._-]+/).filter(Boolean);
    const letters = parts.map((part) => (part[0] ?? "").toUpperCase()).join("");
    return (letters || "PB").slice(0, 2);
  }, [displayName, user]);

  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? "";
  const userEmail = user?.email ?? "";
  const accountName = displayName || userEmail || "Paper Buddy user";

  const handleAuthEmailChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAuthEmail(event.target.value);
  };

  const handleAuthPasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAuthPassword(event.target.value);
  };

  const handleAuthConfirmPasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAuthConfirmPassword(event.target.value);
  };

  const toggleAuthView = () => {
    setAuthView((previous) => (previous === "sign-in" ? "sign-up" : "sign-in"));
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isSupabaseConfigured) {
      setAuthError("Supabase environment variables are missing.");
      return;
    }

    const email = authEmail.trim().toLowerCase();
    const password = authPassword;
    const confirmPassword = authConfirmPassword;

    if (!email) {
      setAuthError("Enter your email address.");
      return;
    }

    if (!password) {
      setAuthError("Enter your password.");
      return;
    }

    setAuthError(null);
    setAuthMessage(null);
    setIsSubmittingAuth(true);

    if (authView === "sign-up") {
      if (password.length < 8) {
        setAuthError("Password must be at least 8 characters long.");
        setIsSubmittingAuth(false);
        return;
      }

      if (password !== confirmPassword) {
        setAuthError("Passwords do not match.");
        setIsSubmittingAuth(false);
        return;
      }

      try {
        const { error } = await supabase.auth.signUp({
          email,
          password
        });

        if (error) {
          setAuthError(error.message);
        } else {
          setAuthMessage("Check your email inbox to confirm your account, then sign in.");
          setAuthView("sign-in");
        }
      } catch (signUpError) {
        setAuthError(
          signUpError instanceof Error ? signUpError.message : "Unable to sign up. Try again."
        );
      } finally {
        setIsSubmittingAuth(false);
      }

      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        setAuthError(error.message);
      } else {
        setIsAuthLoading(true);
      }
    } catch (signInError) {
      setAuthError(
        signInError instanceof Error ? signInError.message : "Unable to sign in. Try again."
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    setIsAuthLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setError(error.message);
        setIsAuthLoading(false);
        return;
      }
      setSubjects([]);
      setFocusEntries([]);
      setActiveSubjectId(null);
      setLibraryOpen(false);
      setTimerOpen(false);
      setProductivityOpen(false);
      setIsLoading(false);
    } catch (signOutError) {
      setError(
        signOutError instanceof Error ? signOutError.message : "Unable to sign out. Try again."
      );
      setIsAuthLoading(false);
    }
  };

  const insightStats = useMemo(() => {
    const subjectLabel = activeSubject ? activeSubject.name : "this subject";
    if (exams.length === 0) {
      return {
        highestTotal: "—",
        highestTotalPaper: "Add a paper to see totals",
        averageCompletion: "—",
        completionHint: "Add a paper to see trends"
      };
    }

    const [topExam] = [...exams].sort((a, b) => b.total - a.total);
    const avgCompletion = Math.round(
      exams.reduce((acc, exam) => acc + Math.max(0, Math.min(100, exam.completion)), 0) / exams.length
    );

    return {
      highestTotal: topExam.total.toFixed(3),
      highestTotalPaper: topExam.paper,
      averageCompletion: `${avgCompletion}%`,
      completionHint: `${exams.length} paper${exams.length > 1 ? "s" : ""} tracked in ${subjectLabel}`
    };
  }, [exams, activeSubject?.id, activeSubject?.name]);

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100 px-6 text-center text-slate-600">
        <h1 className="text-2xl font-semibold text-slate-800">Supabase not configured</h1>
        <p className="max-w-md text-sm">
          Add <code className="rounded bg-slate-900/10 px-1 py-0.5">VITE_SUPABASE_URL</code> and
          <code className="rounded bg-slate-900/10 px-1 py-0.5">VITE_SUPABASE_ANON_KEY</code> to your <code>.env</code> file, then restart <code>bun run dev</code>.
        </p>
      </div>
    );
  }

  if (isAuthLoading) {
    return (
      <AnimatedLoadingScreen
        headline="Authenticating"
        subtext="Hang tight while we secure your dashboard..."
      />
    );
  }

  if (!user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 px-4 py-12 text-slate-100">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.12),_transparent_55%)]"
        />
        <div className="relative z-10 grid w-full max-w-6xl gap-8 rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-[0_40px_120px_rgba(8,47,73,0.55)] backdrop-blur-2xl md:grid-cols-[1.15fr,1fr] md:p-12">
          <div className="flex flex-col justify-between gap-8">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.4em] text-slate-200">
                <GiPanda className="h-4 w-4 text-slate-300" />
                <span>Paper Buddy</span>
              </div>
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
                  Focus smarter. Secure your progress.
                </h1>
                <p className="max-w-md text-base text-slate-200/80">
                  Sign in to sync calculators, charts, and study analytics across devices with Supabase’s encrypted storage and row-level security.
                </p>
              </div>
            </div>
            <div className="grid gap-5 text-sm text-slate-200/75">
              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <ChartBar className="mt-0.5 h-5 w-5 text-sky-300" />
                <div>
                  <p className="text-sm font-semibold text-white">Personal analytics</p>
                  <p>
                    Keep each student’s performance dashboards separated and private with Supabase policies.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" />
                <div>
                  <p className="text-sm font-semibold text-white">Secure authentication</p>
                  <p>
                    Supabase automatically hashes passwords with bcrypt and refreshes tokens for safe, persistent sessions.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <Trophy className="mt-0.5 h-5 w-5 text-amber-200" />
                <div>
                  <p className="text-sm font-semibold text-white">Win-ready insights</p>
                  <p>
                    Unlock calculators, charts, and productivity tracking tailored for Paper Buddy’s study workflow.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Card className="w-full max-w-md justify-self-center bg-white/95 text-slate-900 shadow-[0_30px_80px_rgba(15,23,42,0.35)]">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-semibold">
                {isSignUp ? "Create your account" : "Welcome back"}
              </CardTitle>
              <CardDescription>
                {isSignUp
                  ? "Use your school email to get started. You’ll confirm your address before signing in."
                  : "Sign in to view your saved subjects, exams, and focus history."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {authError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                  {authError}
                </div>
              )}
              {authMessage && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {authMessage}
                </div>
              )}
              <form className="space-y-5" onSubmit={handleAuthSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="auth-email">Email</Label>
                  <Input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={authEmail}
                    onChange={handleAuthEmailChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auth-password">Password</Label>
                  <Input
                    id="auth-password"
                    type="password"
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    placeholder={isSignUp ? "Create a secure password" : "Enter your password"}
                    value={authPassword}
                    onChange={handleAuthPasswordChange}
                    required
                    minLength={8}
                  />
                  <p className="text-xs text-slate-400">
                    Minimum 8 characters.
                  </p>
                </div>
                {isSignUp && (
                  <div className="space-y-2">
                    <Label htmlFor="auth-confirm">Confirm password</Label>
                    <Input
                      id="auth-confirm"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      value={authConfirmPassword}
                      onChange={handleAuthConfirmPasswordChange}
                      required
                      minLength={8}
                    />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={isSubmittingAuth}>
                  {isSubmittingAuth
                    ? isSignUp
                      ? "Creating account…"
                      : "Signing in…"
                    : isSignUp
                    ? "Create account"
                    : "Sign in"}
                </Button>
              </form>
              <div className="text-center text-sm text-slate-500">
                {isSignUp ? "Already have an account?" : "Need an account?"}{" "}
                <button
                  type="button"
                  onClick={toggleAuthView}
                  className="font-semibold text-slate-900 underline-offset-4 transition hover:underline"
                >
                  {isSignUp ? "Sign in" : "Sign up"}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading && subjects.length === 0) {
    const awaitingEmailConfirmation = Boolean(user && !user.email_confirmed_at);
    return (
      <AnimatedLoadingScreen
        headline={awaitingEmailConfirmation ? "Confirm your email" : "Syncing your study data"}
        subtext={
          awaitingEmailConfirmation
            ? `We sent a verification link to ${user?.email ?? "your inbox"}. Open it to activate your account, then sign in again.`
            : "Fetching papers, analytics, and focus history from Supabase."
        }
      />
    );
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddExam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = prepareExamPayload(form);
    if (!payload) {
      return;
    }

    if (!activeSubject) {
      return;
    }

    if (!user) {
      setError("You must be signed in to add a paper.");
      return;
    }

    if (!isSupabaseConfigured) {
      setError("Supabase environment variables are missing.");
      return;
    }

    const { error } = await supabase.from("exams").insert({
      subject_id: activeSubject.id,
      user_id: user.id,
      paper: payload.paper,
      mcq: payload.mcq,
      essay: payload.essay,
      total: payload.total,
      completion: payload.completion
    });

    if (error) {
      console.error(error);
      setError(error.message);
      return;
    }

    setForm(createEmptyForm());
    setIsLoading(true);
    await loadSubjects();
    setIsLoading(false);
  };

  const handleClearForm = () => setForm(createEmptyForm());

  const closeLibrary = () => {
    setLibraryOpen(false);
    setEditingId(null);
    setEditForm(createEmptyForm());
  };

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      closeLibrary();
    }
  };

  const handleStartEdit = (exam: ExamEntry) => {
    setEditingId(exam.id);
    setEditForm(examToForm(exam));
  };

  const handleEditChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdateExam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) {
      return;
    }

    const payload = prepareExamPayload(editForm);
    if (!payload) {
      return;
    }

    if (!user) {
      setError("You must be signed in to update a paper.");
      return;
    }

    const { error } = await supabase
      .from("exams")
      .update({
        paper: payload.paper,
        mcq: payload.mcq,
        essay: payload.essay,
        total: payload.total,
        completion: payload.completion
      })
      .eq("id", editingId)
      .eq("user_id", user.id);

    if (error) {
      console.error(error);
      setError(error.message);
      return;
    }

    setIsLoading(true);
    await loadSubjects();
    setIsLoading(false);
    setEditingId(null);
    setEditForm(createEmptyForm());
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(createEmptyForm());
  };

  const handleDeleteExam = (id: string) => {
    if (!activeSubject) {
      return;
    }

    if (!user) {
      setError("You must be signed in to delete a paper.");
      return;
    }

    const subjectId = activeSubject.id;
    const examToDelete = activeSubject.exams.find((exam) => exam.id === id);
    if (!examToDelete) {
      return;
    }

    setConfirmDialog({
      title: "Delete paper",
      description: `Remove "${examToDelete.paper}" from ${activeSubject.name}?`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: async () => {
        setIsLoading(true);
        if (!isSupabaseConfigured) {
          setError("Supabase environment variables are missing.");
          setIsLoading(false);
          return;
        }

        const { error } = await supabase.from("exams").delete().eq("id", id).eq("user_id", user.id);
        if (error) {
          console.error(error);
          setError(error.message);
          setIsLoading(false);
          return;
        }

        if (editingId === id) {
          setEditingId(null);
          setEditForm(createEmptyForm());
        }

        await loadSubjects();
        setIsLoading(false);
      }
    });
  };

  const handleSubjectSelect = (subjectId: string) => {
    setActiveSubjectId(subjectId);
  };

  const handleToggleSubjectForm = () => {
    setIsAddingSubject((previous) => !previous);
    setNewSubjectName("");
  };

  const handleCreateSubject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newSubjectName.trim();
    if (!name) {
      return;
    }

    setIsLoading(true);

    if (!user) {
      setError("You must be signed in to create a subject.");
      setIsLoading(false);
      return;
    }

    if (!isSupabaseConfigured) {
      setError("Supabase environment variables are missing.");
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("subjects")
      .insert({ name, user_id: user.id })
      .select("id")
      .single();

    if (error) {
      console.error(error);
      setError(error.message);
      setIsLoading(false);
      return;
    }

    setNewSubjectName("");
    setIsAddingSubject(false);
    await loadSubjects();
    setActiveSubjectId(data?.id ?? null);
    setIsLoading(false);
  };

  const handleSubjectNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNewSubjectName(event.target.value);
  };

  const handleDeleteSubject = () => {
    if (!activeSubject) {
      return;
    }

    if (!user) {
      setError("You must be signed in to delete a subject.");
      return;
    }

    const subjectId = activeSubject.id;
    const subjectName = activeSubject.name;

    setConfirmDialog({
      title: "Delete subject",
      description: `Delete "${subjectName}" and all associated papers?`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: async () => {
        setIsLoading(true);
        if (!isSupabaseConfigured) {
          setError("Supabase environment variables are missing.");
          setIsLoading(false);
          return;
        }

        const { error } = await supabase
          .from("subjects")
          .delete()
          .eq("id", subjectId)
          .eq("user_id", user.id);
        if (error) {
          console.error(error);
          setError(error.message);
          setIsLoading(false);
          return;
        }

        setIsAddingSubject(false);
        setNewSubjectName("");
        setLibraryOpen(false);
        await loadSubjects();
        setIsLoading(false);
      }
    });
  };

  const handleSidebarClick = (label: string) => {
    if (label === "Papers") {
      setLibraryOpen(true);
      setTimerOpen(false);
      setProductivityOpen(false);
      return;
    }

    if (label === "Alerts") {
      setTimerOpen((previous) => {
        const next = !previous;
        if (next) {
          setLibraryOpen(false);
          setProductivityOpen(false);
        }
        return next;
      });
      return;
    }

    if (label === "Analytics") {
      setProductivityOpen((previous) => {
        const next = !previous;
        if (next) {
          setLibraryOpen(false);
          setTimerOpen(false);
          setProductivityView("day");
        }
        return next;
      });
    }
  };

  const handleCloseTimer = () => {
    setTimerOpen(false);
  };

  const handleStartPauseTimer = () => {
    setIsRunning((prev) => !prev);
  };

  const handleResetTimer = () => {
    setIsRunning(false);
    setSessionType("focus");
    setSecondsLeft(FOCUS_DURATION);
  };

  const handleSkipSession = async () => {
    const sessionDuration = sessionType === "focus" ? FOCUS_DURATION : BREAK_DURATION;
    if (sessionType === "focus") {
      await recordFocusSession(sessionDuration);
    }

    const nextSession = sessionType === "focus" ? "break" : "focus";
    setSessionType(nextSession);
    setSecondsLeft(nextSession === "focus" ? FOCUS_DURATION : BREAK_DURATION);
    setIsRunning(false);
  };

  const handleSessionSelect = (type: "focus" | "break") => {
    setSessionType(type);
    setSecondsLeft(type === "focus" ? FOCUS_DURATION : BREAK_DURATION);
    setIsRunning(false);
  };

  return (
    <>
      {error && (
        <div className="fixed left-1/2 top-6 z-[60] w-[90vw] max-w-xl -translate-x-1/2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-medium text-rose-600 shadow-lg shadow-rose-200/50">
          {error}
        </div>
      )}

      {isLoading && subjects.length > 0 && (
        <div className="fixed left-1/2 top-20 z-[55] -translate-x-1/2 rounded-full bg-slate-900 text-white px-4 py-2 text-xs font-semibold tracking-[0.3em] shadow-lg shadow-slate-900/30">
          SYNCING…
        </div>
      )}

      {libraryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm px-4 py-10"
          onClick={handleOverlayClick}
        >
          <div className="glass-panel relative w-full max-w-5xl overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-[0_35px_70px_rgba(15,23,42,0.35)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/60 bg-white/70 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Paper library</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                  {activeSubject ? `${activeSubject.name} papers` : "All papers"}
                </h2>
                <p className="text-xs text-slate-500">
                  Manage, edit or delete any saved paper for this subject. Changes persist in local storage.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  className="rounded-full bg-white/80 text-slate-600 hover:bg-white"
                  type="button"
                  onClick={closeLibrary}
                >
                  <X className="mr-2 h-4 w-4" /> Close
                </Button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-4">
              {exams.length > 0 ? (
                exams.map((exam) => {
                  const isEditing = editingId === exam.id;
                  const completionLabel = `${Math.round(Math.max(0, Math.min(100, exam.completion)))}% complete`;

                  return (
                    <div
                      key={exam.id}
                      className="glass-panel flex flex-col gap-4 rounded-2xl bg-white/75 p-5 shadow-[0_18px_30px_rgba(15,23,42,0.15)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Paper</p>
                          <h3 className="text-lg font-semibold text-slate-900">{exam.paper}</h3>
                        </div>
                        <div className="metric-chip bg-white/70 text-slate-600">
                          <span className="text-slate-400">Completion</span>
                          <span className="font-semibold text-slate-900">{completionLabel}</span>
                        </div>
                      </div>

                      {isEditing ? (
                        <form className="grid gap-3 md:grid-cols-2" onSubmit={handleUpdateExam}>
                          <div className="md:col-span-2 space-y-2">
                            <Label htmlFor={`edit-paper-${exam.id}`}>Paper name</Label>
                            <Input
                              id={`edit-paper-${exam.id}`}
                              name="paper"
                              value={editForm.paper}
                              onChange={handleEditChange}
                              required
                              autoFocus
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`edit-mcq-${exam.id}`}>MCQ</Label>
                            <Input
                              id={`edit-mcq-${exam.id}`}
                              name="mcq"
                              type="number"
                              inputMode="numeric"
                              min="0"
                              step="1"
                              value={editForm.mcq}
                              onChange={handleEditChange}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`edit-essay-${exam.id}`}>Essay</Label>
                            <Input
                              id={`edit-essay-${exam.id}`}
                              name="essay"
                              type="number"
                              inputMode="numeric"
                              min="0"
                              step="1"
                              value={editForm.essay}
                              onChange={handleEditChange}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`edit-completion-${exam.id}`}>Completion %</Label>
                            <Input
                              id={`edit-completion-${exam.id}`}
                              name="completion"
                              type="number"
                              inputMode="numeric"
                              min="0"
                              max="100"
                              step="1"
                              value={editForm.completion}
                              onChange={handleEditChange}
                            />
                          </div>
                          <div className="md:col-span-2 flex justify-end gap-3">
                            <Button type="button" variant="ghost" onClick={handleCancelEdit}>
                              Cancel
                            </Button>
                            <Button type="submit">Save changes</Button>
                          </div>
                        </form>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                          <div className="space-y-1 text-sm text-slate-600">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Marks</p>
                            <div className="flex flex-wrap gap-4 font-medium">
                              <span>
                                MCQ: <span className="font-semibold text-slate-900">{formatScore(exam.mcq)}</span>
                              </span>
                              <span>
                                Essay: <span className="font-semibold text-slate-900">{formatScore(exam.essay)}</span>
                              </span>
                              <span>
                                Total: <span className="font-semibold text-slate-900">{exam.total.toFixed(3)}</span>
                              </span>
                            </div>
                          </div>
                          <div className="space-y-2 text-sm text-slate-600">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Completion</p>
                            <Progress
                              value={Math.round(Math.max(0, Math.min(100, exam.completion)))}
                              className="h-2 bg-white/50"
                              indicatorClassName={cn(
                                "bg-gradient-to-r",
                                getCompletionGradient(exam.completion)
                              )}
                            />
                            <p className="font-semibold text-slate-900">
                              {Math.round(Math.max(0, Math.min(100, exam.completion)))}%
                            </p>
                          </div>
                          <div className="flex flex-col items-start justify-between gap-3 text-sm md:items-end">
                            <div className="flex flex-wrap gap-3">
                              <Button
                                variant="ghost"
                                className="bg-white/80 text-slate-600 hover:bg-white"
                                type="button"
                                onClick={() => handleStartEdit(exam)}
                              >
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </Button>
                              <Button
                                variant="ghost"
                                className="bg-rose-500/10 text-rose-600 hover:bg-rose-500/15"
                                type="button"
                                onClick={() => handleDeleteExam(exam.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </Button>
                            </div>
                            <p className="text-xs text-slate-400">Last updated locally.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-12 text-center text-sm text-slate-500">
                  No records yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="min-h-screen px-4 pb-10 pt-8 md:px-8">
        <div className="mx-auto flex max-w-[1280px] gap-6">
          <aside className="glass-panel hidden w-[96px] flex-col items-center justify-between py-6 lg:flex">
            <div className="flex flex-col items-center gap-5">
              {sidebarItems.map(({ icon: Icon, label, gradient }) => {
                const isActive =
                  (label === "Papers" && libraryOpen) ||
                  (label === "Alerts" && timerOpen);
                return (
                  <button
                    key={label}
                    className={cn(
                      "sidebar-icon",
                      "shadow-[0_10px_25px_rgba(15,23,42,0.12)]",
                      `bg-gradient-to-br ${gradient}`,
                      isActive && "ring-4 ring-white/60 ring-offset-2 ring-offset-slate-200"
                    )}
                    aria-label={label}
                    aria-pressed={isActive}
                    type="button"
                    onClick={() => handleSidebarClick(label)}
                  >
                    <Icon className="h-6 w-6" />
                  </button>
                );
              })}
            </div>
            <button
              className="sidebar-icon shadow-[0_12px_30px_rgba(244,63,94,0.35)] bg-gradient-to-br from-rose-500 to-rose-600"
              aria-label="Sign out"
              type="button"
              onClick={handleSignOut}
              disabled={isAuthLoading}
            >
              <LogOut className="h-6 w-6" />
            </button>
          </aside>

        <div className="flex-1 space-y-6">
          <header className="glass-panel flex flex-col gap-5 px-6 py-6 md:flex-row md:items-center md:justify-between md:px-10">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.25)]">
                <GiPanda className="h-7 w-7" />
              </div>
              <div className="space-y-1">

                <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                  PAPER BUDDY
                </h1>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-inner shadow-white/40">
                  <Layers className="h-3.5 w-3.5 text-slate-500" />
                  <span>{activeSubject ? activeSubject.name : "Add a subject"}</span>
                </div>
                <p className="text-sm text-slate-500">
                  Track your exam performance and spot winning insights in seconds.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Separator className="hidden h-10 w-px md:block" />
              <button
                type="button"
                className="relative rounded-full bg-white/80 p-2 text-slate-500 transition hover:text-slate-700"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                  3
                </span>
              </button>
              <div className="glass-panel flex flex-wrap items-center gap-3 px-4 py-2">
                <div className="flex items-center gap-3">
                  <Avatar>
                    {avatarUrl ? (
                      <AvatarImage src={avatarUrl} alt={accountName} />
                    ) : null}
                    <AvatarFallback>{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-[160px]">
                    <p className="text-sm font-semibold text-slate-700">{accountName}</p>
                    <p className="text-xs text-slate-400">
                      {userEmail ? userEmail : "Supabase session active"}
                    </p>
                  </div>
                </div>
                {/*<Button*/}
                {/*  type="button"*/}
                {/*  variant="ghost"*/}
                {/*  size="sm"*/}
                {/*  className="ml-auto bg-white/80 text-slate-600 hover:bg-white"*/}
                {/*  onClick={handleSignOut}*/}
                {/*  disabled={isAuthLoading || isLoading}*/}
                {/*>*/}
                {/*  <LogOut className="mr-1.5 h-4 w-4" />*/}
                {/*  Sign out*/}
                {/*</Button>*/}
              </div>
            </div>
          </header>

          <div className="glass-panel flex flex-col gap-4 px-6 py-6 md:px-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Subjects</p>
                <h2 className="text-lg font-semibold text-slate-900">
                  {activeSubject ? `${activeSubject.name} focus` : "Add your first subject"}
                </h2>
                <p className="text-xs text-slate-500">
                  Switch to another subject to view a dedicated set of papers and analytics.
                </p>
              </div>
              {!isAddingSubject && (
                <Button
                  type="button"
                  variant="ghost"
                  className="bg-white/80 text-slate-600 hover:bg-white"
                  onClick={handleToggleSubjectForm}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add subject
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {subjects.map((subject) => {
                const isActive = activeSubject?.id === subject.id;
                return (
                  <button
                    key={subject.id}
                    type="button"
                    onClick={() => handleSubjectSelect(subject.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white shadow-[0_14px_30px_rgba(15,23,42,0.25)]"
                        : "border-transparent bg-white/70 text-slate-600 hover:border-slate-200 hover:bg-white"
                    )}
                  >
                    <span>{subject.name}</span>
                    <span className={cn(
                      "inline-flex items-center justify-center rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium",
                      isActive ? "text-white" : "text-slate-500"
                    )}>
                      {subject.exams.length}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-3">
              {isAddingSubject && (
                <form className="flex flex-wrap items-center gap-3" onSubmit={handleCreateSubject}>
                  <Input
                    name="subject"
                    placeholder="e.g. Mathematics"
                    value={newSubjectName}
                    onChange={handleSubjectNameChange}
                    className="w-full min-w-[220px] flex-1"
                    autoFocus
                  />
                  <Button type="submit" disabled={!newSubjectName.trim()}>
                    Save subject
                  </Button>
                  <Button type="button" variant="ghost" onClick={handleToggleSubjectForm}>
                    Cancel
                  </Button>
                </form>
              )}

              <div className="flex w-full flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="bg-rose-500/10 text-rose-600 hover:bg-rose-500/15"
                  onClick={handleDeleteSubject}
                  disabled={!activeSubject || subjects.length <= 1}
                >
                  Delete subject
                </Button>
                <p className="text-xs text-slate-400">
                  Removes {activeSubject ? activeSubject.name : "this subject"} and its papers. At least one subject must remain.
                </p>
              </div>
            </div>
          </div>

          <main className="space-y-6">
            <section>
              <Card className="relative overflow-hidden">
                <div className="absolute inset-0 -z-10 bg-gradient-to-br from-slate-100 via-white to-white" />
                <CardHeader className="gap-3">
                  <Badge className="bg-slate-900/10 text-slate-700">Add paper</Badge>
                  <CardTitle className="text-2xl text-slate-900">Record a new paper</CardTitle>
                  <CardDescription>
                    Enter marks and progress for your latest paper attempt. Entries for
                    {" "}
                    <span className="font-semibold text-slate-600">
                      {activeSubject ? ` ${activeSubject.name}` : " this subject"}
                    </span>
                    {" "}live only in your browser via local storage.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-4 md:grid-cols-2" onSubmit={handleAddExam}>
                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor="paper">Paper name</Label>
                      <Input
                        id="paper"
                        name="paper"
                        placeholder="e.g. 2025 FINAL PAPER 06"
                        value={form.paper}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mcq">MCQ score</Label>
                      <Input
                        id="mcq"
                        name="mcq"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={form.mcq}
                        onChange={handleInputChange}
                        placeholder="15"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="essay">Essay score</Label>
                      <Input
                        id="essay"
                        name="essay"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={form.essay}
                        onChange={handleInputChange}
                        placeholder="2"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="completion">Completion %</Label>
                      <Input
                        id="completion"
                        name="completion"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="100"
                        step="1"
                        value={form.completion}
                        onChange={handleInputChange}
                        placeholder="92"
                      />
                    </div>
                    <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-slate-400">
                        Totals auto-calculate from MCQ + essay.
                      </p>
                      <div className="flex gap-3">
                        <Button type="button" variant="ghost" onClick={handleClearForm}>
                          Clear
                        </Button>
                        <Button type="submit" disabled={!form.paper.trim()}>
                          Save paper
                        </Button>
                      </div>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)]">
              <Card className="relative overflow-hidden">
                <div className="absolute inset-0 -z-10 bg-gradient-to-br from-sky-100 via-white to-white" />
                <CardHeader className="flex flex-row items-start justify-between">
                  <div>
                    <Badge className="bg-gradient-to-r from-sky-500/10 to-violet-500/10 text-sky-600">
                      Paper Marks Analyze
                    </Badge>
                    <CardTitle className="mt-4 text-2xl text-slate-900">
                      Performance overview
                    </CardTitle>
                    <CardDescription>
                      Totals vs MCQ and essay contributions for
                      {" "}
                      <span className="font-semibold text-slate-600">
                        {activeSubject ? activeSubject.name : "this subject"}
                      </span>
                      .
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full px-4">
                    Export report
                  </Button>
                </CardHeader>
                <CardContent className="space-y-6">
                  <LineChart data={chartData} />
                  {chartData.length > 0 && (
                    <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-500">
                      <LegendDot className="bg-brand-primary" label="Total" />
                      <LegendDot className="bg-emerald-500" label="MCQ" />
                      <LegendDot className="bg-orange-500" label="Essay" />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute inset-0 -z-10 bg-gradient-to-br from-violet-100 via-white to-white" />
                <CardHeader>
                  <Badge className="bg-brand-secondary/10 text-brand-secondary">
                    My Best
                  </Badge>
                  <CardTitle className="text-2xl text-slate-900">Season highlights</CardTitle>
                  <CardDescription>
                    Celebrate your strongest attempts in
                    {" "}
                    <span className="font-semibold text-slate-600">
                      {activeSubject ? activeSubject.name : "this subject"}
                    </span>
                    {" "}and unlock AI-led guidance.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                    <StatsCard
                      label="Highest Total"
                      value={insightStats.highestTotal}
                      hint={insightStats.highestTotalPaper}
                    />
                    <StatsCard
                      label="Avg Completion"
                      value={insightStats.averageCompletion}
                      hint={insightStats.completionHint}
                    />
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 p-5 text-white shadow-[0_18px_35px_rgba(139,92,246,0.35)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-white/70">
                          Analyze marks with AI
                        </p>
                        <p className="mt-2 text-lg font-semibold">AP LearniX</p>
                        <p className="mt-1 text-sm text-white/80">
                          Personalized predictions, revision planning and smart insights.
                        </p>
                      </div>
                      <PieChart className="h-12 w-12 opacity-90" />
                    </div>
                    <Button variant="ghost" className="mt-5 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30">
                      Start AI analysis
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)]">
              <Card>
                <CardHeader className="gap-3">
                  <Badge className="bg-sky-100 text-sky-600">Revision focus</Badge>
                  <CardTitle className="text-2xl text-slate-900">Upcoming practice</CardTitle>
                  <CardDescription>
                    Track completion across your {activeSubject ? activeSubject.name : "subject"} practice and
                    plan the next session.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {progressData.length > 0 ? (
                    progressData.map((item) => (
                      <div key={item.id} className="space-y-2">
                        <div className="flex items-center justify-between text-sm font-medium">
                          <span className="text-slate-600">{item.paper}</span>
                          <span className="text-slate-500">{item.value}%</span>
                        </div>
                        <Progress
                          value={item.value}
                          className="h-3 bg-white/50"
                          indicatorClassName={cn("bg-gradient-to-r", item.gradient)}
                        />
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">No records yet.</p>
                  )}
                  {progressData.length > 0 && (
                    <Button className="w-full">Why these colors?</Button>
                  )}
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden">
                <div className="absolute inset-0 -z-10 bg-gradient-to-br from-rose-50 via-white to-white" />
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <Badge className="bg-brand-accent/10 text-brand-accent">Exam Recap</Badge>
                    <CardTitle className="mt-4 text-2xl text-slate-900">Paper snapshot</CardTitle>
                    <CardDescription>
                      Compare attempts across MCQ and essay to pinpoint gaps for
                      {" "}
                      <span className="font-semibold text-white/90">
                        {activeSubject ? activeSubject.name : "this subject"}
                      </span>
                      .
                    </CardDescription>
                  </div>
                  <Trophy className="hidden h-14 w-14 text-brand-accent/80 md:block" />
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    {examSummaries.length > 0 ? (
                      examSummaries.map((summary) => {
                        const completionDisplay = Math.round(
                          Math.max(0, Math.min(100, summary.completion))
                        );
                        return (
                          <div
                            key={summary.id}
                            className="glass-panel flex flex-col gap-3 rounded-xl border border-white/70 bg-gradient-to-br from-rose-500/90 via-rose-500/80 to-rose-500/90 p-5 text-white shadow-[0_18px_40px_rgba(244,63,94,0.35)]"
                          >
                            <div className="flex items-start justify-between">
                              <h3 className="text-base font-semibold drop-shadow-sm">
                                {summary.paper}
                              </h3>
                            </div>
                            <div className="flex gap-6 text-sm font-medium">
                              <div className="space-y-1">
                                <p className="text-white/70">MCQ</p>
                                <p className="text-lg font-semibold text-white">{formatScore(summary.mcq)}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-white/70">Essay</p>
                                <p className="text-lg font-semibold text-white">{formatScore(summary.essay)}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-white/70">Total</p>
                                <p className="text-lg font-semibold text-white">{summary.total.toFixed(3)}</p>
                              </div>
                            </div>
                            <Separator className="h-px w-full bg-white/20" />
                            <div className="space-y-1 text-xs">
                              <p className="text-white/80">Completion : {completionDisplay}%</p>
                              <p className="text-white/70">Tracked locally</p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-slate-500">No records yet.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>
          </main>
        </div>
      </div>

      <footer className="mx-auto mt-10 max-w-[1280px] text-center text-sm text-slate-400">
        <p>
          Built By NullbitZer0 &copy; 2024. All rights reserved.
        </p>
      </footer>
    </div>

      {productivityOpen && (
        <ProductivityPanel
          onClose={() => setProductivityOpen(false)}
          view={productivityView}
          onChangeView={setProductivityView}
          totals={{
            day: todaysFocusSeconds,
            week: weeklyFocusSeconds,
            month: monthlyFocusSeconds
          }}
          weekBreakdown={productivityStats.week.breakdown}
          monthBreakdown={productivityStats.month.breakdown}
          recentSessions={productivityStats.recentSessions}
        />
      )}

      {timerOpen && (
        <PomodoroTimer
          onClose={handleCloseTimer}
          sessionType={sessionType}
          secondsLeft={secondsLeft}
          isRunning={isRunning}
          onStartPause={handleStartPauseTimer}
          onReset={handleResetTimer}
          onSkip={handleSkipSession}
          onSelectSession={handleSessionSelect}
          todaysPomodoros={todaysPomodoros}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          {...confirmDialog}
          onConfirm={() => {
            confirmDialog.onConfirm();
            setConfirmDialog(null);
          }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </>
  );
}

function LegendDot({ className, label }: { className?: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-3 w-3 rounded-full", className)} />
      <span>{label}</span>
    </div>
  );
}

function StatsCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="glass-panel flex flex-col gap-1 rounded-2xl bg-white/70 px-5 py-4 shadow-[0_16px_30px_rgba(79,70,229,0.12)]">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</p>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}


type PomodoroTimerProps = {
  onClose: () => void;
  sessionType: "focus" | "break";
  secondsLeft: number;
  isRunning: boolean;
  onStartPause: () => void;
  onReset: () => void;
  onSkip: () => void;
  onSelectSession: (type: "focus" | "break") => void;
  todaysPomodoros: number;
};

function PomodoroTimer({
  onClose,
  sessionType,
  secondsLeft,
  isRunning,
  onStartPause,
  onReset,
  onSkip,
  onSelectSession,
  todaysPomodoros
}: PomodoroTimerProps) {
  const totalDuration = sessionType === "focus" ? FOCUS_DURATION : BREAK_DURATION;
  const progress = 100 - Math.round((secondsLeft / totalDuration) * 100);

  const formatTime = (value: number) => {
    const minutes = Math.floor(value / 60)
      .toString()
      .padStart(2, "0");
    const seconds = Math.floor(value % 60)
      .toString()
      .padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 px-4 py-10 backdrop-blur-sm">
      <div className="glass-panel relative flex w-full max-w-5xl flex-col gap-10 rounded-[32px] bg-white/90 p-10 shadow-[0_40px_90px_rgba(15,23,42,0.25)]">
        <button
          type="button"
          className="absolute right-8 top-8 rounded-full bg-white/70 p-2 text-slate-400 transition hover:text-slate-600"
          onClick={onClose}
          aria-label="Close Pomodoro timer"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[2fr,1fr] lg:items-start lg:gap-12">
          <div className="space-y-8">
            <div className="space-y-3">
              <p className="text-sm uppercase tracking-[0.45em] text-slate-400">Pomodoro</p>
              <h3 className="text-3xl font-semibold text-slate-900 md:text-4xl">
                {sessionType === "focus" ? "Focus Sprint" : "Break Time"}
              </h3>
              <p className="text-sm text-slate-500">
                {todaysPomodoros > 0 ? (
                  <>
                    Completed cycles today:
                    <span className="ml-1 font-semibold text-slate-700">{todaysPomodoros}</span>
                  </>
                ) : (
                  "No records yet."
                )}
              </p>
            </div>

            <div className="grid gap-6 rounded-[28px] bg-gradient-to-br from-slate-900 to-slate-700 p-8 text-white shadow-[0_25px_60px_rgba(15,23,42,0.45)] md:grid-cols-[auto,1fr] md:items-center">
              <div className="flex flex-col items-center gap-4 md:items-start">
                <div className="flex items-center gap-3 rounded-full bg-white/10 px-4 py-2">
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] transition",
                      sessionType === "focus"
                        ? "bg-white text-slate-900 shadow-[0_16px_30px_rgba(255,255,255,0.25)]"
                        : "text-white/70 hover:text-white"
                    )}
                    onClick={() => onSelectSession("focus")}
                  >
                    Focus
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] transition",
                      sessionType === "break"
                        ? "bg-emerald-400 text-slate-900 shadow-[0_16px_30px_rgba(16,185,129,0.35)]"
                        : "text-white/70 hover:text-white"
                    )}
                    onClick={() => onSelectSession("break")}
                  >
                    Break
                  </button>
                </div>
                <span className="text-[72px] font-bold leading-none tracking-tight md:text-[96px]">
                  {formatTime(secondsLeft)}
                </span>
              </div>
              <div className="flex flex-col justify-between gap-6 md:gap-10">
                <Progress
                  value={progress}
                  className="h-5 w-full rounded-full bg-white/20"
                  indicatorClassName={cn(
                    "rounded-full bg-gradient-to-r",
                    sessionType === "focus"
                      ? "from-white via-brand-primary to-brand-secondary"
                      : "from-emerald-300 via-emerald-400 to-teal-300"
                  )}
                />
                <div className="grid gap-3 text-sm text-white/70 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/10 p-4">
                    <p className="text-xs uppercase tracking-[0.35em] text-white/60">Total Duration</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {sessionType === "focus" ? `${FOCUS_DURATION / 60} min` : `${BREAK_DURATION / 60} min`}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-4">
                    <p className="text-xs uppercase tracking-[0.35em] text-white/60">Remaining</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{Math.ceil(secondsLeft / 60)} min</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex items-center gap-3 rounded-full bg-slate-900 px-6 py-3 text-base font-semibold text-white shadow-[0_25px_40px_rgba(15,23,42,0.35)] transition hover:bg-slate-800"
                  onClick={onStartPause}
                >
                  {isRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />} {isRunning ? "Pause" : "Start"}
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-[0_18px_35px_rgba(148,163,184,0.35)] transition hover:text-slate-800"
                  onClick={onReset}
                  aria-label="Reset timer"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-[0_18px_35px_rgba(148,163,184,0.35)] transition hover:text-slate-800"
                  onClick={onSkip}
                  aria-label="Skip session"
                >
                  <SkipForward className="h-4 w-4" />
                  Skip
                </button>
              </div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
                Focus more to unlock productivity milestones.
              </p>
            </div>
          </div>

          <div className="space-y-6 rounded-[28px] bg-white/70 p-6 shadow-[0_20px_45px_rgba(15,23,42,0.15)]">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Today&apos;s Focus</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{todaysPomodoros}</p>
              <p className="text-sm text-slate-500">
                {todaysPomodoros === 1 ? "Pomodoro logged" : "Pomodoros logged"} in the current cycle.
              </p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-3">
                <span className="h-10 w-10 rounded-full bg-slate-900/90 text-white shadow-[0_15px_35px_rgba(15,23,42,0.35)]">
                  <Play className="m-auto h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Stay in the zone</p>
                  <p className="text-xs text-slate-500">
                    Keep your streak alive with consistent focus sessions and mindful breaks.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-3">
                <span className="h-10 w-10 rounded-full bg-emerald-500/90 text-white shadow-[0_15px_35px_rgba(16,185,129,0.45)]">
                  <Pause className="m-auto h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Recover intentionally</p>
                  <p className="text-xs text-slate-500">
                    Breaks help consolidate learning—switch sessions when you need to refresh.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type FocusLineChartProps = {
  points: { label: string; totalSeconds: number }[];
  targetSeconds: number;
};

function FocusLineChart({ points, targetSeconds }: FocusLineChartProps) {
  const gradientId = `${useId()}-focus-line`;
  const width = 320;
  const height = 160;
  const paddingX = 28;
  const paddingY = 28;
  const horizontalSpace = width - paddingX * 2;
  const verticalSpace = height - paddingY * 2;
  const maxValue = Math.max(targetSeconds, ...points.map((point) => point.totalSeconds), 1);

  const coordinates = points.map((point, index) => {
    const ratio = points.length === 1 ? 0.5 : index / (points.length - 1);
    const x = paddingX + ratio * horizontalSpace;
    const y = height - paddingY - (point.totalSeconds / maxValue) * verticalSpace;
    return { ...point, x, y };
  });

  const linePath = coordinates
    .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x},${coord.y}`)
    .join(" ");
  const areaPath = coordinates.length
    ? `${linePath} L${coordinates[coordinates.length - 1].x},${height - paddingY} L${coordinates[0].x},${height - paddingY} Z`
    : "";

  const targetY = height - paddingY - (targetSeconds / maxValue) * verticalSpace;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4C6ED7" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#4C6ED7" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0.25, 0.5, 0.75, 1].map((fraction) => {
        const y = paddingY + fraction * verticalSpace;
        const labelSeconds = Math.max(0, Math.round((1 - fraction) * maxValue));
        return (
          <g key={fraction}>
            <line
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              stroke="rgba(148,163,184,0.3)"
              strokeDasharray="4 6"
            />
            <text
              x={paddingX - 8}
              y={y - 4}
              textAnchor="end"
              fontSize={10}
              fill="rgba(100,116,139,0.7)"
            >
              {formatDuration(labelSeconds)}
            </text>
          </g>
        );
      })}

      <line
        x1={paddingX}
        x2={width - paddingX}
        y1={targetY}
        y2={targetY}
        stroke="rgba(244,63,94,0.45)"
        strokeDasharray="6 6"
      />
      <text
        x={width - paddingX}
        y={targetY - 6}
        textAnchor="end"
        fontSize={10}
        fill="rgba(244,63,94,0.8)"
      >
        Target
      </text>

      {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
      {linePath && <path d={linePath} fill="none" stroke="#4C6ED7" strokeWidth={3} strokeLinecap="round" />}

      {coordinates.map((coord) => (
        <g key={`${coord.label}-${coord.x}`}>
          <circle cx={coord.x} cy={coord.y} r={4} fill="#4C6ED7" />
          <text
            x={coord.x}
            y={coord.y - 8}
            fontSize={10}
            textAnchor="middle"
            fill="rgba(76,110,215,0.85)"
          >
            {formatDuration(coord.totalSeconds)}
          </text>
          <text
            x={coord.x}
            y={height - paddingY + 16}
            fontSize={10}
            textAnchor="middle"
            fill="rgba(100,116,139,0.8)"
          >
            {coord.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

type ProductivityPanelProps = {
  onClose: () => void;
  view: "day" | "week" | "month";
  onChangeView: (view: "day" | "week" | "month") => void;
  totals: Record<"day" | "week" | "month", number>;
  weekBreakdown: { label: string; totalSeconds: number }[];
  monthBreakdown: { label: string; totalSeconds: number }[];
  recentSessions: { timestamp: Date; duration: number }[];
};

const PERIOD_TARGETS: Record<"day" | "week" | "month", number> = {
  day: SECONDS_PER_DAY,
  week: 7 * SECONDS_PER_DAY,
  month: 30 * SECONDS_PER_DAY
};

function ProductivityPanel({
  onClose,
  view,
  onChangeView,
  totals,
  weekBreakdown,
  monthBreakdown,
  recentSessions
}: ProductivityPanelProps) {
  const targetSeconds = PERIOD_TARGETS[view];
  const totalSeconds = totals[view] ?? 0;
  const focusPercentage = Math.min(100, (totalSeconds / targetSeconds) * 100);
  const pieStyle = {
    background: `conic-gradient(#4C6ED7 ${focusPercentage}%, rgba(226,232,240,0.95) ${focusPercentage}% 100%)`
  };
  const remainingSeconds = Math.max(0, targetSeconds - totalSeconds);
  const chartPoints = view === "week" ? weekBreakdown : view === "month" ? monthBreakdown : [];
  const hasChartData = chartPoints.some((point) => point.totalSeconds > 0);

  const viewTabs: Array<{ value: "day" | "week" | "month"; label: string }> = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" }
  ];

  const listItems = (() => {
    if (view === "day") {
      return recentSessions.map((session, index) => ({
        key: `session-${index}-${session.timestamp.getTime()}`,
        label: session.timestamp.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }),
        detail: formatDuration(session.duration)
      }));
    }

    const breakdown = view === "week" ? weekBreakdown : monthBreakdown;
    return breakdown.map((item, index) => ({
      key: `breakdown-${index}-${item.label}`,
      label: item.label,
      detail: formatDuration(item.totalSeconds)
    }));
  })();

  const titleMap = {
    day: "Today",
    week: "This Week",
    month: "Last 30 Days"
  } as const;

  return (
    <div className="fixed top-24 right-12 z-40 w-[360px]">
      <div className="glass-panel relative space-y-6 rounded-3xl bg-white/85 p-6 shadow-[0_35px_60px_rgba(15,23,42,0.25)]">
        <button
          type="button"
          className="absolute right-4 top-4 rounded-full bg-white/70 p-1.5 text-slate-400 transition hover:text-slate-600"
          onClick={onClose}
          aria-label="Close productivity panel"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-3 pr-8">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Focus insights</p>
          <h3 className="text-xl font-semibold text-slate-900">{titleMap[view]}</h3>
          <p className="text-xs text-slate-500">
            Total focus time resets daily at midnight and accumulates automatically from Pomodoro sessions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {viewTabs.map((tab) => {
            const isActive = tab.value === view;
            return (
              <button
                key={tab.value}
                type="button"
                className={cn(
                  "flex-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition",
                  isActive
                    ? "bg-slate-900 text-white shadow-[0_12px_25px_rgba(15,23,42,0.25)]"
                    : "bg-white/70 text-slate-500 hover:text-slate-700"
                )}
                onClick={() => onChangeView(tab.value)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {view === "day" ? (
          <div className="flex items-center gap-6">
            <div className="relative h-32 w-32 rounded-full" style={pieStyle}>
              <div className="absolute inset-[12%] rounded-full bg-white/90 shadow-inner shadow-white/70" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-sm font-semibold text-slate-500">Focus</span>
                <span className="text-lg font-semibold text-slate-900">{formatDuration(totalSeconds)}</span>
              </div>
            </div>
            <div className="flex-1 space-y-2 text-sm text-slate-600">
              <p>
                Total: <span className="font-semibold text-slate-900">{formatDuration(totalSeconds)}</span>
              </p>
              <p>
                Target: <span className="font-semibold text-slate-900">{formatDuration(targetSeconds)}</span>
              </p>
              <p>
                Remaining: <span className="font-semibold text-slate-900">{formatDuration(remainingSeconds)}</span>
              </p>
              <p>
                Completion: <span className="font-semibold text-slate-900">{focusPercentage.toFixed(0)}%</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {chartPoints.length > 0 && hasChartData ? (
              <FocusLineChart points={chartPoints} targetSeconds={targetSeconds} />
            ) : (
              <div className="flex h-36 w-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 text-sm text-slate-500">
                No records yet.
              </div>
            )}
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <p>
                Total: <span className="font-semibold text-slate-900">{formatDuration(totalSeconds)}</span>
              </p>
              <p>
                Target: <span className="font-semibold text-slate-900">{formatDuration(targetSeconds)}</span>
              </p>
              <p>
                Remaining: <span className="font-semibold text-slate-900">{formatDuration(remainingSeconds)}</span>
              </p>
              <p>
                Completion: <span className="font-semibold text-slate-900">{focusPercentage.toFixed(0)}%</span>
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            {view === "day" ? "Latest sessions" : "Breakdown"}
          </p>
          {listItems.length > 0 ? (
            <ul className="space-y-2 text-sm text-slate-600">
              {listItems.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2 shadow-inner shadow-white/60"
                >
                  <span>{item.label}</span>
                  <span className="font-semibold text-slate-900">{item.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">No records yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

type ConfirmDialogProps = ConfirmDialogConfig & {
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const confirmClass = tone === "danger"
    ? "bg-rose-500 text-white hover:bg-rose-500/90"
    : "bg-slate-900 text-white hover:bg-slate-800";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4"
      onClick={onCancel}
    >
      <div
        className="glass-panel w-full max-w-sm space-y-5 rounded-3xl bg-white/90 p-6 shadow-[0_40px_70px_rgba(15,23,42,0.4)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{description}</p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" className="bg-white/70 text-slate-600 hover:bg-white" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" className={cn("px-4", confirmClass)} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default App;

function AnimatedLoadingScreen({
  headline,
  subtext
}: {
  headline: string;
  subtext: string;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 text-slate-100">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute -top-16 left-1/3 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
      <div className="absolute bottom-[-6rem] right-[-3rem] h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.08),_transparent_60%)]" />
      <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center">
        <div className="relative h-28 w-28">
          <div className="absolute inset-0 rounded-full border-4 border-white/10" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-r-sky-400 border-t-emerald-400 animate-spin" />
          <div className="absolute inset-4 flex items-center justify-center rounded-full bg-slate-950 shadow-[0_0_35px_rgba(56,189,248,0.25)]">
            <GiPanda className="h-10 w-10 text-white" />
          </div>
        </div>
        <div className="space-y-3">
          <span className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-300">
            {headline}
          </span>
          <p className="max-w-sm text-sm text-slate-200/80">{subtext}</p>
        </div>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full w-1/3 rounded-full bg-gradient-to-r from-sky-400 via-emerald-400 to-sky-400 opacity-90 animate-loading-bar" />
        </div>
      </div>
    </div>
  );
}
