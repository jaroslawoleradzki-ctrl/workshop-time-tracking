import type { ReactNode } from 'react';

export type HelpRole = 'admin' | 'leader';
export type HelpChapterId = 'pierwsze-kroki' | 'logowanie';

export interface HelpScreenshotReference {
  id: string;
  alt: string;
}

export interface HelpChapter {
  id: HelpChapterId;
  title: string;
  roles: HelpRole[];
  content: ReactNode;
  screenshots: HelpScreenshotReference[];
}

export const helpChapters: HelpChapter[] = [
  { id: 'pierwsze-kroki', title: 'Pierwsze kroki', roles: ['leader', 'admin'], content: <><p>Warsztat służy do ewidencji czasu pracy przy zleceniach oraz przygotowania raportów.</p><h2>Dostęp według roli</h2><p>Leader korzysta z Raportowania, Zleceń i Raportów. Administrator ma dodatkowo dostęp do pulpitu i administracji.</p><p>Wybierz rozdział z listy, aby przejść do instrukcji konkretnej czynności.</p></>, screenshots: [] },
  { id: 'logowanie', title: 'Logowanie', roles: ['leader', 'admin'], content: <><p>Na ekranie logowania wpisz otrzymany login i hasło, a następnie wybierz <strong>Zaloguj się</strong>.</p><p>Po wygaśnięciu sesji lub aktualizacji aplikacji system poprosi o ponowne zalogowanie.</p></>, screenshots: [{ id: 'login-empty', alt: 'Ekran logowania systemu Warsztat' }] },
];

export const getHelpChapter = (id: string | null): HelpChapter => helpChapters.find((chapter) => chapter.id === id) ?? helpChapters[0];

export function helpChapterFromHash(hash: string): HelpChapterId | null {
  const id = hash.match(/^#help\/([^/]+)$/)?.[1];
  return helpChapters.find((chapter) => chapter.id === id)?.id ?? null;
}
