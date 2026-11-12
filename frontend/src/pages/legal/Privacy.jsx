import { Link } from 'react-router';
import { LegalPage, OperatorNotice, useOperator } from './LegalPage';

// This policy describes what the code in this repository actually does. If the code changes
// how data is collected, stored or shared, this page must change in the same commit.

export default function Privacy() {
  const operator = useOperator();
  const who = operator.name || 'the operator of this SAHELI deployment';
  return (
    <LegalPage title="Privacy Policy">
      <OperatorNotice />

      <section>
        <h2>The short version</h2>
        <ul>
          <li>Conversations, photos and links you check are processed and then forgotten. They are not saved unless you choose to save them to your Evidence Vault.</li>
          <li>What you save in the Evidence Vault, your incident reports and your meeting plans are encrypted by SAHELI before they are stored.</li>
          <li>We do not sell your data, show advertising, or use your conversations for advertising.</li>
          <li>SAHELI never contacts anyone, reports anyone, or contacts the authorities on its own. Alerts go out only when you start an SOS, or when you miss a check-in in a Safe Meeting plan you set up.</li>
          <li>You can download everything we store about you, and delete your account and all of it, from Settings.</li>
        </ul>
      </section>

      <section>
        <h2>Who is responsible</h2>
        <p>
          SAHELI is operated by {who}
          {operator.support_email ? (
            <>
              , who you can contact at <a href={`mailto:${operator.support_email}`}>{operator.support_email}</a>
            </>
          ) : null}
          . In this policy, &quot;we&quot; means that operator.
        </p>
      </section>

      <section>
        <h2>What we collect and why</h2>

        <h3>Your account</h3>
        <p>
          Your email address and password are handled by our sign-in provider, Supabase. We never see your password. We store your email
          address, and, if you give them, a display name, your age group and your language. The age group changes some advice (for
          example, advice for under-18s) and is never shared.
        </p>

        <h3>Conversation checks</h3>
        <p>
          The text you paste or the chat export you open is processed in memory to find warning signs, and is then discarded. Before any
          AI review, phone numbers, email addresses, UPI IDs, card and account numbers, Aadhaar and PAN numbers and one-time codes are
          replaced with placeholders.
        </p>
        <p>
          If you are signed in and &quot;Keep a history of check results&quot; is on (it is on by default, and you can turn it off in
          Settings), we keep a record of each check: when it happened, the type of check, the level, and the types of warning signs found.
          For link checks, the record includes the website name. The record never includes the conversation, the messages, quotes or the
          photo.
        </p>

        <h3>Screenshot reading</h3>
        <p>If you upload chat screenshots, they are sent to our AI provider to read the text, then discarded. They are not saved.</p>

        <h3>Photo checks</h3>
        <p>
          Photos you check are read in memory to find hidden data such as location and device details, and are not saved. If you tick the
          AI review box, a smaller copy of the photo with all hidden data removed is sent to our AI provider for that check only. A
          &quot;clean copy&quot; you download is created on the fly and not kept.
        </p>

        <h3>Link checks</h3>
        <p>
          The link you enter is examined by SAHELI. If this deployment has Google Safe Browsing turned on, the link is also sent to Google
          to check it against known harmful sites. For short links (such as bit.ly), SAHELI asks the short-link service where the link
          leads. SAHELI never opens the destination page.
        </p>

        <h3>The companion</h3>
        <p>
          Companion chats are not stored on our servers. The chat is kept in your browser for the current tab and cleared when you close
          it. Each message you send, with personal details replaced as described above, is sent to our AI provider together with recent
          messages from the same chat so it can reply.
        </p>

        <h3>Evidence Vault</h3>
        <p>
          Anything you save to the vault (files, text, links, notes and their titles) is encrypted with AES-256-GCM by SAHELI before it is
          stored in our database and in a private storage bucket. For each file we record its size, type and SHA-256 fingerprint so you
          can show it has not changed. Items are deleted automatically after the period you choose in Settings (90 days, 1 year, or until
          you delete them).
        </p>

        <h3>Incident reports and Safe Meeting plans</h3>
        <p>
          The details you enter in an incident report, and the person, place and notes in a meeting plan, are encrypted before storage.
          Meeting start and end times and check-in times are stored unencrypted so SAHELI can tell when a check-in is missed.
        </p>

        <h3>Trusted contacts</h3>
        <p>
          The names, phone numbers and email addresses you enter for trusted contacts are used only to help you reach them in an emergency
          or after a missed meeting check-in.
        </p>

        <h3>Emergencies</h3>
        <p>
          When you start an SOS, we record when it started and ended, how it was started (button, voice phrase, watch or missed check-in),
          the locations your device shares while it is active, and whether each alert was sent. Each trusted contact gets a private status
          link that shows your first name, the emergency status and, only if you allowed it for that contact, your last shared location.
          Status links stop working 24 hours after the emergency ends.
        </p>
        <p>
          If email alerts are set up on this deployment, the alert email (your name, the status link and, where allowed, a map link) is
          sent through our email provider, Resend. If you record audio or video during an emergency, it is uploaded to your Evidence Vault
          in pieces while you record.
        </p>

        <h3>Family links and locations</h3>
        <p>
          If you link with a parent, guardian or child, the permissions agreed for that link decide what the other person sees. Your
          location is stored only when you share it: with a check-in (including Safe Meeting check-ins and the watch&apos;s share
          location button), during an SOS, or during live sharing you start. SAHELI does not track location in the background. Shared locations are deleted after 30 days.
        </p>

        <h3>Paired devices</h3>
        <p>For a paired watch or small device, we store its name, when it was paired and last used, and a one-way hash of its access token.</p>

        <h3>Account activity and security</h3>
        <p>
          We keep a log of sensitive actions on your account (for example, saving or opening evidence, starting an emergency, pairing a
          device) with the time, a rough device description such as &quot;Chrome on Android&quot;, and a one-way hash of your IP address.
          You can see this log in Settings. To prevent abuse we count requests per account, or per hashed IP address when you are not signed
          in; these counters are deleted after two days.
        </p>
      </section>

      <section>
        <h2>Who processes data for us</h2>
        <ul>
          <li>
            <strong>Supabase</strong>: sign-in, database and private file storage.
          </li>
          <li>
            <strong>Anthropic</strong>: the AI used for conversation reviews, the companion, photo reviews, screenshot reading and report
            drafting. Under its commercial terms, Anthropic does not use this content to train its models; it may keep it for a limited time
            for safety and abuse monitoring, as described in its own policies.
          </li>
          <li>
            <strong>Google Safe Browsing</strong> (only if turned on for this deployment): link reputation checks.
          </li>
          <li>
            <strong>Resend</strong> (only if turned on for this deployment): emergency and meeting emails.
          </li>
          <li>
            <strong>Our hosting provider</strong>: runs the SAHELI server and keeps standard technical logs (such as request times and
            status codes). SAHELI does not write the content of your checks or vault items to logs.
          </li>
        </ul>
        <p>We do not share your information with anyone else unless the law requires it.</p>
      </section>

      <section>
        <h2>How long we keep things</h2>
        <ul>
          <li>Checked conversations, photos, screenshots and companion chats: not kept.</li>
          <li>Check history: until you delete it, turn history off, or delete your account.</li>
          <li>Evidence Vault: for the period you choose in Settings, or until you delete it.</li>
          <li>Incident reports, contacts, meeting plans and family links: until you delete them or your account.</li>
          <li>Shared locations: 30 days. Notifications: 90 days. Rate-limit counters: 2 days.</li>
          <li>Everything: deleted when you delete your account.</li>
        </ul>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <ul>
          <li>Download all your data from Settings.</li>
          <li>Correct your details in Settings, or edit items directly.</li>
          <li>Turn off check history, choose not to use AI review on any check, and choose how long evidence is kept.</li>
          <li>Delete individual items, or delete your account and everything with it from Settings.</li>
        </ul>
        <p>
          Depending on where you live, you may have further rights under data protection law, such as India&apos;s Digital Personal Data
          Protection Act, 2023. {operator.support_email ? <>Contact <a href={`mailto:${operator.support_email}`}>{operator.support_email}</a> to use them.</> : 'Contact the operator to use them.'}
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          SAHELI can be used by teenagers, and is designed to help children stay safe. People under 13 should have a parent or guardian
          help them set it up. Family links work only when the child accepts them on their own device after seeing what will be shared,
          and either side can end them.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Connections to SAHELI are encrypted. Sensitive content is encrypted by SAHELI before storage, database tables are closed to
          direct access from browsers, and every request is checked to make sure you can only reach your own data. No system is perfectly
          secure; if you believe your account has been accessed, use &quot;Sign out on all devices&quot; in Settings and change your
          password.
        </p>
      </section>

      <section>
        <h2>Cookies and storage in your browser</h2>
        <p>
          SAHELI does not use advertising or analytics cookies or third-party trackers. Your browser stores your sign-in session, your
          language, and settings such as the quick SOS link. The companion chat is kept in the current tab only.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If we change how SAHELI handles your information, we will update this page and the date at the top. Significant changes will be
          shown in the app. See also the <Link to="/terms">Terms</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
