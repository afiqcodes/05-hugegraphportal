import { useEffect, useState } from 'react';
import { elementKey, valueText, vertexName } from './api';
import { createSearchRequests, findVertices } from './search';
import { ArrowUpRight, CircleDot, Search } from './Icons';
import { Notice } from './Feedback';

export default function SearchPanel({ graph, mode, initialData, onFocus, onReset, focusing }) {
  const [value, setValue] = useState('');
  const [exact, setExact] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requests] = useState(createSearchRequests);
  useEffect(() => () => requests.cancel(), [requests]);
  async function search(event) {
    event.preventDefault();
    const query = value.trim();
    if (!query) return;
    const request = requests.start(); setLoading(true); setError(''); setResults(null);
    const navigationRequest = onReset();
    try {
      const result = await findVertices({ graph, mode, initialData, query, exact, signal: request.signal });
      if (!request.isCurrent()) return;
      setResults(result);
      if (result.vertices.length === 1 && !result.truncated && !result.resultsLimited) onFocus(result.vertices[0], 'BOTH', navigationRequest);
    } catch (err) { if (request.isCurrent()) setError(err.message); } finally { if (request.isCurrent()) setLoading(false); }
  }
  function invalidate() { requests.cancel(); setResults(null); setError(''); setLoading(false); }
  function clear() { invalidate(); setValue(''); setExact(false); onReset(); }
  return <section className="panel search-panel">
    <div className="panel-heading"><h2><Search size={17} />Find a node</h2><span className="tiny-spark">✳</span></div>
    <form className="search-form" onSubmit={search}><p>See which nodes connect and what their relationships are.</p><label className="field-label">Node name, ID, or property<input className="field-input" placeholder="e.g. node1, Ada, or London…" value={value} onChange={event => { invalidate(); setValue(event.target.value); }} required /></label><label className="checkbox-label"><input type="checkbox" checked={exact} onChange={event => { invalidate(); setExact(event.target.checked); }} />Exact match</label><div className="search-actions"><button className="button primary" disabled={loading || !value.trim()}><Search size={16} />{loading ? 'Searching…' : 'Find connections'}</button><button type="button" className="text-button" onClick={clear}>Reset</button></div><span className="search-footnote">All node types in this graph, including nodes outside the canvas. Select a match to see its incoming and outgoing relationships in Connected Nodes below.</span></form>
    {error && <div className="search-results"><Notice warning>{error}</Notice></div>}
    {results && <SearchResults results={results} onFocus={onFocus} focusing={focusing} />}
  </section>;
}

export function SearchResults({ results, onFocus, focusing }) {
  return <div className="search-results"><div className="result-heading" role="status"><strong>{results.totalMatches} matching node{results.totalMatches !== 1 ? 's' : ''}</strong><span>{results.scanned.toLocaleString()} scanned</span></div>{results.truncated && <Notice warning>Scan limit reached. More matches may exist.</Notice>}{results.resultsLimited && <p className="muted small">Showing the first 100 matches. Refine your search.</p>}{!results.vertices.length && <p className="muted small">No nodes matched{results.truncated ? ' in the scanned records' : ''}. Try another name, ID, or property.</p>}{results.vertices.map(vertex => <button className="search-result" key={elementKey(vertex.id)} onClick={() => onFocus(vertex, 'BOTH')} disabled={focusing}><span className="result-icon"><CircleDot size={17} /></span><span><strong>{vertexName(vertex)}</strong><small>{vertex.label} · {valueText(vertex.id)}</small></span><ArrowUpRight size={15} /></button>)}</div>;
}

