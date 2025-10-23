import {
  Bell,
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
  Settings,
  SkipForward,
  Sparkles,
  Trash2,
  Trophy,
  X
} from "lucide-react";
import { ChangeEvent, FormEvent, MouseEvent, useEffect, useId, useMemo, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Progress } from "./components/ui/progress";
import { Separator } from "./components/ui/separator";
import { cn } from "./lib/utils";
import { useLocalStorage } from "./hooks/use-local-storage";

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
  total: string;
  completion: string;
};

type ExamPayload = Omit<ExamEntry, "id">;

type Subject = {
  id: string;
  name: string;
  exams: ExamEntry[];
};

type AppState = {
  subjects: Subject[];
  activeSubjectId: string;
};

const FOCUS_DURATION = 25 * 60;
const BREAK_DURATION = 5 * 60;

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

const sidebarItems = [
  { icon: Home, label: "Overview", gradient: "from-sky-400 to-blue-600" },
  { icon: BookOpen, label: "Papers", gradient: "from-emerald-400 to-emerald-500" },
  { icon: Bell, label: "Alerts", gradient: "from-amber-400 to-orange-500" },
  { icon: ChartBar, label: "Analytics", gradient: "from-fuchsia-400 to-purple-500" },
  { icon: Layers, label: "Resources", gradient: "from-indigo-400 to-indigo-600" },
  { icon: Settings, label: "Settings", gradient: "from-rose-400 to-rose-600" }
];

const DEFAULT_EXAMS: ExamEntry[] = [
  {
    id: "exam-1",
    paper: "2025 S2 MAIN PAPER 03",
    mcq: 15,
    essay: 0,
    total: 15,
    completion: 96
  },
  {
    id: "exam-2",
    paper: "2025 FINAL PAPER 02",
    mcq: 8,
    essay: 1,
    total: 9,
    completion: 82
  },
  {
    id: "exam-3",
    paper: "2025 FINAL PAPER 04",
    mcq: 13,
    essay: 1,
    total: 14,
    completion: 88
  },
  {
    id: "exam-4",
    paper: "2025 FINAL PAPER 05",
    mcq: 12,
    essay: 0,
    total: 12,
    completion: 74
  }
];

function cloneExam(exam: ExamEntry): ExamEntry {
  return { ...exam };
}

function isValidExam(raw: any): raw is ExamEntry {
  return (
    raw &&
    typeof raw === "object" &&
    typeof raw.id === "string" && raw.id.trim().length > 0 &&
    typeof raw.paper === "string" && raw.paper.trim().length > 0 &&
    typeof raw.mcq === "number" &&
    typeof raw.essay === "number" &&
    typeof raw.total === "number" &&
    typeof raw.completion === "number"
  );
}

function isValidSubject(raw: any): raw is Subject {
  return (
    raw &&
    typeof raw === "object" &&
    typeof raw.id === "string" && raw.id.trim().length > 0 &&
    typeof raw.name === "string" && raw.name.trim().length > 0 &&
    Array.isArray((raw as any).exams) &&
    (raw as any).exams.every(isValidExam)
  );
}

function isValidAppState(raw: any): raw is AppState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }

  if (!Array.isArray((raw as any).subjects) || (raw as any).subjects.length === 0) {
    return false;
  }

  if (typeof (raw as any).activeSubjectId !== "string") {
    return false;
  }

  const subjects = (raw as any).subjects;

  if (!subjects.every(isValidSubject)) {
    return false;
  }

  return subjects.some((subject: Subject) => subject.id === (raw as any).activeSubjectId);
}

function createDefaultState(): AppState {
  const subjectId = createId("subject");
  return {
    subjects: [
      {
        id: subjectId,
        name: "Physics",
        exams: DEFAULT_EXAMS.map(cloneExam)
      }
    ],
    activeSubjectId: subjectId
  };
}

function sanitizeExam(raw: any, index: number): ExamEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const paper = typeof raw.paper === "string" && raw.paper.trim() ? raw.paper.trim() : `Paper ${index + 1}`;
  const mcqValue = Number((raw as any).mcq ?? 0);
  const essayValue = Number((raw as any).essay ?? 0);
  const totalValue = Number((raw as any).total ?? mcqValue + essayValue);
  const completionValue = Number((raw as any).completion ?? 0);

  const mcq = Number.isFinite(mcqValue) ? mcqValue : 0;
  const essay = Number.isFinite(essayValue) ? essayValue : 0;
  const total = Number.isFinite(totalValue) ? totalValue : mcq + essay;
  const completion = Number.isFinite(completionValue)
    ? Math.min(100, Math.max(0, completionValue))
    : 0;

  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : createId("exam");

  return {
    id,
    paper,
    mcq,
    essay,
    total,
    completion
  };
}

function sanitizeSubject(raw: any, index: number): Subject | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : `Subject ${index + 1}`;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : createId("subject");
  const examsArray = Array.isArray((raw as any).exams) ? (raw as any).exams : [];
  const exams = examsArray
    .map((exam: any, examIndex: number) => sanitizeExam(exam, examIndex))
    .filter(Boolean) as ExamEntry[];

  return {
    id,
    name,
    exams
  };
}

function normalizeStoredValue(value: any): AppState {
  if (isValidAppState(value)) {
    return value;
  }

  if (value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as any).subjects)) {
    const candidate = value as AppState;
    const sanitizedSubjects: Subject[] = [];

    (candidate.subjects as any[]).forEach((subject, index) => {
      const sanitized = sanitizeSubject(subject, index);
      if (sanitized) {
        sanitizedSubjects.push(sanitized);
      }
    });

    if (sanitizedSubjects.length === 0) {
      return createDefaultState();
    }

    let activeSubjectId = typeof candidate.activeSubjectId === "string" && candidate.activeSubjectId.trim()
      ? candidate.activeSubjectId
      : sanitizedSubjects[0].id;

    if (!sanitizedSubjects.some((subject) => subject.id === activeSubjectId)) {
      activeSubjectId = sanitizedSubjects[0].id;
    }

    return {
      subjects: sanitizedSubjects,
      activeSubjectId
    };
  }

  if (Array.isArray(value)) {
    const subjectId = createId("subject");
    const exams = value
      .map((exam, index) => sanitizeExam(exam, index))
      .filter(Boolean) as ExamEntry[];

    return {
      subjects: [
        {
          id: subjectId,
          name: "Physics",
          exams
        }
      ],
      activeSubjectId: subjectId
    };
  }

  return createDefaultState();
}

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
  total: "",
  completion: ""
});

function prepareExamPayload(form: ExamFormState): ExamPayload | null {
  const paper = form.paper.trim();
  if (!paper) {
    return null;
  }

  const mcqValue = Number(form.mcq);
  const essayValue = Number(form.essay);
  const totalInput = form.total ? Number(form.total) : mcqValue + essayValue;
  const completionValue = Number(form.completion);

  const mcq = Number.isFinite(mcqValue) ? Math.max(0, mcqValue) : 0;
  const essay = Number.isFinite(essayValue) ? Math.max(0, essayValue) : 0;
  const totalCandidate = Number.isFinite(totalInput) ? totalInput : mcq + essay;
  const total = Math.max(0, totalCandidate);
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
    total: exam.total.toString(),
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
  const defaultStateRef = useRef<AppState>();
  if (!defaultStateRef.current) {
    defaultStateRef.current = createDefaultState();
  }

  const [storedValue, setStoredValue] = useLocalStorage<any>(
    "marks-analyze-exams",
    defaultStateRef.current
  );

  const normalizedState = useMemo(() => normalizeStoredValue(storedValue), [storedValue]);

  useEffect(() => {
    if (normalizedState !== storedValue) {
      setStoredValue(normalizedState);
    }
  }, [normalizedState, storedValue, setStoredValue]);

  const updateState = (updater: (current: AppState) => AppState) => {
    setStoredValue((previous: any) => {
      const base = normalizeStoredValue(previous);
      return updater(base);
    });
  };

  const state: AppState = normalizedState;
  const subjects = state.subjects;
  const activeSubject =
    subjects.find((subject) => subject.id === state.activeSubjectId) ?? subjects[0];

  const exams = activeSubject?.exams ?? [];

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
  const [completedPomodoros, setCompletedPomodoros] = useState(0);

  useEffect(() => {
    setForm(createEmptyForm());
    setEditingId(null);
    setEditForm(createEmptyForm());
  }, [state.activeSubjectId]);

  useEffect(() => {
    if (!timerOpen) {
      setIsRunning(false);
    }
  }, [timerOpen]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    if (secondsLeft <= 0) {
      setIsRunning(false);
      if (sessionType === "focus") {
        setCompletedPomodoros((count) => count + 1);
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
  }, [isRunning, secondsLeft, sessionType]);

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

  const examSummaries = useMemo(() => exams.slice(0, 4), [exams]);

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

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddExam = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = prepareExamPayload(form);
    if (!payload) {
      return;
    }

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `exam-${Date.now()}`;

    const newExam: ExamEntry = {
      id,
      ...payload
    };

    if (!activeSubject) {
      return;
    }

    updateState((current) => ({
      ...current,
      subjects: current.subjects.map((subject) =>
        subject.id === activeSubject.id
          ? { ...subject, exams: [newExam, ...subject.exams] }
          : subject
      )
    }));
    setForm(createEmptyForm());
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

  const handleUpdateExam = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) {
      return;
    }

    const payload = prepareExamPayload(editForm);
    if (!payload) {
      return;
    }

    if (!activeSubject) {
      setEditingId(null);
      setEditForm(createEmptyForm());
      return;
    }

    updateState((current) => ({
      ...current,
      subjects: current.subjects.map((subject) => {
        if (subject.id !== activeSubject.id) {
          return subject;
        }

        return {
          ...subject,
          exams: subject.exams.map((exam) =>
            exam.id === editingId ? { ...exam, ...payload } : exam
          )
        };
      })
    }));
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

    updateState((current) => ({
      ...current,
      subjects: current.subjects.map((subject) =>
        subject.id === activeSubject.id
          ? { ...subject, exams: subject.exams.filter((exam) => exam.id !== id) }
          : subject
      )
    }));
    if (editingId === id) {
      setEditingId(null);
      setEditForm(createEmptyForm());
    }
  };

  const handleSubjectSelect = (subjectId: string) => {
    updateState((current) => {
      if (current.activeSubjectId === subjectId) {
        return current;
      }

      if (!current.subjects.some((subject) => subject.id === subjectId)) {
        return current;
      }

      return {
        ...current,
        activeSubjectId: subjectId
      };
    });
  };

  const handleToggleSubjectForm = () => {
    setIsAddingSubject((previous) => !previous);
    setNewSubjectName("");
  };

  const handleCreateSubject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newSubjectName.trim();
    if (!name) {
      return;
    }

    const subjectId = createId("subject");

    updateState((current) => ({
      subjects: [
        ...current.subjects,
        {
          id: subjectId,
          name,
          exams: []
        }
      ],
      activeSubjectId: subjectId
    }));

    setNewSubjectName("");
    setIsAddingSubject(false);
  };

  const handleSubjectNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNewSubjectName(event.target.value);
  };

  const handleSidebarClick = (label: string) => {
    if (label === "Papers") {
      setLibraryOpen(true);
      return;
    }

    if (label === "Alerts") {
      setTimerOpen((previous) => !previous);
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
    setCompletedPomodoros(0);
  };

  const handleSkipSession = () => {
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
                            <Label htmlFor={`edit-total-${exam.id}`}>Total</Label>
                            <Input
                              id={`edit-total-${exam.id}`}
                              name="total"
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.001"
                              value={editForm.total}
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
                  Save a paper to populate this list.
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
            >
              <LogOut className="h-6 w-6" />
            </button>
          </aside>

        <div className="flex-1 space-y-6">
          <header className="glass-panel flex flex-col gap-5 px-6 py-6 md:flex-row md:items-center md:justify-between md:px-10">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.25)]">
                <Sparkles className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Anuradha Perera
                </p>
                <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
                  Paper Marks Analyze
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
              <Button variant="ghost" className="glass-panel px-5 py-2 text-slate-700 shadow-none">
                Set as default
              </Button>
              <Separator className="hidden h-10 w-px md:block" />
              <div className="glass-panel flex items-center gap-3 px-4 py-2">
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
                <Avatar>
                  <AvatarImage src="https://i.pravatar.cc/80?img=32" alt="Gimhan Perera" />
                  <AvatarFallback>GP</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Gimhan Perera</p>
                  <p className="text-xs text-slate-400">Physics Stream</p>
                </div>
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
                      <Label htmlFor="total">Total (optional)</Label>
                      <Input
                        id="total"
                        name="total"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={form.total}
                        onChange={handleInputChange}
                        placeholder="17.5"
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
                        Tip: totals default to MCQ + essay if left blank. Clearing browser storage resets the
                        dashboard.
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
                    <p className="text-sm text-slate-500">
                      Add papers to see how your completion percentage stacks up.
                    </p>
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
                      <p className="text-sm text-slate-500">
                        Save a paper above to populate your recap board.
                      </p>
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
          ජීවිතය❤ Physics - Anuradha Perera · Crafted with curiosity by Single Developers
        </p>
      </footer>
    </div>

      {timerOpen && (
        <PomodoroTimer
          open={timerOpen}
          onClose={handleCloseTimer}
          sessionType={sessionType}
          secondsLeft={secondsLeft}
          isRunning={isRunning}
          onStartPause={handleStartPauseTimer}
          onReset={handleResetTimer}
          onSkip={handleSkipSession}
          onSelectSession={handleSessionSelect}
          completedPomodoros={completedPomodoros}
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

export default App;

type PomodoroTimerProps = {
  open: boolean;
  onClose: () => void;
  sessionType: "focus" | "break";
  secondsLeft: number;
  isRunning: boolean;
  onStartPause: () => void;
  onReset: () => void;
  onSkip: () => void;
  onSelectSession: (type: "focus" | "break") => void;
  completedPomodoros: number;
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
  completedPomodoros
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
    <div className="fixed bottom-12 left-[128px] z-40">
      <div className="glass-panel relative w-[320px] space-y-5 rounded-3xl bg-white/85 p-6 shadow-[0_30px_60px_rgba(15,23,42,0.25)]">
        <button
          type="button"
          className="absolute right-4 top-4 rounded-full bg-white/70 p-1.5 text-slate-400 transition hover:text-slate-600"
          onClick={onClose}
          aria-label="Close Pomodoro timer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Pomodoro</p>
          <h3 className="text-xl font-semibold text-slate-900">{sessionType === "focus" ? "Focus Sprint" : "Break Time"}</h3>
          <p className="text-xs text-slate-500">
            Completed cycles today: <span className="font-semibold text-slate-700">{completedPomodoros}</span>
          </p>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 shadow-inner shadow-white/60">
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]",
              sessionType === "focus"
                ? "bg-slate-900 text-white shadow-[0_12px_25px_rgba(15,23,42,0.25)]"
                : "bg-transparent text-slate-500 hover:text-slate-700"
            )}
            onClick={() => onSelectSession("focus")}
          >
            Focus
          </button>
          <span className="text-lg font-semibold text-slate-900">{formatTime(secondsLeft)}</span>
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]",
              sessionType === "break"
                ? "bg-emerald-500 text-white shadow-[0_12px_25px_rgba(16,185,129,0.35)]"
                : "bg-transparent text-slate-500 hover:text-slate-700"
            )}
            onClick={() => onSelectSession("break")}
          >
            Break
          </button>
        </div>

        <Progress
          value={progress}
          className="h-3 bg-white/60"
          indicatorClassName={cn(
            "bg-gradient-to-r",
            sessionType === "focus"
              ? "from-slate-900 via-brand-primary to-brand-secondary"
              : "from-emerald-400 via-emerald-500 to-teal-500"
          )}
        />

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_30px_rgba(15,23,42,0.25)] transition hover:bg-slate-800"
            onClick={onStartPause}
          >
            {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {isRunning ? "Pause" : "Start"}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full bg-white/80 p-2 text-slate-500 transition hover:text-slate-700"
              onClick={onSkip}
              aria-label="Skip session"
            >
              <SkipForward className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-full bg-white/80 p-2 text-slate-500 transition hover:text-slate-700"
              onClick={onReset}
              aria-label="Reset timer"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
