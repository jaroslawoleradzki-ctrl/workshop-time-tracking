import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { getHelpChapter, helpChapters, type HelpRole } from '../help/chapters';

interface HelpViewProps { chapterId: string | null; appVersion: string | null; onSelectChapter: (id: string) => void; }
const roleLabel: Record<HelpRole, string> = { admin: 'Administrator', leader: 'Leader' };

export default function HelpView({ chapterId, appVersion, onSelectChapter }: HelpViewProps) {
  const chapter = getHelpChapter(chapterId);
  const chapterIndex = helpChapters.findIndex(({ id }) => id === chapter.id);
  const previous = helpChapters[chapterIndex - 1];
  const next = helpChapters[chapterIndex + 1];
  return <section className="help-view" aria-label="Instrukcja użytkownika"><header className="view-header help-header"><div><h1><BookOpen size={28} aria-hidden="true" /> Instrukcja użytkownika</h1><p>Wersja aplikacji {appVersion && appVersion !== 'error' ? `v${appVersion}` : 'niedostępna'}</p></div></header><div className="help-layout"><nav className="help-chapters" aria-label="Rozdziały instrukcji">{helpChapters.map((item) => <button key={item.id} type="button" onClick={() => onSelectChapter(item.id)} className={item.id === chapter.id ? 'active' : ''}>{item.title}</button>)}</nav><article className="help-content card"><div className="help-title-row"><h2>{chapter.title}</h2><div aria-label="Role rozdziału">{chapter.roles.map((role) => <span className="help-role-badge" key={role}>{roleLabel[role]}</span>)}</div></div><div className="help-body">{chapter.content}</div><footer className="help-pagination">{previous ? <button className="btn btn-secondary" onClick={() => onSelectChapter(previous.id)}><ChevronLeft size={16} /> Poprzedni</button> : <span />}{next ? <button className="btn btn-primary" onClick={() => onSelectChapter(next.id)}>Następny <ChevronRight size={16} /></button> : <span />}</footer></article></div></section>;
}
