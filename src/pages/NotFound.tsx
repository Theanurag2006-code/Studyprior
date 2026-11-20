import { Link } from 'react-router-dom';
import { Empty } from '../components/ui';
export default function NotFound() {
  return <div className="auth"><Empty title="Page not found" hint="That address doesn't exist in StudyPrior." action={<Link className="btn" to="/">Back to Overview</Link>} /></div>;
}
