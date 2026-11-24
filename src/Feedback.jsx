import { Alert, Info, Network } from './Icons';

export function Notice({ children, warning = false, action }) {
  return (
    <div className={`notice ${warning ? 'warning' : ''}`} role={warning ? 'alert' : 'status'}>
      {warning ? <Alert size={18} /> : <Info size={18} />}
      <div>{children}</div>
      {action}
    </div>
  );
}

export function Loading({ text = 'Connecting the dots…' }) {
  return <div className="loading" role="status"><span className="spinner" />{text}</div>;
}

export function Empty({ title, children }) {
  return <div className="empty-state"><Network size={34} /><h3>{title}</h3><p>{children}</p></div>;
}
