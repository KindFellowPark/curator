'use client';

import { useState } from 'react';

export type Question = {
  id: string;
  question: string;
  provenance: string | null;
};

/**
 * One question, quietly placed, always skippable.
 *
 * No count and no progress bar, deliberately. The queue is ranked by information value
 * rather than completeness, so a "3 of 47" would be both meaningless and a chore — it
 * would turn a question worth answering into a backlog worth avoiding, and the surface
 * only works while it stays optional.
 *
 * Skip is a real answer and is recorded: the same question is never offered again. That
 * is why the control says "Skip" rather than "Later".
 */
export default function QuestionCard({
  q,
  onDone,
}: {
  q: Question;
  onDone: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/question', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `${res.status}`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="question-card" aria-label="Question">
      <p className="question-text">{q.question}</p>

      <label className="field">
        <span className="field-label">Answer (optional — skip is fine)</span>
        <textarea
          className="input"
          rows={2}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="However much you want to say"
        />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="sheet-actions">
        <button type="button" className="btn-quiet" disabled={busy}
                onClick={() => send({ id: q.id, skip: true })}>
          Skip
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !answer.trim()}
          onClick={() => send({ id: q.id, answer })}
        >
          {busy ? 'Staging…' : 'Answer'}
        </button>
      </div>
    </section>
  );
}
