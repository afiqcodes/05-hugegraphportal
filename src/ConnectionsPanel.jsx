import { useMemo, useState } from 'react';
import { elementKey, labelColor, valueText, vertexName } from './api';
import { connectionGroups } from './connections';
import { ArrowRight, CircleDot, GitFork, Refresh, X } from './Icons';
import { Empty, Loading, Notice } from './Feedback';
import Pagination from './Pagination';
import PropertyList from './PropertyList';

export default function ConnectionsPanel({ node, data, labels = [], direction = 'BOTH', onDirection, loading, ready, error, onFocus, onClose }) {
  return <section className="panel connections-panel" aria-labelledby="connected-nodes-heading" aria-busy={loading}>
    <div className="panel-heading"><h2 id="connected-nodes-heading"><GitFork size={18} />Connected Nodes</h2>{node && <div>
      <button className="icon-button" disabled={loading} onClick={() => onFocus(node, direction)} aria-label="Refresh connected nodes" title="Refresh connected nodes"><Refresh size={16} /></button>
      <button className="icon-button" onClick={onClose} aria-label="Clear connected nodes" title="Clear connected nodes"><X size={16} /></button>
    </div>}</div>
    {!node ? <Empty title="Find a node to see its connections">Search for a node above or click a vertex in the graph. Its connected nodes and relationship details will appear here.</Empty> : <div className="connections-body">
      <div className="connections-toolbar">
        <div className="selected-node-summary"><span className="label-pill" style={{ background: labelColor(node.label, labels) }}>{node.label}</span><h3>Connections for {vertexName(node)}</h3><code className="vertex-id">{valueText(node.id)}</code></div>
        <label className="field-label">Relationships<select className="field-input" value={direction} onChange={event => onDirection(event.target.value)} disabled={!ready || loading}><option value="BOTH">All directions</option><option value="IN">Incoming to this node</option><option value="OUT">Outgoing from this node</option></select></label>
      </div>
      <details className="node-properties selected-node-properties"><summary>Selected node properties</summary>{Object.keys(node.properties || {}).length ? <PropertyList properties={node.properties} /> : <p className="muted small">No properties.</p>}</details>
      {loading ? <Loading text="Loading connected nodes…" /> : !ready ? <div className="connections-error">{error && <Notice warning>{error}</Notice>}<button className="button secondary" onClick={() => onFocus(node, direction)}>Retry connections <Refresh size={15} /></button></div> : <ConnectedNodesDetails node={node} data={data} labels={labels} direction={direction} onFocus={onFocus} />}
    </div>}
  </section>;
}

export function ConnectedNodesDetails({ node, data, labels = [], direction, onFocus }) {
  const [page, setPage] = useState(0);
  const groups = useMemo(() => connectionGroups(data, node), [data, node]);
  const neighbors = groups.filter(group => elementKey(group.id) !== elementKey(node.id)).length;
  const relationships = groups.reduce((total, group) => total + group.relationships.length, 0);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(groups.length / 12) - 1));
  return <>
    <p className="connection-count" role="status">{neighbors} connected node{neighbors !== 1 ? 's' : ''} · {relationships} relationship{relationships !== 1 ? 's' : ''}</p>
    {data.truncated && <Notice warning>More relationships exist. These details and counts include the loaded connections only{data.limit ? ` (limit: ${data.limit.toLocaleString()})` : ''}.</Notice>}
    {!groups.length ? <Empty title={direction === 'BOTH' ? 'No connected nodes' : `No ${direction === 'IN' ? 'incoming' : 'outgoing'} relationships`}>{direction === 'BOTH' ? 'This node has no relationships.' : 'Choose All directions to check the other relationships for this node.'}</Empty> : <>
      <div className="connected-node-grid">{groups.slice(currentPage * 12, currentPage * 12 + 12).map(group => <ConnectedNodeCard key={elementKey(group.id)} group={group} node={node} labels={labels} onFocus={onFocus} />)}</div>
      <div className="connected-nodes-pagination"><span>Showing {currentPage * 12 + 1}–{Math.min((currentPage + 1) * 12, groups.length)} of {groups.length} node cards</span><Pagination page={currentPage} hasNext={(currentPage + 1) * 12 < groups.length} onPrev={() => setPage(currentPage - 1)} onNext={() => setPage(currentPage + 1)} /></div>
    </>}
  </>;
}

export function ConnectedNodeCard({ group, node, labels = [], onFocus }) {
  return <article className="panel connected-node-card">
        <div className="connected-node-heading"><span className="connected-node-icon" style={{ background: labelColor(group.node?.label, labels) }}><CircleDot size={22} /></span><div><span className="label-pill">{group.node?.label || 'Node'}</span><h3>{group.node ? vertexName(group.node) : valueText(group.id)}</h3><code className="vertex-id">{valueText(group.id)}</code></div></div>
        {elementKey(group.id) === elementKey(node.id) ? <p className="muted small">Self relationships for the selected node.</p> : group.node && <button className="text-button connected-node-follow" onClick={() => onFocus(group.node, 'BOTH')}>Explore this node’s connections <ArrowRight size={14} /></button>}
        <details className="node-properties"><summary>Node properties</summary>{Object.keys(group.node?.properties || {}).length ? <PropertyList properties={group.node.properties} /> : <p className="muted small">No properties available.</p>}</details>
        <div className="connected-relationships">{group.relationships.map(({ edge, source, target, direction: relationDirection }) => <div className="relationship-card" key={elementKey(edge.id)}>
          <span className="relationship-direction">{relationDirection}</span>
          <p className="relationship-path"><strong>{source ? vertexName(source) : valueText(edge.outV)}</strong><span>→ {edge.label} →</span><strong>{target ? vertexName(target) : valueText(edge.inV)}</strong></p>
          <details className="relationship-properties"><summary>Relationship details</summary><code className="vertex-id">{valueText(edge.id)}</code>{Object.keys(edge.properties || {}).length ? <PropertyList properties={edge.properties} /> : <p className="muted small">No additional properties.</p>}</details>
        </div>)}</div>
      </article>;
}
