import { CircleHelp } from 'lucide-react';

export default function ContextHelpButton({ chapter, onOpenHelp }: { chapter: string; onOpenHelp?: (chapter: string) => void }) {
  if (!onOpenHelp) return null;
  return <button type="button" className="context-help-button" aria-label="Otwórz pomoc dla tej sekcji" title="Otwórz instrukcję" onClick={() => onOpenHelp(chapter)}><CircleHelp size={19} aria-hidden="true" /></button>;
}
