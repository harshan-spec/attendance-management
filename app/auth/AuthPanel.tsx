"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAttendlyAuth } from "@/lib/auth-context";
import { SVCE_FALLBACK_OPTIONS, type StudentAcademicProfile, type SvceTimetableOptions } from "@/lib/svce-timetable";
import { PublicLegalLinks } from "@/app/legal/PublicLegalLinks";
import { safeLoginRedirect } from "@/lib/auth-redirect";

type AuthMode = "login" | "signup" | "forgot" | "update";

const phoneNumberPattern = /^\+?[0-9][0-9 ()-]{6,24}$/;

const copy = {
  login: { heading: "Welcome back", detail: "Sign in to pick up where you left off." },
  signup: { heading: "Create your account", detail: "A clearer view of your semester starts here." },
  forgot: { heading: "Reset your password", detail: "We’ll send a secure link to your email." },
  update: { heading: "Choose a new password", detail: "Set a new password for your Attendly account." },
} satisfies Record<AuthMode, { heading: string; detail: string }>;

export function AuthPanel({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { user, ready, signIn, signUp, sendPasswordReset, updatePassword, enterPreview, supabaseConfigured } = useAttendlyAuth();
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recoveryVerified, setRecoveryVerified] = useState(false);
  const [recoveryChecking, setRecoveryChecking] = useState(false);
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [academicOptions, setAcademicOptions] = useState<SvceTimetableOptions>(SVCE_FALLBACK_OPTIONS);
  const [department, setDepartment] = useState("");
  const [academicYear, setAcademicYear] = useState(SVCE_FALLBACK_OPTIONS.academicYears.at(-1)?.value ?? "");
  const [studyYear, setStudyYear] = useState("");
  const [semester, setSemester] = useState("");
  const [section, setSection] = useState("none");
  const [collegeTimetableUrl, setCollegeTimetableUrl] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "login") return;
    try {
      if (window.sessionStorage.getItem("attendly-account-deleted") === "1") {
        window.sessionStorage.removeItem("attendly-account-deleted");
        setSuccess("Your account and saved attendance data have been deleted.");
      }
    } catch {
      // Login still works when browser session storage is disabled.
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "update" || !supabaseConfigured) return;
    let alive = true;
    setRecoveryChecking(true);
    fetch("/api/auth/recovery", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { verified?: boolean }) => {
        if (alive) setRecoveryVerified(result.verified === true);
      })
      .catch(() => {
        if (alive) setRecoveryVerified(false);
      })
      .finally(() => {
        if (alive) setRecoveryChecking(false);
      });
    return () => { alive = false; };
  }, [mode, supabaseConfigured]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "verification") {
      if (mode === "forgot") setError("That recovery link could not be verified. Request a fresh email link and open it in this browser.");
      if (mode === "login") setError("That email confirmation link is invalid or expired. Open the latest verification email, or try signing in if your email is already verified.");
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "signup") return;
    const controller = new AbortController();
    fetch("/api/svce-timetable?mode=options", { signal: controller.signal })
      .then((response) => response.json())
      .then((result: { options?: SvceTimetableOptions; currentAcademicYear?: string }) => {
        if (controller.signal.aborted || !result.options?.academicYears?.length) return;
        setAcademicOptions(result.options);
        setAcademicYear(result.currentAcademicYear || result.options.academicYears.at(-1)?.value || "");
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [mode]);

  useEffect(() => {
    setCollegeTimetableUrl(null);
    if (mode !== "signup" || signupStep !== 2 || !department || !academicYear || !studyYear || !semester) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ department, academicYear, studyYear, semester, section });
    fetch(`/api/svce-timetable?${params.toString()}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((result: { found?: boolean; pdfUrl?: string }) => {
        if (controller.signal.aborted) return;
        setCollegeTimetableUrl(result.found && typeof result.pdfUrl === "string" ? result.pdfUrl : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCollegeTimetableUrl(null);
      });
    return () => controller.abort();
  }, [mode, signupStep, department, academicYear, studyYear, semester, section]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      if (mode === "signup" && signupStep === 1) {
        if (!phoneNumberPattern.test(phoneNumber.trim())) {
          setError("Enter a valid phone number, including the country code if needed.");
          return;
        }
        setSignupStep(2);
        return;
      } else if (mode === "signup") {
        const selectedDepartment = academicOptions.departments.find((option) => option.value === department);
        const selectedAcademicYear = academicOptions.academicYears.find((option) => option.value === academicYear);
        const selectedSection = academicOptions.sections.find((option) => option.value === section);
        const yearNumber = Number(studyYear);
        const semesterNumber = Number(semester);
        if (!selectedDepartment || !selectedAcademicYear || !selectedSection || !Number.isInteger(yearNumber) || !Number.isInteger(semesterNumber) || Math.ceil(semesterNumber / 2) !== yearNumber) {
          setError("Complete your academic profile to continue.");
          return;
        }
        const academicProfile: StudentAcademicProfile = {
          department: selectedDepartment.label,
          departmentCode: selectedDepartment.value,
          section: selectedSection.label,
          sectionCode: selectedSection.value,
          studyYear: yearNumber,
          semester: semesterNumber,
          academicYear: selectedAcademicYear.label,
          academicYearCode: selectedAcademicYear.value,
          collegeTimetableUrl,
        };
        const needsConfirmation = await signUp(name.trim(), email.trim(), password, phoneNumber.trim(), academicProfile);
        if (needsConfirmation) {
          setSuccess("Click the verification link sent to your email to verify your account and open your Attendly workspace.");
        } else {
          router.push("/dashboard");
        }
      } else if (mode === "login") {
        await signIn(email, password);
        const requestedPath = new URLSearchParams(window.location.search).get("next");
        const next = safeLoginRedirect(requestedPath, window.location.origin);
        router.push(next);
      } else if (mode === "update") {
        if (!recoveryVerified) {
          setError("Verify your recovery link from your email before choosing a new password.");
          return;
        }
        if (password !== confirmPassword) {
          setError("Those passwords don’t match.");
          return;
        }
        await updatePassword(password);
        setSuccess("Your password has been updated.");
        router.push("/dashboard");
      } else {
        await sendPasswordReset(email);
        setSuccess("If that address has an account, a verification link is on its way. Open it to verify your email and choose a new password.");
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong. Please try again.";
      const requestingEmail = mode === "signup" || mode === "forgot";
      const emailRateLimited = /rate.?limit|too many requests|request this after \d+ seconds/i.test(message);
      const emailDeliveryFailed = /error sending .*email|failed to send .*email/i.test(message);
      setError(requestingEmail && emailRateLimited
        ? "Wait at least a minute before requesting another email for this address. Then check your inbox and spam folder."
        : requestingEmail && emailDeliveryFailed
          ? "Attendly could not send the email just now. Wait a minute and try again; if it continues, email delivery may be temporarily unavailable."
          : message);
    } finally {
      setBusy(false);
    }
  }

  function startPreview() {
    enterPreview();
    router.push("/dashboard?preview=1");
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Attendly overview">
        <Link href="/login" className="brand brand-on-dark" aria-label="Attendly home">
          <span className="brand-mark"><IconCheck /></span>
          <span>attendly<span className="brand-period">.</span></span>
        </Link>
        <div className="auth-story-copy">
          <div className="eyebrow auth-eyebrow"><span className="eyebrow-line" /> YOUR SEMESTER, IN VIEW</div>
          <h1>Show up for<br />what matters.</h1>
          <p>Know where you stand, one class at a time.</p>
        </div>
        <div className="auth-formula-card">
          <div className="formula-card-top"><span>ATTENDANCE, MADE CLEAR</span><span className="formula-spark">✳</span></div>
          <div className="formula-equation"><span>Classes attended</span><i>÷</i><span>Classes conducted</span><b>× 100</b></div>
          <div className="formula-rule" />
          <div className="formula-targets"><span><b>80%</b> overall target</span><span><b>75%</b> per subject</span></div>
        </div>
        <div className="auth-story-footer"><span>Attendance that adds up.</span><span>01 — 04</span></div>
      </section>

      <section className="auth-form-side">
        <div className="auth-mobile-brand">
          <Link href="/login" className="brand" aria-label="Attendly home">
            <span className="brand-mark"><IconCheck /></span><span>attendly<span className="brand-period">.</span></span>
          </Link>
        </div>
        <div className="auth-form-wrap">
          <div className="auth-form-heading">
            <div className="eyebrow auth-form-eyebrow">{mode === "signup" ? signupStep === 1 ? "A BETTER SEMESTER STARTS HERE" : "YOUR ACADEMIC PROFILE" : mode === "update" ? "SECURE ACCOUNT RECOVERY" : "YOUR ATTENDANCE SPACE"}</div>
            <h2>{mode === "signup" && signupStep === 2 ? "Your semester" : copy[mode].heading}</h2>
            <p>{mode === "signup" && signupStep === 2 ? "Add your department and current semester details." : copy[mode].detail}</p>
          </div>

          {mode === "signup" && <div className="signup-progress" aria-label={`Signup step ${signupStep} of 2`}>
            <span className={signupStep === 1 ? "active" : "complete"}><b>1</b>Account</span><i/><span className={signupStep === 2 ? "active" : ""}><b>2</b>Academic profile</span>
          </div>}

          <form className="auth-form" onSubmit={onSubmit}>
            {mode === "signup" && signupStep === 2 ? <div className="signup-profile-grid">
              <label className="field-label signup-department-field">Department
                <select required value={department} onChange={(event) => setDepartment(event.target.value)}>
                  <option value="">Choose your department</option>{academicOptions.departments.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="field-label">Academic year
                <select required value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
                  <option value="">Choose academic year</option>{academicOptions.academicYears.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="field-label">Year
                <select required value={studyYear} onChange={(event) => { setStudyYear(event.target.value); setSemester(""); }}>
                  <option value="">Choose year</option>{academicOptions.years.map((option, index) => <option value={String(index + 1)} key={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="field-label">Semester
                <select required value={semester} disabled={!studyYear} onChange={(event) => setSemester(event.target.value)}>
                  <option value="">Choose semester</option>{(studyYear ? [Number(studyYear) * 2 - 1, Number(studyYear) * 2] : []).map((value) => <option value={String(value)} key={value}>{value}</option>)}
                </select>
              </label>
              <label className="field-label">Section
                <select required value={section} onChange={(event) => setSection(event.target.value)}>
                  {academicOptions.sections.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div> : <>
              {mode === "signup" && <label className="field-label">
                Full name
                <input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
              </label>}
              {mode === "signup" && <label className="field-label">
                Phone number
                <input autoComplete="tel" inputMode="tel" type="tel" required minLength={7} maxLength={25} value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+91 98765 43210" />
              </label>}
              {mode !== "update" && <label className="field-label">
                Email address
                <input autoComplete="email" inputMode="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@svce.ac.in" />
              </label>}
              {mode !== "forgot" && <label className="field-label">
                <span className="label-row"><span>{mode === "update" ? "New password" : "Password"}</span>{mode === "login" && <Link href="/forgot-password">Forgot password?</Link>}</span>
                <input autoComplete={mode === "login" ? "current-password" : "new-password"} type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
              </label>}
              {mode === "update" && <label className="field-label">Confirm new password<input autoComplete="new-password" type="password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again"/></label>}
            </>}

            {error && <p className="form-message form-error" role="alert">{error}</p>}
            {success && <p className="form-message form-success" role="status">{success}</p>}
            {mode === "update" && recoveryChecking && <p className="form-message" role="status">Verifying your secure email recovery link…</p>}
            {mode === "update" && ready && !recoveryChecking && (!user || !recoveryVerified) && <p className="form-message form-error" role="alert">This recovery link is invalid or expired. Request a new verification link to continue.</p>}
            {!supabaseConfigured && (
              <p className="auth-preview-note"><span className="mini-info">i</span> {mode === "update" ? "Connect Supabase Auth before verifying a recovery link." : "Preview mode is on. Real accounts activate when Supabase is connected."}</p>
            )}
            {mode === "signup" ? signupStep === 1 ? <button className="button button-dark auth-submit" type="submit" disabled={busy}>Continue <ArrowRight /></button> : <div className="signup-step-actions">
              <button className="button button-outline" type="button" onClick={() => { setError(""); setSignupStep(1); }}>Back</button>
              <button className="button button-dark" type="submit" disabled={busy || !supabaseConfigured || !department || !academicYear || !studyYear || !semester}>
                {busy ? "Please wait…" : "Create account"}{!busy && <ArrowRight />}
              </button>
            </div> : <button className="button button-dark auth-submit" type="submit" disabled={busy || !supabaseConfigured || (mode === "update" && (!ready || !user || !recoveryVerified || recoveryChecking))}>
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "forgot" ? "Send reset link" : "Save new password"}
              {!busy && <ArrowRight />}
            </button>}
          </form>

          {(!supabaseConfigured || process.env.NODE_ENV === "development") && mode === "login" && (
            <div className="preview-divider"><span>or</span></div>
          )}
          {(!supabaseConfigured || process.env.NODE_ENV === "development") && mode === "login" && (
            <button className="button button-outline auth-preview-button" onClick={startPreview} type="button">
              Explore the local preview <ArrowRight />
            </button>
          )}

          <div className="auth-switch">
            {mode === "login" ? <>New to Attendly? <Link href="/signup">Create an account</Link></> : mode === "signup" ? <>Already have an account? <Link href="/login">Sign in</Link></> : <>Remember your password? <Link href="/login">Back to sign in</Link></>}
          </div>
          <Link href="/attendance-calculator" className="auth-calculator-link">Try the public attendance calculator <ArrowUpRight /></Link>
        </div>
        <div className="auth-footnote"><span>Private by design</span><PublicLegalLinks className="auth-legal-links" /></div>
      </section>
    </main>
  );
}

function IconCheck() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7" /></svg>;
}

function ArrowRight() {
  return <svg className="icon-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M12 6l6 6-6 6" /></svg>;
}

function ArrowUpRight() {
  return <svg className="icon-arrow-up" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg>;
}
