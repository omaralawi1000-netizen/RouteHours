"use client";

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, Sparkles, X } from 'lucide-react';
import { dateInZone, timeInZone, shiftWarnings, zonedInstant } from '@/lib/ledger';
import { validateVoicePlan, proposedShifts, type VoicePlan } from '@/lib/voice-plan';
import { durationLabel, minutesBetween, type Shift } from '@/lib/time';
import { useOnlineStatus } from './offline-status';
import { useSheetDismiss } from './use-sheet-dismiss';

function intervalSummary(start: string, end: string, zone: string) {
  const format = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const startDate = format.format(new Date(start));
  const sameDay = dateInZone(start, zone) === dateInZone(end, zone);
  return {
    times: `${startDate} · ${timeInZone(start, zone)}–${sameDay ? '' : `${format.format(new Date(end))} · `}${timeInZone(end, zone)}`,
    duration: durationLabel(minutesBetween(start, end)),
  };
}

function proposalSummary(entry: VoicePlan['entries'][number], zone: string) {
  try {
    const start = zonedInstant(entry.start, zone, true), end = zonedInstant(entry.end, zone, true);
    const elapsed = Date.parse(end) - Date.parse(start);
    if (elapsed <= 0 || elapsed > 24 * 3600000) throw new Error('Choose a finish after the start, within 24 hours.');
    return { ...intervalSummary(start, end, zone), error: '' };
  } catch (error) {
    return { times: '', duration: '', error: error instanceof Error ? error.message : 'Choose a valid start and finish.' };
  }
}

export default function VoiceReview({ transcript, shifts, zone, apiKey, accessCode, onClose, onApply }: { transcript: string; shifts: Shift[]; zone: string; apiKey: string; accessCode: string; onClose: () => void; onApply: (shifts: Shift[]) => void }) {
  const [text, setText] = useState(transcript), [plan, setPlan] = useState<VoicePlan | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [warningAccepted, setWarningAccepted] = useState(false);
  const pendingRequest = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const online = useOnlineStatus();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { dismiss, closing } = useSheetDismiss(dialogRef, onClose, () => {
    requestGeneration.current += 1;
    pendingRequest.current?.abort();
    return true;
  });

  useEffect(() => {
    requestGeneration.current += 1;
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    if (!closing) { setBusy(false); setPlan(null); setWarningAccepted(false); setError(''); }
    return () => {
      requestGeneration.current += 1;
      pendingRequest.current?.abort();
      pendingRequest.current = null;
    };
  }, [shifts, zone, apiKey, accessCode, closing]);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); dismiss();
    }
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [dismiss]);

  function changeWords(value: string) {
    requestGeneration.current += 1;
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    setText(value); setBusy(false); setPlan(null); setWarningAccepted(false); setError('');
  }

  async function interpret() {
    if (closing || !online || !text.trim()) return;
    pendingRequest.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestGeneration.current;
    pendingRequest.current = controller;
    setBusy(true); setError(''); setPlan(null); setWarningAccepted(false);
    try {
      const context = JSON.stringify({ today: dateInZone(Date.now(), zone), zone, shifts: shifts.slice().sort((a,b) => b.start.localeCompare(a.start)).slice(0,60).map(s => ({ id: s.id, start: `${dateInZone(s.start,zone)}T${timeInZone(s.start,zone)}`, end: `${dateInZone(s.end,zone)}T${timeInZone(s.end,zone)}` })) });
      const response = await fetch('/api/voice-plan', { method: 'POST', headers: { 'content-type': 'application/json', 'x-app-access-token': accessCode }, signal: controller.signal, body: JSON.stringify({ transcript: text, context, apiKey }) });
      const result = await response.json();
      if (requestId !== requestGeneration.current || controller.signal.aborted) return;
      if (!response.ok) throw new Error(result.error || 'Could not interpret the request.');
      setPlan(validateVoicePlan(result));
    } catch (e) {
      if (requestId === requestGeneration.current && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Try again. Your words are still here.');
    } finally {
      if (requestId === requestGeneration.current) { pendingRequest.current = null; setBusy(false); }
    }
  }

  function apply() {
    try {
      if (closing || !plan || plan.action === 'clarify') return;
      const proposed = proposedShifts(plan, shifts, zone);
      const combined = [...shifts.filter(s => !proposed.some(p => p.id === s.id)), ...proposed];
      if (!warningAccepted && shiftWarnings(combined).some(w => w.ids.some(id => proposed.some(p => p.id === id)))) { setWarningAccepted(true); setError('These times overlap another shift or exceed 12 hours. Review them, then confirm again only if they are correct.'); return; }
      onApply(combined); dismiss();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save these times. Check them and try again.'); }
  }

  const summaries = plan && plan.action !== 'clarify' ? plan.entries.map(entry => proposalSummary(entry, zone)) : [];
  const invalidProposal = summaries.some(summary => summary.error) || Boolean(plan?.action === 'edit' && plan.entries.some(entry => !shifts.some(shift => shift.id === entry.id)));

  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) dismiss(); }}><div ref={dialogRef} className="modal voice-review" role="dialog" aria-modal="true" aria-labelledby="voice-review-title">
    <div className="modal-head"><h2 id="voice-review-title">Review spoken hours</h2><button className="icon-btn" disabled={closing} aria-label="Close voice review" onClick={dismiss}><X size={20}/></button></div>
    <div className="modal-body">
      <label>Your words<textarea autoFocus value={text} disabled={closing} maxLength={2000} onChange={e => changeWords(e.target.value)} aria-describedby="voice-review-hint" placeholder="Yesterday 07:00–09:00 and 13:00–15:00"/></label>
      <p className="muted voice-review-hint" id="voice-review-hint">English or Danish · {zone}. Check the times before saving.</p>
      <button className="secondary-btn voice-review-action" aria-busy={busy} disabled={busy || closing || !text.trim() || !online} onClick={() => void interpret()}>{busy ? <LoaderCircle size={17} className="spin"/> : <Sparkles size={17}/>}<span role={busy ? 'status' : undefined}>{busy ? 'Understanding your hours…' : 'Interpret hours'}</span></button>
      {!online && <p className="muted" role="status">Connect to interpret your words. Your text stays here, and reviewed times can still be saved.</p>}
      {plan && <div className={`voice-proposal${plan.action === 'clarify' ? ' voice-clarification' : ''}`}>
        <p role="status">{plan.explanation}</p>
        {plan.action === 'clarify' ? <p className="muted">Update your words above, then interpret them again.</p> : plan.entries.map((entry,i) => {
          const original = plan.action === 'edit' ? shifts.find(shift => shift.id === entry.id) : undefined;
          const summary = summaries[i];
          return <div className="proposal-row" key={i}>
            <div className="proposal-head"><strong>{plan.action === 'edit' ? 'Correct shift' : plan.entries.length === 1 ? 'New shift' : `New shift ${i+1}`}</strong>{summary.duration && <span className="proposal-duration">{summary.duration}</span>}</div>
            {summary.times && <p className="proposal-summary">{summary.times}</p>}
            {plan.action === 'edit' && <p className="proposal-original">{original ? `Currently saved: ${intervalSummary(original.start, original.end, zone).times}` : 'This shift is no longer available. Interpret your words again.'}</p>}
            <div className="proposal-fields">{(['start','end'] as const).map(key => <label key={key}>{key === 'start' ? 'Start' : 'Finish'}<input type="datetime-local" value={entry[key]} disabled={closing} aria-invalid={Boolean(summary.error)} onChange={e => { setPlan({ ...plan, entries: plan.entries.map((v,n) => n === i ? { ...v, [key]: e.target.value } : v) }); setWarningAccepted(false); setError(''); }}/></label>)}</div>
            {summary.error && <p className="form-error">{summary.error}</p>}
          </div>;
        })}
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    {plan && plan.action !== 'clarify' && <div className="modal-actions"><button className="secondary-btn" disabled={closing} onClick={dismiss}>Cancel</button><button className="modal-submit" disabled={invalidProposal || busy || closing} onClick={apply}>{warningAccepted ? 'Confirm checked times' : 'Confirm changes'} <ArrowRight size={17}/></button></div>}
  </div></div>;
}
