/**
 * /legal/:doc — Terms of Service, Privacy Policy, Cookie Policy, Safeguarding Policy
 * and Accessibility statement. Readable by everyone, signed in or not.
 *
 * The wording is a careful general-purpose template for an online tutoring service
 * that works with children. The operator's own details (legal name, contact, address,
 * governing law, ages) come from Admin → Settings → Legal. It is NOT legal advice:
 * the operator should have it reviewed for their country and state before relying on it.
 */
import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { PublicFrame } from '../components/PublicFrame';
import { PageHeader } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { usePublicConfig } from '../lib/config';
import { LEGAL_DOCS, useLegal, type LegalSlug, type ResolvedLegal } from '../lib/legal';

export function LegalPage() {
  const { doc } = useParams();
  const legal = useLegal();
  const { can } = useAuth();
  const entry = LEGAL_DOCS.find((d) => d.slug === doc);
  if (!entry) return <Navigate to="/legal/terms" replace />;
  const incomplete = !legal.operatorName || !legal.email;

  return (
    <PublicFrame wide>
      <div className="legal-layout">
        <nav className="legal-nav" aria-label="Legal documents">
          {LEGAL_DOCS.map((d) => (
            <Link key={d.slug} to={`/legal/${d.slug}`} aria-current={d.slug === doc ? 'page' : undefined}>{d.title}</Link>
          ))}
        </nav>
        <article className="legal-doc">
          <PageHeader title={entry.title} description={`Effective ${fmtDay(legal.effectiveDate)}${entry.slug === 'terms' || entry.slug === 'privacy' ? ` · Version ${legal.termsVersion}` : ''}`} />
          {incomplete && can('settings:manage') && (
            <div className="notice warn">
              Only administrators see this: add your legal name and contact email in{' '}
              <Link to="/admin/settings#legal">Settings → Legal</Link> so these pages name you correctly.
            </div>
          )}
          {DOCS[entry.slug](legal)}
        </article>
      </div>
    </PublicFrame>
  );
}

function fmtDay(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeZone: 'UTC' }).format(d);
}

function Contact({ l }: { l: ResolvedLegal }) {
  return (
    <address className="legal-contact">
      <strong>{l.who}</strong>
      {l.postalAddress && l.postalAddress.split('\n').map((line) => <span key={line}>{line}</span>)}
      {l.email && <a href={`mailto:${l.email}`}>{l.email}</a>}
    </address>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section>
    <h2>{title}</h2>
    {children}
  </section>
);

function Terms(l: ResolvedLegal) {
  return <TermsBody l={l} />;
}

function TermsBody({ l }: { l: ResolvedLegal }) {
  const config = usePublicConfig();
  const cutoff = config?.studentCancelCutoffHours;
  return (
    <>
      <p className="legal-lead">
        These terms are an agreement between you and {l.who} ("we", "us") about using {l.siteName} (the "Service"): the
        website, booking system, messaging, online tutoring sessions and study materials. Please read them carefully. By
        creating an account, booking a session or otherwise using the Service you agree to them. If you do not agree,
        please do not use the Service.
      </p>

      <Section title="1. Who can use the Service">
        <p>
          You must be at least {l.parentalConsentAge} years old to accept these terms yourself. If a student is younger
          than {l.parentalConsentAge}, a parent or legal guardian must accept these terms on the student's behalf, is
          responsible for the student's use of the Service, and agrees to them both for themselves and for the student.
          {l.minimumAge > 0 && ` Students under ${l.minimumAge} may only use the Service through an account created and supervised by a parent or guardian.`}
        </p>
        <p>You must give accurate information and keep it up to date. One person may not share an account with others.</p>
      </Section>

      <Section title="2. Your account">
        <p>
          Keep your password private and tell us straight away if you think someone else has used your account. You are
          responsible for what happens under your account unless it was caused by our failure to protect it. We may
          approve, decline, pause or close accounts to keep the Service safe, including when these terms are broken.
        </p>
      </Section>

      <Section title="3. Booking, cancelling and missed sessions">
        <ul>
          <li>A booking request becomes a confirmed session only when the tutor accepts it. We will email you when they do.</li>
          <li>
            You can cancel a session from your account
            {cutoff !== undefined ? ` up to ${cutoff} hours before it starts` : ' within the time shown when you book'}. After
            that, please message your tutor; a late cancellation or no-show may count as a used session.
          </li>
          <li>Tutors or we may need to cancel or move a session (for example because of illness or a technical problem). If that happens we will tell you as early as we can and offer another time.</li>
          <li>Any prices, packages and refund rules are shown to you before you commit and form part of these terms.</li>
        </ul>
      </Section>

      <Section title="4. Online sessions">
        <p>
          Sessions take place online using a third-party video service (such as Google Meet), whose own terms and privacy
          policy also apply when you use it. You are responsible for a working device and internet connection. Sessions
          must not be recorded by anyone without the agreement of everyone taking part and, for a student under{' '}
          {l.parentalConsentAge}, their parent or guardian.
        </p>
      </Section>

      <Section title="5. No guaranteed results">
        <p>
          Tutoring supports learning, but results depend on many things outside our control, including the student's own
          effort and the exam itself. We do not promise any particular grade, test score (including ACT® or any other
          exam), admission or other outcome, and nothing on the Service is a guarantee of one.
        </p>
      </Section>

      <Section title="6. How everyone must behave">
        <p>When using the Service you must not:</p>
        <ul>
          <li>harass, bully, threaten, discriminate against or abuse anyone, or share sexual, violent or hateful content;</li>
          <li>try to contact a student under {l.parentalConsentAge} outside the Service without their parent's or guardian's knowledge, or ask for personal contact details for that purpose;</li>
          <li>ask for or offer payment for sessions outside the Service, or arrange to tutor privately to avoid it;</li>
          <li>cheat, or ask a tutor to complete graded work or an exam for a student;</li>
          <li>upload anything unlawful, infringing, or containing viruses, or try to break, overload or get around the security of the Service;</li>
          <li>pretend to be someone else, or use another person's account.</li>
        </ul>
        <p>
          Messages are kept on the Service so that concerns can be reviewed. We may remove content, pause accounts and,
          where the law requires or a child may be at risk, report matters to the authorities.
        </p>
      </Section>

      <Section title="7. Study materials and content">
        <p>
          Study packets, worksheets and other materials on the Service belong to us or our licensors. You may download and
          print them for your own personal, non-commercial study, or use them with students you teach directly, but you may
          not sell them, republish them or remove our name from them. Practice questions are written for study only and are
          not official exam materials.
        </p>
        <p>
          ACT® is a registered trademark of ACT Education Corp., and SAT® is a registered trademark of the College Board.
          Neither is affiliated with, nor endorses, {l.who} or the Service. Other names may be trademarks of their owners.
        </p>
        <p>
          Anything you upload or write on the Service (messages, notes, files) stays yours. You give us permission to store,
          display and process it only as needed to run the Service for you and the people you work with.
        </p>
      </Section>

      <Section title="8. Reporting a concern">
        <p>
          If anything about a tutor, a session or a message worries you, use <strong>Report</strong> (on the session or in your messages with the tutor) or
          email us. Please read our <Link to="/legal/safeguarding">Safeguarding Policy</Link>. If someone is in immediate
          danger, contact your local emergency services first.
        </p>
      </Section>

      <Section title="9. Availability of the Service">
        <p>
          We work to keep the Service available and secure, but it may sometimes be unavailable for maintenance or for
          reasons beyond our control. We may change, add or remove features. If we stop providing the Service altogether we
          will give reasonable notice where we can.
        </p>
      </Section>

      <Section title="10. Disclaimers">
        <p>
          Except as expressly stated in these terms, the Service and all materials are provided "as is" and "as available".
          To the fullest extent the law allows, we make no other promises or warranties, express or implied, including about
          fitness for a particular purpose, accuracy of materials, or uninterrupted availability. Nothing in these terms
          removes rights you have under consumer protection laws that cannot be excluded.
        </p>
      </Section>

      <Section title="11. Limits on our liability">
        <p>
          To the fullest extent the law allows: (a) we are not liable for indirect or consequential losses, such as lost
          opportunities, lost data or lost profits, or for losses that were not reasonably foreseeable; and (b) our total
          liability to you for all claims relating to the Service is limited to the greater of the amount you paid us for
          the Service in the 12 months before the claim arose, or 100 US dollars (or the equivalent in your currency).
        </p>
        <p>
          Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for
          anything else that cannot legally be limited.
        </p>
      </Section>

      <Section title="12. Your responsibility to us">
        <p>
          If you break these terms or the law while using the Service and that leads to a claim against us by someone else,
          you agree to cover our reasonable losses and costs from that claim, to the extent the law allows.
        </p>
      </Section>

      <Section title="13. Ending your use">
        <p>
          You can stop using the Service at any time and ask us to delete your account from your profile ("Your data"). We
          may suspend or close an account that breaks these terms, puts others at risk, or that we are required to close by
          law. Sections that by their nature should continue (such as 7, 10, 11, 12 and 15) continue after an account ends.
        </p>
      </Section>

      <Section title="14. Changes to these terms">
        <p>
          We may update these terms, for example when we add features or the law changes. When we make a significant
          change we will update the version number above and ask you to review and accept the new terms the next time you
          sign in. If you do not accept them, you can close your account.
        </p>
      </Section>

      <Section title="15. Disputes and the law that applies">
        <p>
          If you have a problem, please contact us first so we can try to put it right; most concerns are resolved quickly
          that way. These terms are governed by the laws of {l.governingLaw || 'the place where we are established'}, and
          the courts there have jurisdiction, except that if you are a consumer you keep any right to bring a claim in the
          courts where you live and the protection of the mandatory laws of your country or state.
        </p>
      </Section>

      <Section title="16. General">
        <p>
          If any part of these terms is found to be unenforceable, the rest stays in effect. If we do not enforce a right
          straight away, we can still enforce it later. You may not transfer your rights under these terms to someone else;
          we may transfer ours to an organisation that takes over the Service, and we will tell you if that happens. These
          terms, together with the <Link to="/legal/privacy">Privacy Policy</Link>, are the whole agreement between us about
          the Service.
        </p>
      </Section>

      {l.additionalTerms && (
        <Section title="17. Additional terms">
          {l.additionalTerms.split(/\n{2,}/).map((para, i) => <p key={i} className="pre-wrap">{para}</p>)}
        </Section>
      )}

      <Section title="Contact us">
        <Contact l={l} />
      </Section>
    </>
  );
}

function Privacy(l: ResolvedLegal) {
  return (
    <>
      <p className="legal-lead">
        This policy explains what personal information {l.who} collects when you use {l.siteName}, why, who can see it,
        how long we keep it, and the choices and rights you have. We are the "controller" of this information. We do not
        sell personal information and we do not use it for advertising.
      </p>

      <Section title="1. What we collect">
        <ul>
          <li><strong>Account details:</strong> name, email address, password (stored only as a secure one-way hash), time zone, role (student, tutor, administrator) and email preferences.</li>
          <li><strong>Consent records:</strong> the date and version of these terms you accepted, and whether a parent or guardian agreed on a student's behalf.</li>
          <li><strong>Bookings:</strong> sessions requested and held, times, the tutor and student, notes you add when booking, cancellations, and the tutor's recap.</li>
          <li><strong>Messages</strong> between students (or their parents) and tutors, and questions asked before a session.</li>
          <li><strong>Learning notes:</strong> notes tutors write about a student's progress. Some are shared with the student; others are visible only to tutors and administrators.</li>
          <li><strong>Feedback and reports:</strong> session ratings and comments, and any concern you report.</li>
          <li><strong>Technical information:</strong> IP address, browser type, sign-in times and a log of important account actions, used for security and to investigate misuse.</li>
        </ul>
        <p>If you book without an account we collect only your name, email address, time zone and the booking details.</p>
      </Section>

      <Section title="2. Why we use it">
        <ul>
          <li>To run the Service you asked for: accounts, bookings, reminders, messaging and tutoring (necessary to perform our agreement with you).</li>
          <li>To keep students and everyone else safe, prevent fraud and abuse, and secure the Service (our legitimate interests, and our safeguarding duties).</li>
          <li>To send emails about your account and sessions. Optional emails (such as message notifications and reminders) can be turned off in your profile.</li>
          <li>To improve the Service using overall, non-identifying statistics.</li>
          <li>To meet legal obligations, such as keeping records or responding to lawful requests.</li>
        </ul>
        <p>Where the law requires consent (for example for a child's information), we ask for it, and you can withdraw it at any time.</p>
      </Section>

      <Section title="3. Children's information">
        <p>
          Many of our students are children. A parent or guardian must agree to these terms for any student under{' '}
          {l.parentalConsentAge}
          {l.minimumAge > 0 ? `, and students under ${l.minimumAge} may only use an account created by a parent or guardian` : ''}.
          We collect only the information needed to provide tutoring, never show children advertising, and never make a
          child's information public. Parents and guardians can review the information held about their child, ask us to
          correct or delete it, and withdraw consent to further collection, by contacting us at the address below. If we
          learn that we hold a young child's information without the required consent, we will delete it.
        </p>
      </Section>

      <Section title="4. Who can see it">
        <ul>
          <li><strong>Your tutor or student:</strong> the details needed for your sessions and your messages with each other.</li>
          <li><strong>Our tutors:</strong> learning notes about a student, so that anyone teaching them can help.</li>
          <li><strong>Our administrators:</strong> to run the Service, handle reports and keep it safe.</li>
          <li>
            <strong>Service providers</strong> who process information only on our instructions: website hosting, our email
            delivery provider, and the video service used for online sessions (such as Google Meet).
          </li>
          <li><strong>Authorities</strong>, where the law requires it or a child may be at risk of harm.</li>
          <li>A successor organisation, if the Service is ever transferred, under the same protections.</li>
        </ul>
        <p>We do not sell or rent personal information, and we do not "share" it for cross-context behavioural advertising.</p>
      </Section>

      <Section title="5. How long we keep it">
        <p>
          We keep account information while your account is open. When an account is deleted we remove the person's name,
          email and other identifying details. We may keep a minimal, de-identified record of past sessions (for example for
          accounting or to handle a later complaint or safeguarding concern), and records we are legally required to keep,
          for as long as that requirement lasts. Security logs are kept only as long as needed to protect the Service.
        </p>
      </Section>

      <Section title="6. How we protect it">
        <p>
          Connections are encrypted, passwords are stored as strong one-way hashes, access inside the Service is limited by
          role, and important actions are logged. No system is perfectly secure; if a breach affecting your information
          happens, we will tell you and the authorities where the law requires.
        </p>
      </Section>

      <Section title="7. Your rights and choices">
        <p>Depending on where you live, you may have the right to:</p>
        <ul>
          <li><strong>access</strong> your information and get a copy in a portable format (Profile → Your data → Download my data);</li>
          <li><strong>correct</strong> it (most details can be changed on your profile);</li>
          <li><strong>delete</strong> it (Profile → Your data → Request account deletion);</li>
          <li><strong>object to</strong> or <strong>restrict</strong> some uses, and <strong>withdraw consent</strong>;</li>
          <li>not be treated unfairly for using these rights;</li>
          <li>complain to your data protection authority, although we would appreciate the chance to help first.</li>
        </ul>
        <p>
          You can also make any request by emailing us. We may need to confirm your identity first and will reply within
          the time the law allows (usually one month). A parent or guardian can make requests for their child.
        </p>
      </Section>

      <Section title="8. International transfers">
        <p>
          Our service providers may process information in other countries. Where the law requires, we use recognised
          safeguards (such as standard contractual clauses) to protect it.
        </p>
      </Section>

      <Section title="9. Cookies">
        <p>We use a single essential cookie to keep you signed in, and no tracking or advertising cookies. See the <Link to="/legal/cookies">Cookie Policy</Link>.</p>
      </Section>

      <Section title="10. Changes to this policy">
        <p>
          We will update this page and the version number when this policy changes, and ask you to review significant
          changes when you next sign in.
        </p>
      </Section>

      <Section title="Contact us">
        <p>For any privacy question or request, contact:</p>
        <Contact l={l} />
      </Section>
    </>
  );
}

function Cookies(l: ResolvedLegal) {
  return (
    <>
      <p className="legal-lead">
        {l.siteName} uses as little browser storage as possible. We do not use advertising, analytics or tracking cookies,
        and we do not load fonts, scripts or trackers from other companies, so nothing about your visit is shared with them.
        Because everything we store is strictly necessary or a simple convenience, we do not need to show a cookie banner.
      </p>
      <Section title="What we store">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Purpose</th><th>How long</th></tr>
            </thead>
            <tbody>
              <tr><td><code>ma_refresh</code></td><td>Cookie, strictly necessary</td><td>Keeps you signed in securely. It cannot be read by scripts and is only sent to this site.</td><td>Until you sign out, or up to 30 days</td></tr>
              <tr><td>Home page checklist</td><td>Local storage, functional</td><td>Remembers which "getting started" steps you have seen or dismissed. Never leaves your device.</td><td>Until you clear your browser data</td></tr>
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Third-party services">
        <p>
          When you join a session, the video service (such as Google Meet) opens on its own website and uses its own cookies
          under its own policy.
        </p>
      </Section>
      <Section title="Your choices">
        <p>
          You can delete cookies and local storage in your browser settings at any time. If you block the sign-in cookie
          you will not be able to stay signed in.
        </p>
      </Section>
      <Section title="Contact us">
        <Contact l={l} />
      </Section>
    </>
  );
}

function Safeguarding(l: ResolvedLegal) {
  return (
    <>
      <p className="legal-lead">
        Many of the students who learn with {l.who} are children. Their safety and wellbeing come first, ahead of any
        other consideration. This policy explains how the Service is designed to protect students and what to do if you
        are worried.
      </p>
      <Section title="Our commitments">
        <ul>
          <li>Every tutor account is approved by an administrator before the tutor can teach.</li>
          <li>A parent or guardian agrees to our terms for every student under {l.parentalConsentAge}, and may be present during any session.</li>
          <li>Sessions are held online using links issued through the Service. Tutors and students communicate through the Service's messaging, which is kept on record so concerns can be reviewed.</li>
          <li>Tutors must not ask students for personal contact details or social media, meet students in person, or arrange sessions outside the Service, without the parent's or guardian's knowledge and agreement.</li>
          <li>Sessions are not recorded unless everyone agrees and, for a child, their parent or guardian agrees.</li>
          <li>Every concern is taken seriously, looked into promptly, and passed to the appropriate authorities where a child may be at risk.</li>
        </ul>
      </Section>
      <Section title="Expected behaviour for tutors">
        <ul>
          <li>Keep every interaction professional, kind and focused on learning.</li>
          <li>Use appropriate language, dress and background on camera, in a suitable location.</li>
          <li>Never share inappropriate content, and never ask a student to keep a secret.</li>
          <li>Report any concern about a student's safety or wellbeing to an administrator the same day.</li>
        </ul>
      </Section>
      <Section title="How to raise a concern">
        <ol>
          <li><strong>If anyone is in immediate danger, contact your local emergency services first.</strong></li>
          <li>In the app, open the session (choose <strong>More → Report a problem</strong>) or your messages with the tutor (choose <strong>Report</strong>). Reports go straight to our administrators.</li>
          <li>Or email us at {l.email ? <a href={`mailto:${l.email}`}>{l.email}</a> : 'the address below'}.</li>
        </ol>
        <p>
          You do not need proof to raise a concern. We will not tell the person you reported about who made the report
          unless we have to by law, and you will not be treated unfairly for reporting in good faith.
        </p>
      </Section>
      <Section title="What we do next">
        <p>
          An administrator reviews every report, may pause the account involved while we look into it, keeps a confidential
          record of what was done, and contacts child protection services or the police where the law requires or a child
          may be at risk.
        </p>
      </Section>
      <Section title="Contact">
        <Contact l={l} />
      </Section>
    </>
  );
}

function Accessibility(l: ResolvedLegal) {
  return (
    <>
      <p className="legal-lead">
        {l.who} wants everyone to be able to use {l.siteName}, including people who use assistive technology. We aim to meet
        the Web Content Accessibility Guidelines (WCAG) 2.1 at level AA.
      </p>
      <Section title="What we do">
        <ul>
          <li>Pages work with a keyboard alone and with screen readers, with visible focus and labelled controls.</li>
          <li>Text and controls are designed for readable contrast in both light and dark mode, and pages resize to any screen.</li>
          <li>Times are always shown in your own time zone, and important messages are sent by email as well.</li>
        </ul>
      </Section>
      <Section title="Known limitations">
        <p>
          Some downloadable study packets are PDFs that may not be fully accessible to every screen reader, and the video
          service used for sessions is provided by a third party. If you need a packet in another format, or an adjustment
          for your sessions, please ask and we will do our best to help.
        </p>
      </Section>
      <Section title="Feedback">
        <p>If something is hard to use, please tell us. We aim to reply within five working days.</p>
        <Contact l={l} />
      </Section>
    </>
  );
}

const DOCS: Record<LegalSlug, (l: ResolvedLegal) => ReactNode> = {
  terms: Terms,
  privacy: Privacy,
  cookies: Cookies,
  safeguarding: Safeguarding,
  accessibility: Accessibility,
};
