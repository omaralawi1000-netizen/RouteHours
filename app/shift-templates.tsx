"use client";

import { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Copy, Plus, Trash2 } from 'lucide-react';
import { addDays, dateInZone } from '@/lib/ledger';
import { templateShift, validateTemplates, type ShiftTemplate } from '@/lib/templates';
import type { Shift } from '@/lib/time';

export function TemplatePicker({ templates, week, zone, onDraft, onSettings }: { templates: ShiftTemplate[]; week: string; zone: string; onDraft: (shift: Shift) => void; onSettings: () => void }) {
  const today = dateInZone(Date.now(), zone);
  const [date, setDate] = useState(today >= week && today <= addDays(week,6) ? today : week), [error, setError] = useState('');
  useEffect(() => { setDate(today >= week && today <= addDays(week,6) ? today : week); setError(''); }, [week,today]);
  function choose(template: ShiftTemplate) {
    try {
      if (date < week || date > addDays(week,6)) throw new Error('Choose a date within this week.');
      onDraft(templateShift(template, date, zone)); setError('');
    } catch(e) { setError(e instanceof Error ? e.message : 'Check the date and times.'); }
  }
  return <details className="template-picker">
    <summary><Copy size={16}/> Add from a template<ChevronDown className="disclosure-chevron" size={16}/></summary>
    <p>Fill in your usual times, then review and save the shift.</p>
    <label>Work date<input aria-label="Template work date" type="date" min={week} max={addDays(week,6)} value={date} onChange={e => {setDate(e.target.value);setError('');}}/></label>
    <div className="template-options">{templates.map(template => <button className="template-choice" key={template.id} disabled={!date} onClick={() => choose(template)}><span><strong>{template.name}</strong><small>{template.start}–{template.end}{template.end < template.start ? ' · next day' : ''}</small></span><ArrowRight size={17}/></button>)}</div>
    {!templates.length && <p>No templates saved yet. Add your usual morning and afternoon times in Settings.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="text-action" onClick={onSettings}>Edit templates in Settings<ArrowRight size={14}/></button>
  </details>;
}

export function TemplateSettings({ templates, onSave }: { templates: ShiftTemplate[]; onSave: (value: ShiftTemplate[]) => Promise<void> }) {
  const [draft, setDraft] = useState(() => templates.map(t => ({...t}))), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState('');
  useEffect(() => { setDraft(templates.map(t => ({...t})));setError(''); }, [templates]);
  function change(id: string, key: 'name'|'start'|'end', value: string) { setDraft(items => items.map(t => t.id === id ? {...t,[key]:value} : t));setSaved(false);setError(''); }
  async function save() {
    setError('');setSaved(false);
    try { const value = validateTemplates(draft);setBusy(true);await onSave(value);setSaved(true); }
    catch(e) {setError(e instanceof Error ? e.message : 'Templates could not be saved.');}
    finally {setBusy(false);}
  }
  return <details className="setting-block template-settings">
    <summary className="setting-title"><span className="setting-icon"><Copy size={19}/></span><div><strong>Shift templates</strong><p>Your usual morning and afternoon times.</p></div><ChevronDown className="disclosure-chevron" size={17}/></summary>
    <p className="report-hint">The suggested times are editable. Templates create drafts; they never start the timer or count hours automatically.</p>
    <fieldset disabled={busy} className="template-fields">
      {draft.map(template => <div className="template-editor" key={template.id}>
        <div className="template-name"><label>Name<input aria-label={'Template name ' + template.id} value={template.name} maxLength={50} onChange={e => change(template.id,'name',e.target.value)}/></label><button className="icon-btn" aria-label={'Remove ' + template.name + ' template'} onClick={() => {setDraft(items => items.filter(t => t.id !== template.id));setSaved(false);}}><Trash2 size={16}/></button></div>
        <div className="template-times"><label>Start<input aria-label={'Template start ' + template.id} type="time" value={template.start} onChange={e => change(template.id,'start',e.target.value)}/></label><label>Finish<input aria-label={'Template finish ' + template.id} type="time" value={template.end} onChange={e => change(template.id,'end',e.target.value)}/></label></div>
        {template.end && template.start && template.end < template.start && <p className="report-hint">Finishes the following day.</p>}
      </div>)}
      {draft.length < 8 && <button className="text-action" onClick={() => {setDraft(items => [...items,{id:crypto.randomUUID(),name:'Shift ' + (items.length+1),start:'07:00',end:'09:00'}]);setSaved(false);}}><Plus size={16}/> Add template</button>}
    </fieldset>
    <button className="secondary-btn save-templates" disabled={busy} onClick={() => void save()}><Check size={16}/>{busy ? 'Saving…' : 'Save templates'}</button>
    {saved && <p className="connection-result success" role="status"><Check size={16}/>Templates saved on this device.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </details>;
}
