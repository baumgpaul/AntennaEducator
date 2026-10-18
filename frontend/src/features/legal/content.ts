import { OPERATOR } from './operator';

export type Lang = 'en' | 'de';

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  sections: LegalSection[];
}

const contact = (lang: Lang) => `${OPERATOR.name}, ${OPERATOR.place[lang]} · ${OPERATOR.email}`;

// Keep in sync with the backend: retention (backend/projects/retention.py),
// backups (terraform: DynamoDB PITR 35 days, S3 noncurrent versions 30 days),
// Lambda log retention (7 days), hosting region (eu-west-1).
export const PRIVACY: Record<Lang, LegalDocument> = {
  en: {
    title: 'Privacy notice',
    sections: [
      {
        title: '1. Who is responsible',
        paragraphs: [
          `Controller under the GDPR: ${contact('en')}. Antenna Educator is a free, open-source, optional teaching tool. It is run privately, without commercial purpose, advertising or tracking.`,
        ],
      },
      {
        title: '2. What data is processed',
        paragraphs: [
          'Account: e-mail address, user name, password (stored only as a hash by Amazon Cognito), role, approval status, simulation token balance, date of registration and the date of your last activity.',
          'Your content: projects, antenna designs, simulation results, project documentation and uploaded images, course enrollments and course submissions.',
          'Technical data: to deliver the website and API, the hosting provider processes your IP address and request data. Server logs (errors, request metadata, user ID) are kept for 7 days. No access logs of the website are stored.',
          'In your browser, local storage holds your login session and display preferences. These are strictly necessary; there are no tracking or advertising cookies.',
        ],
      },
      {
        title: '3. Purposes and legal basis',
        paragraphs: [
          'Providing the service you signed up for, including your account, projects, simulations and courses: Art. 6(1)(b) GDPR.',
          'Keeping the service secure and running (logs, abuse protection, error analysis): legitimate interest, Art. 6(1)(f) GDPR.',
          'Using Antenna Educator is voluntary. Without an e-mail address no account can be created.',
        ],
      },
      {
        title: '4. Recipients and hosting',
        paragraphs: [
          'The service is hosted by Amazon Web Services EMEA SARL (Luxembourg) as processor under the AWS data processing addendum. Data is stored in the AWS region Ireland (eu-west-1). The content delivery network (Amazon CloudFront) may process requests in edge locations outside the EU; such transfers are covered by the EU standard contractual clauses in the AWS data processing addendum.',
          'If you submit a project to a course, the course instructors (maintainers) and administrators can see it. Administrators can see account data to approve accounts and manage tokens. Data is not sold or shared with anyone else.',
        ],
      },
      {
        title: '5. How long data is kept',
        paragraphs: [
          'Your account and all its data are kept until you delete the account, or automatically deleted 12 months after your last activity.',
          'Course submissions are deleted 12 months after they were submitted.',
          'Server logs are deleted after 7 days. Deleted data disappears from backups within 35 days.',
        ],
      },
      {
        title: '6. Your rights',
        paragraphs: [
          'You have the right to access, rectification, erasure, restriction of processing, data portability and to object to processing based on legitimate interest. You can delete your account and all your data yourself at any time (user menu → "Delete account…"). For everything else write to the e-mail address above.',
          'You can complain to a data protection supervisory authority, for example the Dutch Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl) or the Austrian Datenschutzbehörde (dsb.gv.at).',
          'There is no automated decision-making or profiling. New accounts are approved by an administrator.',
        ],
      },
    ],
  },
  de: {
    title: 'Datenschutzerklärung',
    sections: [
      {
        title: '1. Verantwortlicher',
        paragraphs: [
          `Verantwortlicher im Sinne der DSGVO: ${contact('de')}. Antenna Educator ist ein kostenloses, quelloffenes und freiwillig nutzbares Lehrwerkzeug. Es wird privat betrieben, ohne kommerziellen Zweck, ohne Werbung und ohne Tracking.`,
        ],
      },
      {
        title: '2. Welche Daten verarbeitet werden',
        paragraphs: [
          'Konto: E-Mail-Adresse, Benutzername, Passwort (bei Amazon Cognito nur als Hash gespeichert), Rolle, Freischaltungsstatus, Guthaben an Simulations-Tokens, Registrierungsdatum und das Datum Ihrer letzten Aktivität.',
          'Ihre Inhalte: Projekte, Antennenentwürfe, Simulationsergebnisse, Projektdokumentation und hochgeladene Bilder, Kurseinschreibungen und Kursabgaben.',
          'Technische Daten: Zur Auslieferung von Website und API verarbeitet der Hosting-Anbieter Ihre IP-Adresse und Anfragedaten. Server-Logs (Fehler, Anfrage-Metadaten, Benutzer-ID) werden 7 Tage aufbewahrt. Zugriffsprotokolle der Website werden nicht gespeichert.',
          'Im lokalen Speicher Ihres Browsers liegen Ihre Anmeldesitzung und Anzeigeeinstellungen. Diese sind technisch notwendig; es gibt keine Tracking- oder Werbe-Cookies.',
        ],
      },
      {
        title: '3. Zwecke und Rechtsgrundlagen',
        paragraphs: [
          'Bereitstellung des Dienstes, für den Sie sich registriert haben, einschließlich Konto, Projekten, Simulationen und Kursen: Art. 6 Abs. 1 lit. b DSGVO.',
          'Sicherer und stabiler Betrieb (Logs, Missbrauchsschutz, Fehleranalyse): berechtigtes Interesse, Art. 6 Abs. 1 lit. f DSGVO.',
          'Die Nutzung von Antenna Educator ist freiwillig. Ohne E-Mail-Adresse kann kein Konto angelegt werden.',
        ],
      },
      {
        title: '4. Empfänger und Hosting',
        paragraphs: [
          'Der Dienst wird von Amazon Web Services EMEA SARL (Luxemburg) als Auftragsverarbeiter auf Grundlage des AWS-Auftragsverarbeitungsvertrags gehostet. Die Daten werden in der AWS-Region Irland (eu-west-1) gespeichert. Das Content-Delivery-Netzwerk (Amazon CloudFront) kann Anfragen an Standorten außerhalb der EU verarbeiten; solche Übermittlungen sind durch die EU-Standardvertragsklauseln im AWS-Auftragsverarbeitungsvertrag abgesichert.',
          'Wenn Sie ein Projekt in einem Kurs abgeben, sehen es die Kursverantwortlichen (Maintainer) und Administratoren. Administratoren sehen Kontodaten, um Konten freizuschalten und Tokens zu verwalten. Darüber hinaus werden keine Daten verkauft oder weitergegeben.',
        ],
      },
      {
        title: '5. Speicherdauer',
        paragraphs: [
          'Ihr Konto und alle zugehörigen Daten werden gespeichert, bis Sie das Konto löschen, oder automatisch 12 Monate nach Ihrer letzten Aktivität gelöscht.',
          'Kursabgaben werden 12 Monate nach der Abgabe gelöscht.',
          'Server-Logs werden nach 7 Tagen gelöscht. Gelöschte Daten verschwinden innerhalb von 35 Tagen aus den Sicherungen.',
        ],
      },
      {
        title: '6. Ihre Rechte',
        paragraphs: [
          'Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit sowie auf Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen. Ihr Konto mit allen Daten können Sie jederzeit selbst löschen (Benutzermenü → „Delete account…“). Für alles andere schreiben Sie an die oben genannte E-Mail-Adresse.',
          'Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der niederländischen Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl) oder der österreichischen Datenschutzbehörde (dsb.gv.at).',
          'Es findet keine automatisierte Entscheidungsfindung oder Profilbildung statt. Neue Konten werden von einem Administrator freigeschaltet.',
        ],
      },
    ],
  },
};

export const IMPRINT: Record<Lang, LegalDocument> = {
  en: {
    title: 'Imprint',
    sections: [
      {
        title: 'Media owner and operator',
        paragraphs: [
          `${OPERATOR.name}, ${OPERATOR.place.en}`,
          `Contact: ${OPERATOR.email}`,
        ],
      },
      {
        title: 'Purpose',
        paragraphs: [
          'Antenna Educator is a private, non-commercial, open-source teaching tool for simulating wire antennas (disclosure under § 25 Austrian Media Act).',
          `Source code under the MIT License: ${OPERATOR.sourceUrl}`,
        ],
      },
      {
        title: 'Disclaimer',
        paragraphs: [
          'Simulation results are numerical approximations for teaching and come without any warranty, as stated in the MIT License.',
        ],
      },
    ],
  },
  de: {
    title: 'Impressum',
    sections: [
      {
        title: 'Medieninhaber und Betreiber',
        paragraphs: [
          `${OPERATOR.name}, ${OPERATOR.place.de}`,
          `Kontakt: ${OPERATOR.email}`,
        ],
      },
      {
        title: 'Grundlegende Richtung',
        paragraphs: [
          'Antenna Educator ist ein privates, nicht-kommerzielles, quelloffenes Lehrwerkzeug zur Simulation von Drahtantennen (Offenlegung gemäß § 25 Mediengesetz).',
          `Quellcode unter der MIT-Lizenz: ${OPERATOR.sourceUrl}`,
        ],
      },
      {
        title: 'Haftungsausschluss',
        paragraphs: [
          'Simulationsergebnisse sind numerische Näherungen für Lehrzwecke und werden ohne jede Gewährleistung bereitgestellt, wie in der MIT-Lizenz festgehalten.',
        ],
      },
    ],
  },
};
