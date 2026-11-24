import { useEffect, useState } from 'react';
import { api, elementKey, graphUrl, valueText, vertexName } from './api';
import { demoSnapshot } from './demo';
import { ChevronLeft, ChevronRight, CircleDot, GitFork, Refresh, Search } from './Icons';
import Pagination from './Pagination';
import { Empty, Loading, Notice } from './Feedback';
import PropertyList from './PropertyList';

const PAGE_SIZE = 50;

export default function DataTable({ graph, kind, mode }) {
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState(['']);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const cursor = cursors[page];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setResult(null);
    setExpanded(null);

    async function load() {
      if (mode !== 'demo') {
        const params = new URLSearchParams({ page: cursor, limit: String(PAGE_SIZE) });
        return api(`${graphUrl(graph)}/${kind}?${params}`);
      }
      const items = demoSnapshot(graph)[kind];
      const offset = page * PAGE_SIZE;
      return {
        items: items.slice(offset, offset + PAGE_SIZE),
        nextPage: offset + PAGE_SIZE < items.length ? String(offset + PAGE_SIZE) : null,
      };
    }

    load()
      .then(data => { if (active) setResult(data); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [graph, kind, mode, cursor, page, revision]);

  const items = (result?.items || [])
    .map((item, index) => ({ item, index: page * PAGE_SIZE + index + 1 }))
    .filter(({ item }) => JSON.stringify(item).toLowerCase().includes(query.toLowerCase()));

  function refresh() {
    setPage(0);
    setCursors(['']);
    setRevision(value => value + 1);
  }

  function nextPage() {
    setCursors(previous => [...previous.slice(0, page + 1), result.nextPage]);
    setPage(value => value + 1);
    setQuery('');
  }

  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <h2>
          {kind === 'vertices' ? <CircleDot size={18} /> : <GitFork size={18} />}
          {kind === 'vertices' ? 'All vertices' : 'All edges'}
        </h2>
        <button className="icon-button" title="Refresh table" aria-label="Refresh table" disabled={loading} onClick={refresh}>
          <Refresh size={17} />
        </button>
      </div>
      <div className="table-toolbar">
        <label className="search-input">
          <Search size={17} />
          <input aria-label="Filter the current page" placeholder="Filter this page by ID, label, or property…" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        <span className="muted small">{PAGE_SIZE} records per page · Expand a row for properties</span>
      </div>
      {loading ? <Loading text={`Loading ${kind}…`} /> : error ? (
        <div className="section-error">
          <Notice warning>{error}</Notice>
          <button className="button secondary" onClick={() => setRevision(value => value + 1)}>Try again</button>
        </div>
      ) : result && (
        <>
          {!result.items.length ? (
            <Empty title={page || result.nextPage ? 'No records on this page' : `No ${kind} yet`}>
              {page || result.nextPage ? 'Use the page controls to continue browsing, or refresh the table.' : 'Data inserted through Hubble will appear here after a refresh.'}
            </Empty>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th>{kind === 'vertices' ? 'Vertex ID' : 'Edge ID'}</th>
                    <th>Label</th>
                    {kind === 'edges' && <><th>Source →</th><th>→ Target</th></>}
                    <th>Properties</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(({ item, index }) => (
                    <TableRow
                      key={elementKey(item.id)}
                      item={item}
                      index={index}
                      kind={kind}
                      expanded={expanded === elementKey(item.id)}
                      onToggle={() => setExpanded(previous => previous === elementKey(item.id) ? null : elementKey(item.id))}
                    />
                  ))}
                </tbody>
              </table>
              {!items.length && <Empty title="No matches on this page">Clear the filter, move to another page, or use Find a node in Explore to search server data.</Empty>}
            </div>
          )}
          <div className="table-footer">
            <span>{query ? `${items.length} matching of ${result.items.length} records on this page` : `${result.items.length} records on this page`}</span>
            <Pagination
              page={page}
              hasNext={Boolean(result.nextPage)}
              onPrev={() => { setPage(value => value - 1); setQuery(''); }}
              onNext={nextPage}
            />
          </div>
        </>
      )}
    </section>
  );
}

function TableRow({ item, index, kind, expanded, onToggle }) {
  const properties = Object.entries(item.properties || {});
  return (
    <>
      <tr>
        <td className="row-number">{String(index).padStart(2, '0')}</td>
        <td>
          <button className="table-id" onClick={onToggle} aria-expanded={expanded}>
            {expanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            <code>{valueText(item.id)}</code>
          </button>
          {kind === 'vertices' && <span className="table-vertex-name">{vertexName(item)}</span>}
        </td>
        <td><span className="label-pill">{item.label}</span></td>
        {kind === 'edges' && <><td><code>{valueText(item.outV)}</code></td><td><code>{valueText(item.inV)}</code></td></>}
        <td>
          <button className="property-preview" onClick={onToggle} aria-expanded={expanded}>
            {properties.slice(0, 2).map(([key, value]) => `${key}: ${valueText(value)}`).join(' · ') || 'No properties'}
            {properties.length > 2 && <span> +{properties.length - 2}</span>}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="expanded-row">
          <td colSpan={kind === 'edges' ? 6 : 4}>
            <div>
              <strong>All properties</strong>
              {properties.length ? (
                <PropertyList properties={item.properties} />
              ) : <p className="muted">This {kind === 'edges' ? 'edge' : 'vertex'} has no properties.</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
