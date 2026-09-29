import type { ReactNode } from 'react';

export type HelpRole = 'admin' | 'leader';

export interface HelpChapter {
  id: 'pierwsze-kroki' | 'logowanie';
  title: string;
  roles: HelpRole[];
  content: ReactNode;
}

export const HELP_SCREENSHOTS = { login: 'logowanie-01-ekran-logowania.png' } as const;

export const helpChapters: HelpChapter[] = [
  { id: 'pierwsze-kroki', title: 'Pierwsze kroki', roles: ['leader', 'admin'], content: <><p>Warsztat służy do ewidencji czasu pracy przy zleceniach oraz przygotowania raportów.</p><h2>Dostęp według roli</h2><p>Leader korzysta z Raportowania, Zleceń i Raportów. Administrator ma dodatkowo dostęp do pulpitu i administracji.</p><p>Wybierz rozdział z listy, aby przejść do instrukcji konkretnej czynności.</p></> },
  { id: 'logowanie', title: 'Logowanie', roles: ['leader', 'admin'], content: <><p>Na ekranie logowania wpisz otrzymany login i hasło, a następnie wybierz <strong>Zaloguj się</strong>.</p><p>Po wygaśnięciu sesji lub aktualizacji aplikacji system poprosi o ponowne zalogowanie.</p><figure className="help-figure"><img src={`/help/${HELP_SCREENSHOTS.login}`} alt="Ekran logowania systemu Warsztat" /><figcaption>Ekran logowania aplikacji Warsztat.</figcaption></figure></> },
];

export const getHelpChapter = (id: string | null): HelpChapter => helpChapters.find((chapter) => chapter.id === id) ?? helpChapters[0];
