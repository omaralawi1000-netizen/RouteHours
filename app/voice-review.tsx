"use client";
import { useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { dateInZone, timeInZone, shiftWarnings } from '@/lib/ledger';
import { validateVoicePlan, proposedShifts, type VoicePlan } from '@/lib/voice-plan';
import type { Shift } from '@/lib/time';
export default function VoiceReview({ transcript, shifts, zone, apiKey, accessCode, onClose, onApply }: { transcript: string; shifts: Shift[]; zone: string; apiKey: string; accessCode: string; onClose: () => void; onApply: (shifts: Shift[]) => void }) {
  const [text, setText] = useState(transcript), [plan, setPlan] = useState<VoicePlan | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [warningAccepted, setWarningAccepted] = useState(false);
  async function interpret() {
    setBusy(true); setError(''); setPlan(null); setWarningAccepted(false);
    try {
      const context = JSON.stringify({ today: dateInZone(Date.now(), zone), zone, shifts: shifts.slice().sort((a,b) => b.start.localeCompare(a.start)).slice(0,60).map(s => ({ id: s.id, start: `${dateInZone(s.start,zone)}T${timeInZone(s.start,zone)}`, end: `${dateInZone(s.end,zone)}T${timeInZone(s.end,zone)}` })) });
      const response = await fetch('/api/voice-plan', { method: 'POST', headers: { 'content-type': 'application/json', 'x-app-access-token': accessCode }, body: JSON.stringify({ transcript: text, context, apiKey }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not interpret the request.');
      setPlan(validateVoicePlan(result));
    } catch (e) { setError(e instanceof Error ? e.message : 'Try again. Your words are still here.'); } finally { setBusy(false); }
  }
  function apply() {
    try {
      if (!plan || plan.action === 'clarify') return;
      const proposed = proposedShifts(plan, shifts, zone);
      const combined = [...shifts.filter(s => !proposed.some(p => p.id === s.id)), ...proposed];
      if (!warningAccepted && shiftWarnings(combined).some(w => w.ids.some(id => proposed.some(p => p.id === id)))) { setWarningAccepted(true); setError('These times overlap another shift or exceed 12 hours. Check them below. Tap Confirm changes again only if they are correct.'); return; }
      onApply(combined); onClose();
    } catch (e) { setError((e as Error).message); }
  }
  return <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-label="Review spoken hours"><div className="modal-head"><div><span className="small-kicker">VOICE TO HOURS</span><h2>Make it precise.</h2></div><button className="icon-btn" aria-label="Close voice review" onClick={onClose}><X size={20}/></button></div><label>Your words<textarea autoFocus value={text} maxLength={2000} onChange={e => { setText(e.target.value); setPlan(null); setWarningAccepted(false); }} placeholder="Yesterday 07:00–09:00 and 13:00–15:00"/></label><p className="muted">English or Danish · {zone}. Review every change before saving.</p><button className="secondary-btn" disabled={busy || !text.trim()} onClick={() => void interpret()}><Sparkles size={17}/>{busy ? 'Understanding your hours…' : 'Interpret hours'}</button>{plan && <div className="voice-proposal"><p>{plan.explanation}</p>{plan.entries.map((entry,i) => <div className="proposal-row" key={i}><strong>{plan.action === 'edit' ? 'Correct shift' : `New shift ${i+1}`}</strong>{(['start','end'] as const).map(key => <label key={key}>{key === 'start' ? 'Start' : 'Finish'}<input type="datetime-local" value={entry[key]} onChange={e => { setPlan({ ...plan, entries: plan.entries.map((v,n) => n === i ? { ...v, [key]: e.target.value } : v) }); setWarningAccepted(false); setError(''); }}/></label>)}</div>)}{plan.action !== 'clarify' && <button className="modal-submit" onClick={apply}>Confirm changes <ArrowRight size={17}/></button>}</div>}{error && <p className="form-error" role="alert">{error}</p>}</div></div>;
}
