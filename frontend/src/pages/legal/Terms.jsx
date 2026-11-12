import { Link } from 'react-router';
import { LegalPage, OperatorNotice, useOperator } from './LegalPage';

export default function Terms() {
  const operator = useOperator();
  const who = operator.name || 'the operator of this SAHELI deployment';
  return (
    <LegalPage title="Terms of Use">
      <OperatorNotice />

      <section>
        <h2>About these terms</h2>
        <p>
          These terms apply to your use of SAHELI, which is provided by {who}. By creating an account or using SAHELI you agree to them.
          Please also read the <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2>What SAHELI is, and what it is not</h2>
        <ul>
          <li>SAHELI helps you notice warning signs, keep evidence privately, and reach people you trust.</li>
          <li>
            <strong>SAHELI is not an emergency service.</strong> If you are in danger, call 112. SAHELI does not contact the police,
            ambulance or any authority for you.
          </li>
          <li>SAHELI is not a law-enforcement agency, and its reports are prepared by you, not verified by SAHELI.</li>
          <li>SAHELI does not give legal, medical or mental-health advice, and its companion is an AI, not a person or a professional.</li>
          <li>
            Checks look for patterns. They can miss things and can flag things that are harmless. A result is not proof that anyone is or
            is not a scammer, and SAHELI cannot verify anyone&apos;s identity. The decisions are yours.
          </li>
        </ul>
      </section>

      <section>
        <h2>Who can use SAHELI</h2>
        <p>
          You can create an account if you are 13 or older. Children under 13 should have a parent or guardian set up and supervise their
          use. If the law where you live requires a parent or guardian&apos;s consent for someone your age, you need that consent.
        </p>
      </section>

      <section>
        <h2>Emergency features depend on your device</h2>
        <p>
          SOS, location sharing, recording and voice features depend on your device, browser, permissions, battery and internet
          connection, and on the trusted contacts you set up. Email alerts depend on email providers. SAHELI shows which alerts were sent,
          but cannot guarantee that a message is delivered or read. Location is shared only while the SAHELI screen is open, and browsers
          cannot listen for voice commands in the background.
        </p>
      </section>

      <section>
        <h2>Using SAHELI responsibly</h2>
        <ul>
          <li>Only add people as trusted contacts if you are comfortable with them receiving emergency alerts from you.</li>
          <li>Only create a family link with someone who agrees to it. Do not use SAHELI to watch or control another person.</li>
          <li>Do not upload intimate images of other people, and never sexual images of anyone under 18. Doing so is a serious crime.</li>
          <li>Recording other people may be restricted by law where you are. You are responsible for how you use the recording feature.</li>
          <li>Do not try to break, overload, or get around the security of SAHELI, or access anyone else&apos;s data.</li>
        </ul>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          What you add to SAHELI stays yours. You allow us to process it only to provide SAHELI to you, as described in the Privacy Policy.
          You can delete it at any time.
        </p>
      </section>

      <section>
        <h2>Other services</h2>
        <p>
          SAHELI links to helplines, government portals and other services that SAHELI does not run. Their details were checked when
          added, but they can change, and their own terms apply.
        </p>
      </section>

      <section>
        <h2>Changes, suspension and ending</h2>
        <p>
          We may change or stop features, and we will update these terms if we do something that affects you. We may suspend accounts
          that are used to harm others or attack SAHELI. You can delete your account at any time from Settings.
        </p>
      </section>

      <section>
        <h2>Liability</h2>
        <p>
          SAHELI is provided to help, without guarantees that it will always be available, accurate or complete. To the extent the law
          allows, the operator is not liable for losses that come from relying on a check, from alerts that are delayed or not delivered,
          or from services SAHELI links to. Nothing in these terms limits rights you have that cannot be limited by law.
        </p>
      </section>

      <section>
        <h2>Law and contact</h2>
        <p>
          {operator.governing_law ? `These terms are governed by the laws of ${operator.governing_law}.` : 'The governing law for these terms will be stated by the operator before public launch.'}{' '}
          {operator.support_email ? (
            <>
              Questions: <a href={`mailto:${operator.support_email}`}>{operator.support_email}</a>.
            </>
          ) : null}
        </p>
      </section>
    </LegalPage>
  );
}
