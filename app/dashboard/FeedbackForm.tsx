"use client";

import { useRef, useState, type FormEvent } from "react";

export function FeedbackForm({ preview }: { preview: boolean }) {
  const [category, setCategory] = useState("bug");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const submissionId = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || preview) return;
    setError("");
    setSuccess("");
    if (message.trim().length < 10) { setError("Please describe the issue in at least 10 characters."); return; }
    setBusy(true);
    submissionId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submissionId.current, category, message: message.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Couldn’t send your feedback. Please try again.");
      setMessage("");
      submissionId.current = null;
      setSuccess("Thank you! Your feedback has been sent to Attendly admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t send your feedback. Please try again.");
    } finally { setBusy(false); }
  }

  return <section className="card settings-card feedback-card">
    <h2>Website feedback</h2>
    <p>Report an issue or bug, or share a suggestion with Attendly admin.</p>
    <form className="feedback-form" onSubmit={submit}>
      <label className="field-label">Feedback type<select value={category} disabled={busy || preview} onChange={(event) => { setCategory(event.target.value); submissionId.current = null; }}><option value="bug">Bug or issue</option><option value="suggestion">Suggestion</option><option value="other">Other feedback</option></select></label>
      <label className="field-label">Your feedback<textarea required minLength={10} maxLength={3000} rows={5} value={message} disabled={busy || preview} placeholder="Describe what happened and what you expected…" onChange={(event) => { setMessage(event.target.value); submissionId.current = null; setSuccess(""); }} /></label>
      <p className="modal-helper">Please don’t include passwords or other sensitive information.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}
      <button className="button button-primary" type="submit" disabled={busy || preview}>{preview ? "Sign in to send feedback" : busy ? "Sending…" : "Send feedback"}</button>
    </form>
  </section>;
}
