import { Mail, Phone } from 'lucide-react';
import { Link } from 'react-router';
import { ResourceList } from '../../components/Resources';
import { Card } from '../../components/ui';
import { LegalPage, OperatorNotice, useOperator } from './LegalPage';

export default function Contact() {
  const operator = useOperator();
  return (
    <LegalPage title="Contact and support">
      <OperatorNotice />
      <section>
        <h2>If you need help now</h2>
        <p>
          SAHELI&apos;s team cannot respond to emergencies. If you are in danger, call{' '}
          <a href="tel:112" className="inline-flex items-center gap-1">
            <Phone className="size-4" aria-hidden />
            112
          </a>
          . These services can help:
        </p>
        <ResourceList ids={['emergency_112', 'women_helpline_181', 'cyber_1930', 'childline_1098']} className="mt-4" />
        <p className="mt-4">
          More options are on the <Link to="/help">Help and support</Link> page.
        </p>
      </section>

      <section>
        <h2>Questions, privacy requests and problems</h2>
        {operator.support_email ? (
          <Card className="flex items-center gap-3 p-4">
            <Mail className="size-5 text-brand-600" aria-hidden />
            <a href={`mailto:${operator.support_email}`}>{operator.support_email}</a>
          </Card>
        ) : (
          <p>A support email address has not been configured for this deployment yet.</p>
        )}
        <p>
          For privacy requests, you can also download or delete your data yourself in Settings. Please do not send screenshots or other
          evidence by email; keep them in your Evidence Vault.
        </p>
      </section>

      <section>
        <h2>Reporting a security problem</h2>
        <p>
          If you find a security weakness in SAHELI, please tell us privately at the address above before sharing it publicly, and do not
          access other people&apos;s data while testing.
        </p>
      </section>
    </LegalPage>
  );
}
