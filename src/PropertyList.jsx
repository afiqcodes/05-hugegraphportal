import { valueText } from './api';

export default function PropertyList({ properties, limit = Infinity, className = 'property-list' }) {
  return (
    <dl className={className}>
      {Object.entries(properties || {}).slice(0, limit).map(([key, value]) => (
        <div key={key}><dt>{key}</dt><dd>{valueText(value)}</dd></div>
      ))}
    </dl>
  );
}
