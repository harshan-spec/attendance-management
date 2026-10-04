"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import type { StudentAcademicProfile } from "@/lib/svce-timetable";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export interface AttendlyUser {
  id: string;
  email: string;
  name: string;
  isPreview: boolean;
  academicProfile?: StudentAcademicProfile | null;
}

interface AuthContextValue {
  user: AttendlyUser | null;
  ready: boolean;
  supabaseConfigured: boolean;
  enterPreview: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, phoneNumber: string, academicProfile: StudentAcademicProfile) => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const previewStorageKey = "attendly-preview-user";
const previewAcademicProfile: StudentAcademicProfile = {
  department: "Computer Science Engineering",
  departmentCode: "cse",
  section: "A",
  sectionCode: "A",
  studyYear: 3,
  semester: 5,
  academicYear: "2026-27",
  academicYearCode: "2026",
  collegeTimetableUrl: "https://www.svce.ac.in/timetable/files/cse/cse_2026_3rd_year_odd_A.pdf",
};
const AuthContext = createContext<AuthContextValue | null>(null);

function getSavedPreviewUser(): AttendlyUser | null {
  try {
    const savedUser = localStorage.getItem(previewStorageKey);
    if (!savedUser) return null;
    const user = JSON.parse(savedUser) as AttendlyUser;
    if (user.isPreview && !user.academicProfile) {
      const upgradedUser = { ...user, academicProfile: previewAcademicProfile };
      localStorage.setItem(previewStorageKey, JSON.stringify(upgradedUser));
      return upgradedUser;
    }
    return user;
  } catch {
    try { localStorage.removeItem(previewStorageKey); } catch { /* Storage can be disabled by the browser. */ }
    return null;
  }
}

function mapSupabaseUser(user: User): AttendlyUser {
  const metadata = user.user_metadata?.academic_profile;
  let academicProfile: StudentAcademicProfile | null = null;
  if (metadata && typeof metadata === "object") {
    const profile = metadata as Partial<StudentAcademicProfile>;
    const profileFieldsPresent = typeof profile.department === "string" &&
      typeof profile.departmentCode === "string" &&
      typeof profile.section === "string" &&
      typeof profile.sectionCode === "string" &&
      Number.isInteger(profile.studyYear) &&
      Number.isInteger(profile.semester) &&
      typeof profile.academicYear === "string" &&
      typeof profile.academicYearCode === "string";
    let timetableUrl: string | null = null;
    if (typeof profile.collegeTimetableUrl === "string") {
      try {
        const parsedUrl = new URL(profile.collegeTimetableUrl);
        if (parsedUrl.origin === "https://www.svce.ac.in" && parsedUrl.pathname.startsWith("/timetable/files/") && parsedUrl.pathname.toLowerCase().endsWith(".pdf")) {
          timetableUrl = parsedUrl.toString();
        }
      } catch {
        timetableUrl = null;
      }
    }
    if (profileFieldsPresent) academicProfile = { ...profile as StudentAcademicProfile, collegeTimetableUrl: timetableUrl };
  }
  return {
    id: user.id,
    email: user.email ?? "",
    name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Student",
    isPreview: false,
    academicProfile,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AttendlyUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setUser(getSavedPreviewUser());
      setReady(true);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let alive = true;
    supabase.auth.getSession()
      .then(({ data }) => {
        if (alive) {
          setUser(data.session ? mapSupabaseUser(data.session.user) : getSavedPreviewUser());
          setReady(true);
        }
      })
      .catch(() => {
        if (alive) {
          setUser(getSavedPreviewUser());
          setReady(true);
        }
      });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (alive) {
        setUser((current) => session
          ? mapSupabaseUser(session.user)
          : event === "SIGNED_OUT"
            ? null
            : current?.isPreview ? current : getSavedPreviewUser());
        setReady(true);
      }
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const enterPreview = useCallback(() => {
    const previewUser: AttendlyUser = {
      id: "preview-student",
      email: "maya@attendly.preview",
      name: "Maya Rao",
      isPreview: true,
      academicProfile: previewAcademicProfile,
    };
    try { localStorage.setItem(previewStorageKey, JSON.stringify(previewUser)); } catch { /* The in-memory preview can still be used. */ }
    setUser(previewUser);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string, phoneNumber: string, academicProfile: StudentAcademicProfile) => {
    const supabase = getSupabaseBrowserClient();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, phone_number: phoneNumber, academic_profile: academicProfile },
        emailRedirectTo: redirectTo.toString(),
      },
    });
    if (error) throw error;
    if (data.session) setUser(mapSupabaseUser(data.session.user));
    return !data.session;
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const supabase = getSupabaseBrowserClient();
    const redirectTo = new URL("/auth/recovery-callback", window.location.origin);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo.toString(),
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
    if (error) throw error;
    await fetch("/api/auth/recovery", { method: "DELETE" });
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    if (!user || user.isPreview || !isSupabaseConfigured) {
      throw new Error("Sign in to a real Attendly account before deleting it.");
    }

    const supabase = getSupabaseBrowserClient();
    const { error: passwordError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (passwordError) throw new Error("The password could not be verified. Check it and try again.");

    const { error } = await supabase.functions.invoke("delete-attendly-account", { body: {} });
    if (error) throw new Error("Your account could not be deleted. Please try again.");

    try {
      await supabase.auth.signOut({ scope: "local" });
    } finally {
      setUser(null);
    }
  }, [user]);

  const signOut = useCallback(async () => {
    if (user?.isPreview) {
      try { localStorage.removeItem(previewStorageKey); } catch { /* The in-memory preview can still be signed out. */ }
      setUser(null);
      return;
    }
    if (isSupabaseConfigured) {
      const { error } = await getSupabaseBrowserClient().auth.signOut();
      if (error) throw error;
    }
    try { localStorage.removeItem(previewStorageKey); } catch { /* The Supabase session has already been signed out. */ }
    setUser(null);
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      supabaseConfigured: isSupabaseConfigured,
      enterPreview,
      signIn,
      signUp,
      sendPasswordReset,
      updatePassword,
      deleteAccount,
      signOut,
    }),
    [user, ready, enterPreview, signIn, signUp, sendPasswordReset, updatePassword, deleteAccount, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAttendlyAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAttendlyAuth must be used inside AuthProvider.");
  return context;
}
