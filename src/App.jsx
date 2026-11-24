import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { api, createGraph, elementKey, graphUrl, palette } from './api';
import { demoGraphs, demoSnapshot } from './demo';
import DataTable from './DataTable';
import Pagination from './Pagination';
import { Empty, Loading, Notice } from './Feedback';
import ConnectionsPanel from './ConnectionsPanel';
import SearchPanel from './SearchPanel';
import { loadConnections } from './connections';
import { ArrowLeft, ArrowRight, ArrowUpRight, Book, Check, ChevronLeft, ChevronRight, CircleDot, Database, Flask, GitFork, Grid, Menu, Network, Plus, Refresh, Search, Sparkles, X } from './Icons';

const GraphCanvas = lazy(() => import('./GraphCanvas'));

function useRoute() {
  const read = () => {
    const parts = window.location.hash.slice(1).split('?')[0].split('/').filter(Boolean);
    let graph;
    try { graph = parts[0] === 'graphs' && parts[1] ? decodeURIComponent(parts[1]) : null; } catch { graph = null; }
    return { graph, view: ['dashboard', 'vertices', 'edges'].includes(parts[2]) ? parts[2] : 'dashboard' };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => { const update = () => setRoute(read()); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  return route;
}
const go = (graph, view = 'dashboard') => { window.location.hash = graph ? `/graphs/${encodeURIComponent(graph)}/${view}` : '/'; };

export function Modal({ title, children, onClose, busy = false }) {
  const ref = useRef(null);
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog className="modal" ref={ref} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (!busy && event.target === ref.current) onClose(); }} aria-labelledby="modal-title" aria-busy={busy}>
    <div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close dialog"><X /></button></div>
    {children}
  </dialog>;
}

function GraphArt({ variant = 0, large = false }) {
  const points = [[44, 55], [105, 27], [166, 65], [232, 30], [283, 92], [210, 130], [128, 119], [62, 147]];
  const links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0], [0, 6], [2, 6], [2, 5]];
  return <svg className={large ? 'hero-art' : 'card-art'} viewBox="0 0 330 180" fill="none" aria-hidden="true">
    {links.map(([a, b], index) => <path key={index} d={`M${points[a].join(' ')}L${points[b].join(' ')}`} stroke="currentColor" strokeWidth={large ? 1.5 : 1.2} opacity={large ? .65 : .35} strokeDasharray={index % 4 === 0 ? '5 5' : undefined} />)}
    {points.map(([x, y], index) => <g key={index}><circle cx={x + 2} cy={y + 3} r={index === 2 ? 17 : 10} fill="#292237" /><circle cx={x} cy={y} r={index === 2 ? 17 : 10} fill={palette[(index + variant) % palette.length]} stroke="#292237" strokeWidth="2" />{index === 2 && <path d={`M${x - 5} ${y}h10m-5-5v10`} stroke="#292237" strokeWidth="1.8" />}</g>)}
    {large && <><path d="m286 145 3-9 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="#c9ee99" /><path d="m25 21 2-6 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="white" /></>}
  </svg>;
}

export default function App() {
  const route = useRoute();
  const [mode, setMode] = useState(() => { try { return sessionStorage.getItem('hugegraph-mode') === 'demo' ? 'demo' : 'live'; } catch { return 'live'; } });
  const [graphs, setGraphs] = useState([]);
  const [allowCreate, setAllowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return localStorage.getItem('hugegraph-sidebar-collapsed') === 'true'; } catch { return false; } });
  const [toast, setToast] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setGraphs([]); setAllowCreate(false);
    if (mode === 'demo') { setGraphs(demoGraphs); setLoading(false); return; }
    api('/graphs').then(data => { if (active) { setGraphs(data.graphs); setAllowCreate(data.allowCreate); } }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, refresh]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { setMobileNav(false); }, [route.graph, route.view]);
  useEffect(() => { try { localStorage.setItem('hugegraph-sidebar-collapsed', String(sidebarCollapsed)); } catch {} }, [sidebarCollapsed]);
  function changeMode(nextMode) { setMode(nextMode); try { sessionStorage.setItem('hugegraph-mode', nextMode); } catch {} go(null); }
  const title = route.graph ? route.view === 'dashboard' ? 'Graph explorer' : route.view === 'vertices' ? 'Vertices' : 'Edges' : 'Your graphs';
  const connectionStatus = mode === 'demo' ? 'Demo workspace' : error ? 'Server unavailable' : loading ? 'Connecting…' : 'Local workspace';
  return <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
    <aside id="primary-navigation" className={`sidebar ${mobileNav ? 'is-open' : ''}`} aria-label="Main navigation">
      <button className="icon-button sidebar-toggle" onClick={() => setSidebarCollapsed(collapsed => !collapsed)} aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!sidebarCollapsed} aria-controls="sidebar-links">{sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
      <a className="brand" href="#/" onClick={() => setMobileNav(false)} aria-label="HugeGraph Portal home" title="HugeGraph Portal home"><div className="brand-mark"><Network size={24} /></div><div className="brand-wordmark">HugeGraph<span>PORTAL</span></div></a>
      <nav id="sidebar-links" aria-label="Graphs and workspace">
      <div className="sidebar-label">LET’S EXPLORE</div>
      <a href="#/" className={`nav-item ${!route.graph ? 'active' : ''}`} aria-label="All graphs" title="All graphs" aria-current={!route.graph ? 'page' : undefined}><Grid size={19} /><span className="nav-text">All graphs</span><span className="nav-count">{graphs.length}</span></a>
      <div className="sidebar-label workspace-label">WORKSPACE</div>
      {route.graph ? <div className="current-graph"><span className="live-dot" /><span title={route.graph}>{route.graph}</span></div> : <p className="workspace-placeholder">Choose a graph to open<br />your workspace.</p>}
      {[[Network, 'Dashboard', 'dashboard'], [CircleDot, 'Vertices', 'vertices'], [GitFork, 'Edges', 'edges']].map(([Icon, text, view]) => route.graph ? <a key={view} className={`nav-item ${route.view === view ? 'active' : ''}`} href={`#/graphs/${encodeURIComponent(route.graph)}/${view}`} aria-label={text} title={text} aria-current={route.view === view ? 'page' : undefined}><Icon size={19} /><span className="nav-text">{text}</span>{route.view === view && <span className="nav-active-dot" />}</a> : <span key={view} className="nav-item disabled" aria-label={`${text}: choose a graph first`} title={`${text}: choose a graph first`} aria-disabled="true"><Icon size={19} /><span className="nav-text">{text}</span></span>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="research-note"><Flask size={21} /><strong>A little curiosity.<br />A lot of connections.</strong><p>Your next discovery is<br />just a node away.</p><span className="note-star">✳</span></div>
        <button className="help-link" onClick={() => setDialog('help')} aria-label="Connection guide" title="Connection guide"><Book size={17} /><span className="nav-text">Connection guide</span><ArrowUpRight className="help-arrow" size={14} /></button>
        <div className="sidebar-footer" aria-label={connectionStatus} title={connectionStatus}><span className={`live-dot ${mode === 'live' && error ? 'offline' : ''}`} /><span className="status-text">{connectionStatus}</span><span className="version">v1.0</span></div>
      </div>
    </aside>
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation" aria-expanded={mobileNav} aria-controls="primary-navigation"><Menu /></button><span>Workspace</span><ChevronRight size={14} /><strong>{title}</strong></div><div className="topbar-right"><div className="mode-switch" aria-label="Data source"><button className={mode === 'live' ? 'selected' : ''} aria-pressed={mode === 'live'} onClick={() => changeMode('live')}><span className="live-dot" />Live</button><button className={mode === 'demo' ? 'selected' : ''} aria-pressed={mode === 'demo'} onClick={() => changeMode('demo')}><Flask size={13} />Demo</button></div><div className="avatar" title="Local research workspace">HG</div></div></header>
      <main>
        {mode === 'demo' && <div className="demo-banner"><Flask size={15} /><span>Demo mode · Sample data only. Your HugeGraph data is separate.</span><button onClick={() => changeMode('live')}>Connect to live data <ArrowRight size={14} /></button></div>}
        {route.graph ? <Workspace key={`${mode}:${route.graph}`} graph={route.graph} view={route.view} mode={mode} /> : <Library graphs={graphs} mode={mode} loading={loading} error={error} onCreate={() => setDialog('create')} onRetry={() => setRefresh(value => value + 1)} onDemo={() => changeMode('demo')} />}
      </main>
      <footer className="page-footer"><span>Built for curious minds. Powered by Apache HugeGraph.</span><span className="footer-tag"><span className="live-dot" />MAKE CONNECTIONS.</span></footer>
    </div>
    {dialog === 'help' && <Modal title="Connect your graph" onClose={() => setDialog(null)}><p>Point the portal at the same HugeGraph Server you use in Hubble.</p><ol className="guide-steps"><li>Check that your HugeGraph Docker container is running and its API port is published.</li><li>Open <code>.env</code> and set <code>HUGEGRAPH_URL</code> to the server API URL, usually <code>http://127.0.0.1:8080</code>. Port <code>8088</code> usually serves the Hubble web interface instead.</li><li>Run <code>npm run dev</code>. For a built portal, run <code>npm run build</code> then <code>npm start</code>. Restart after changing <code>.env</code>.</li><li>Select <strong>Live</strong> and refresh the graph library.</li></ol><Notice>Use New graph to create a separate graph. Your existing graphs are available for browsing.</Notice><p className="muted small">Hubble and this portal are separate viewers of the same database. Use the port published for the HugeGraph Server container.</p><a className="button primary" href="https://hugegraph.apache.org/docs/clients/restful-api/" target="_blank" rel="noreferrer">HugeGraph documentation <ArrowUpRight size={16} /></a></Modal>}
    {dialog === 'create' && <CreateGraph graphs={graphs} mode={mode} enabled={allowCreate} onClose={() => setDialog(null)} onCheckGraphs={() => { setDialog(null); go(null); setRefresh(value => value + 1); }} onCreated={name => { setDialog(null); setRefresh(value => value + 1); setToast(`Graph “${name}” created. Ready to explore!`); go(name); }} />}
    {toast && <div className="toast" role="status"><Check size={18} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>;
}

function Library({ graphs, mode, loading, error, onCreate, onRetry, onDemo }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('az');
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => graphs.filter(graph => graph.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'az' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)), [graphs, query, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / 16));
  const currentPage = Math.min(page, pages - 1);
  return <div className="library-page">
    <section className="welcome-banner"><div><span className="banner-kicker">BIG IDEAS START WITH A SINGLE NODE.</span><h2>Connect the dots.<br />Find something new.</h2><p>Pick a graph, explore its relationships,<br />and see the bigger picture.</p><span className="banner-badge"><Database size={13} />APACHE HUGEGRAPH INSIDE</span></div><GraphArt large /><span className="banner-vertical">EXPLORE. CONNECT. DISCOVER.</span></section>
    <div className="library-heading"><div><h2>Your graph collection <span className="count-badge">{loading ? '…' : graphs.length.toString().padStart(2, '0')}</span></h2><p>Different datasets. Endless possibilities.</p></div><button className="button primary" onClick={onCreate}><Plus size={18} />New graph</button></div>
    <div className="library-toolbar"><label className="search-input"><Search size={18} /><input placeholder="Find a graph by name…" aria-label="Search graphs by name" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />{query && <button aria-label="Clear graph search" onClick={() => { setQuery(''); setPage(0); }}><X size={15} /></button>}</label><div className="toolbar-right"><span className="small muted">SORT BY</span><select aria-label="Sort graphs" value={sort} onChange={event => setSort(event.target.value)}><option value="az">Name (A–Z)</option><option value="za">Name (Z–A)</option></select><button className="icon-button refresh-button" onClick={onRetry} aria-label="Refresh graphs" title="Refresh graphs" disabled={loading}><Refresh size={17} /></button></div></div>
    {loading ? <Loading text="Finding your graphs…" /> : error ? <div className="connection-state"><div className="connection-icon"><Database size={30} /></div><h3>Let’s get you connected.</h3><p>{error}</p><div className="empty-actions"><button className="button primary" onClick={onRetry}><Refresh size={16} />Try again</button><button className="button secondary" onClick={onDemo}>Explore the demo <ArrowRight size={16} /></button></div><small>Your connection is configured in <code>.env</code>. No sample data is shown in Live mode.</small></div> : !filtered.length ? <Empty title={query ? 'No matching graphs' : 'Your collection is ready for its first graph'}>{query ? 'Try another graph name or clear your search.' : 'Graphs configured on your HugeGraph Server will appear here. Create or configure a graph in Hubble, then refresh.'}</Empty> : <>
      <div className="graph-grid">{filtered.slice(currentPage * 16, currentPage * 16 + 16).map((graph, index) => <a key={graph.name} className={`graph-card card-color-${index % 4}`} href={`#/graphs/${encodeURIComponent(graph.name)}/dashboard`}><div className="card-art-area"><span className="card-number">{String(currentPage * 16 + index + 1).padStart(2, '0')}</span><span className="card-source">{mode === 'demo' ? 'SAMPLE GRAPH' : 'HUGEGRAPH'}</span><GraphArt variant={index} /></div><div className="card-body"><span className="card-tag">{graph.tag || 'GRAPH DATABASE'}</span><h3 title={graph.name}>{graph.name.replaceAll('_', ' ')}</h3><p>{graph.description || 'Discover the vertices, relationships, and stories in your graph.'}</p><div className="card-footer"><span>{mode === 'demo' ? <><span className="live-dot" />Demo dataset</> : <><span className="live-dot" />Available to explore</>}</span><span className="card-open"><ArrowUpRight size={18} /></span></div></div></a>)}</div>
      <div className="collection-bottom"><span>Showing {currentPage * 16 + 1}–{Math.min((currentPage + 1) * 16, filtered.length)} of {filtered.length} graphs</span><Pagination page={currentPage} hasNext={currentPage + 1 < pages} onPrev={() => setPage(currentPage - 1)} onNext={() => setPage(currentPage + 1)} /><span className="collection-tip"><Sparkles size={14} />Every connection tells a story.</span></div>
    </>}
  </div>;
}

function CreateGraph({ graphs, mode, enabled, onClose, onCreated, onCheckGraphs }) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState(graphs[0]?.name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const submitting = useRef(false);
  const canCreate = mode === 'live' && enabled && graphs.length > 0;
  const selectedTemplate = graphs.some(graph => graph.name === template) ? template : graphs[0]?.name || '';
  const duplicate = graphs.some(graph => graph.name === name.trim());
  async function submit(event) {
    event.preventDefault(); if (!canCreate || submitting.current || uncertain || duplicate) return;
    submitting.current = true;
    setBusy(true); setError('');
    try { const result = await createGraph(name.trim(), selectedTemplate); onCreated(result.name); }
    catch (err) {
      const unknownOutcome = err.code === 'CREATION_UNCERTAIN' || !err.status;
      setUncertain(unknownOutcome);
      setError(unknownOutcome ? 'Creation could not be confirmed. The graph may already exist. Check the graph list before trying again.' : err.message);
    } finally { submitting.current = false; setBusy(false); }
  }
  return <Modal title="Create a graph" onClose={onClose} busy={busy}>
    <p>Create an empty graph with its own storage. Use an existing graph as a storage template; its schema, nodes, and relationships are not copied.</p>
    {!canCreate && <Notice>{mode === 'demo' ? 'Switch to Live mode to create a graph on your server.' : !enabled ? 'Graph creation is disabled in the server configuration.' : 'An existing graph is needed as a storage template. Configure the first graph on your HugeGraph Server.'}</Notice>}
    <form onSubmit={submit}>
      <label className="field-label">Graph name<input autoFocus className="field-input" placeholder="my_next_discovery" value={name} onChange={event => { setName(event.target.value); setError(''); }} pattern="[A-Za-z][A-Za-z0-9_]{0,47}" maxLength={48} required disabled={!canCreate || busy || uncertain} aria-invalid={duplicate} /></label>
      <small className="muted">1–48 letters, numbers, or underscores. Start with a letter.</small>
      {duplicate && <p className="field-error" role="alert">A graph with that name already exists.</p>}
      <label className="field-label">Storage template<select className="field-input" value={selectedTemplate} onChange={event => { setTemplate(event.target.value); setError(''); }} disabled={!canCreate || busy || uncertain}>{graphs.map(graph => <option key={graph.name}>{graph.name}</option>)}</select></label>
      <p className="muted small">Supports RocksDB and memory templates. Memory graphs do not persist after server restart.</p>
      {error && <Notice warning>{error}</Notice>}
      <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>{uncertain ? <button type="button" className="button primary" onClick={onCheckGraphs}>Check graph list <Refresh size={16} /></button> : <button className="button primary" disabled={!canCreate || busy || duplicate || !name.trim()}>{busy ? 'Creating…' : 'Create graph'}<Plus size={17} /></button>}</div>
    </form>
  </Modal>;
}

function Workspace({ graph, view, mode }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (view !== 'dashboard') return;
    let active = true;
    setLoading(true); setError(''); setData(null);
    Promise.resolve().then(() => mode === 'demo' ? demoSnapshot(graph) : api(`${graphUrl(graph)}/snapshot`)).then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [graph, mode, revision, view]);
  return <div className="workspace-page"><a className="back-link" href="#/"><ArrowLeft size={15} />Back to all graphs</a><div className="workspace-heading"><div><div className="eyebrow">{view === 'dashboard' ? 'LET’S CONNECT THE DOTS' : 'A CLOSER LOOK'}</div><h1>{graph.replaceAll('_', ' ')}<span className="graph-title-dot">.</span></h1><p>{view === 'dashboard' ? 'Follow a connection. Uncover a new perspective.' : view === 'vertices' ? 'Every node has a story. Get to know yours.' : 'The relationships that bring your data together.'}</p></div><span className="workspace-source"><span className="live-dot" />{mode === 'demo' ? 'DEMO DATASET' : 'HUGEGRAPH DATABASE'}</span></div><div className="workspace-tabs">{[[Network, 'Explore', 'dashboard'], [CircleDot, 'Vertices', 'vertices'], [GitFork, 'Edges', 'edges']].map(([Icon, title, tab]) => <a key={tab} className={view === tab ? 'selected' : ''} href={`#/graphs/${encodeURIComponent(graph)}/${tab}`}><Icon size={16} />{title}</a>)}</div>
    {view !== 'dashboard' ? <DataTable key={`${view}:${graph}`} graph={graph} kind={view} mode={mode} /> : loading ? <Loading text="Drawing your connections…" /> : error ? <div className="section-error"><Notice warning>{error}</Notice><button className="button secondary" onClick={() => setRevision(value => value + 1)}><Refresh size={16} />Try again</button></div> : data && <Dashboard key={revision} graph={graph} initialData={data} mode={mode} onRefresh={() => setRevision(value => value + 1)} />}
  </div>;
}

export function Dashboard({ graph, initialData, mode, onRefresh }) {
  const [data, setData] = useState(initialData);
  const [selected, setSelected] = useState(null);
  const [focusing, setFocusing] = useState(false);
  const [focusedId, setFocusedId] = useState(null);
  const [direction, setDirection] = useState('BOTH');
  const [error, setError] = useState('');
  const [isNeighborhood, setIsNeighborhood] = useState(false);
  const requestRef = useRef(0);
  const abortRef = useRef(null);
  useEffect(() => () => { ++requestRef.current; abortRef.current?.abort(); }, []);
  const labels = useMemo(() => [...new Set([...initialData.vertices, ...data.vertices].map(vertex => vertex.label))].sort(), [initialData, data]);
  const vertexIds = useMemo(() => new Set(data.vertices.map(vertex => elementKey(vertex.id))), [data]);
  const dangling = data.edges.filter(edge => !vertexIds.has(elementKey(edge.outV)) || !vertexIds.has(elementKey(edge.inV))).length;
  async function focus(vertex, nextDirection = 'BOTH', expectedRequest) {
    if (expectedRequest !== undefined && expectedRequest !== requestRef.current) return;
    const request = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setDirection(nextDirection); setSelected(vertex); setFocusedId(null); setFocusing(true); setError('');
    try {
      const nextData = await loadConnections({ graph, mode, id: vertex.id, direction: nextDirection, signal: controller.signal });
      if (request !== requestRef.current) return;
      setData(nextData); setSelected(nextData.vertices.find(node => elementKey(node.id) === elementKey(vertex.id)) || vertex); setFocusedId(elementKey(vertex.id)); setIsNeighborhood(true);
    } catch (err) { if (request === requestRef.current) setError(err.message); } finally { if (request === requestRef.current) { setFocusing(false); abortRef.current = null; } }
  }
  function clearSelection() { ++requestRef.current; abortRef.current?.abort(); abortRef.current = null; setSelected(null); setFocusedId(null); setFocusing(false); setError(''); }
  function reset() { clearSelection(); setData(initialData); setIsNeighborhood(false); setDirection('BOTH'); return requestRef.current; }
  function changeDirection(next) { if (selected) focus(selected, next); }
  const ready = selected && !focusing && focusedId === elementKey(selected.id);
  return <>
    <div className="stat-row"><div className="stat-card"><span className="stat-icon purple"><CircleDot size={21} /></span><div><span>Loaded nodes</span><strong>{data.vertices.length.toLocaleString()}</strong></div><span className="stat-caption">NODES WITH A STORY</span></div><div className="stat-card"><span className="stat-icon blue"><GitFork size={21} /></span><div><span>Loaded relationships</span><strong>{data.edges.length.toLocaleString()}</strong></div><span className="stat-caption">CONNECTIONS TO FOLLOW</span></div><div className="stat-card"><span className="stat-icon lime"><Database size={21} /></span><div><span>Node types in view</span><strong>{new Set(data.vertices.map(node => node.label)).size}</strong></div><span className="stat-caption">A WORLD OF POSSIBILITIES</span></div></div>
    {data.truncated && <Notice warning>{isNeighborhood ? `More relationships exist than this view can load${data.limit ? ` (limit: ${data.limit.toLocaleString()})` : ''}. Counts describe the loaded connections only.` : `Showing a bounded view${data.limit ? ` of up to ${data.limit.toLocaleString()} elements per type` : ''}. More records exist. Find a node or use the paginated tables to explore them.`}</Notice>}
    {dangling > 0 && <Notice>{dangling} loaded relationships have endpoints outside this view. Find a node to load its connections.</Notice>}
    <div className="explorer-layout">
      <section className="canvas-panel"><div className="panel-heading"><h2><Network size={17} />{isNeighborhood ? 'Node connections' : 'The bigger picture'}</h2><div>{isNeighborhood && <button className="text-button" onClick={reset}>Show full graph</button>}<button className="icon-button" title="Refresh graph data" aria-label="Refresh graph data" onClick={onRefresh}><Refresh size={16} /></button></div></div><Suspense fallback={<Loading text="Preparing the graph canvas…" />}><GraphCanvas data={data} selected={selected} onSelect={vertex => vertex ? focus(vertex) : clearSelection()} labels={labels} /></Suspense><div className="canvas-bottom"><span><span className="live-dot" />{focusing ? 'Loading connections…' : `${data.vertices.length} nodes · ${data.edges.length - dangling} visible relationships`}</span><span>Click a node to show its connections below</span></div></section>
      <aside className="explorer-sidebar">
        <SearchPanel graph={graph} mode={mode} initialData={initialData} onFocus={focus} onReset={reset} focusing={focusing} />
      </aside>
    </div>
    <ConnectionsPanel node={selected} data={data} labels={labels} direction={direction} onDirection={changeDirection} loading={focusing} ready={ready} error={error} onFocus={focus} onClose={clearSelection} />
  </>;
}
