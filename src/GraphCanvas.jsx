import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { Maximize, Minus, Plus, RotateCcw, Network } from './Icons';
import { elementKey, labelColor, vertexName } from './api';
import PropertyList from './PropertyList';
import { graphLayout } from './graphLayout';

export default function GraphCanvas({ data, selected, onSelect, labels }) {
  const container = useRef(null);
  const cyRef = useRef(null);
  const selectRef = useRef(onSelect);
  const [tooltip, setTooltip] = useState(null);
  selectRef.current = onSelect;
  useEffect(() => {
    setTooltip(null);
    const nodeIds = new Set(data.vertices.map(vertex => elementKey(vertex.id)));
    const cy = cytoscape({
      container: container.current,
      elements: [
        ...data.vertices.map(vertex => ({ data: { id: `v:${elementKey(vertex.id)}`, title: vertexName(vertex), color: labelColor(vertex.label, labels), vertex } })),
        ...data.edges.filter(edge => nodeIds.has(elementKey(edge.outV)) && nodeIds.has(elementKey(edge.inV))).map(edge => ({ data: { id: `e:${elementKey(edge.id)}`, source: `v:${elementKey(edge.outV)}`, target: `v:${elementKey(edge.inV)}`, title: edge.label, edge } })),
      ],
      style: [
        { selector: 'node', style: {
          width: 42, height: 42,
          'background-color': 'data(color)', 'border-color': '#292237', 'border-width': 2,
          label: 'data(title)', 'font-size': 12.1, 'font-family': 'Arial, sans-serif', color: '#292237',
          'text-valign': 'bottom', 'text-margin-y': 9,
          'text-background-color': '#faf9f6', 'text-background-opacity': 1, 'text-background-padding': '3px',
          'text-max-width': 120, 'text-wrap': 'wrap', 'text-overflow-wrap': 'anywhere',
          'text-events': 'yes',
        } },
        { selector: 'edge', style: {
          width: 1.5, 'line-color': '#bdb6cd', 'target-arrow-color': '#8e849e', 'target-arrow-shape': 'triangle',
          'curve-style': 'bezier', 'control-point-step-size': 70,
          'source-endpoint': 'outside-to-node-or-label', 'target-endpoint': 'outside-to-node-or-label',
          label: 'data(title)', 'font-size': 9.9, 'font-family': 'Arial, sans-serif', color: '#6f647f',
          'text-rotation': 'autorotate', 'text-margin-y': -10,
          'text-background-color': '#faf9f6', 'text-background-opacity': 1, 'text-background-padding': '3px',
        } },
        { selector: '.muted', style: { opacity: .16 } },
        { selector: '.highlight', style: { 'border-width': 4, 'border-color': '#6540d4', 'line-color': '#7553e8', 'target-arrow-color': '#7553e8', width: 3 } },
        { selector: 'node.highlight', style: { width: 48, height: 48 } },
      ],
      layout: graphLayout,
      minZoom: .08, maxZoom: 4, wheelSensitivity: .18,
    });
    cyRef.current = cy;
    const observer = new ResizeObserver(() => cy.resize());
    observer.observe(container.current);
    cy.on('tap', 'node', event => selectRef.current(event.target.data('vertex')));
    cy.on('tap', event => { if (event.target === cy) selectRef.current(null); });
    cy.on('mouseover', 'node', event => {
      const position = event.target.renderedPosition();
      setTooltip({ vertex: event.target.data('vertex'), x: position.x, y: position.y });
    });
    cy.on('mouseout pan zoom drag', () => setTooltip(null));
    return () => { observer.disconnect(); cy.destroy(); cyRef.current = null; };
  }, [data, labels]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('muted highlight');
    if (selected) {
      const node = cy.getElementById(`v:${elementKey(selected.id)}`);
      if (node.length) {
        cy.elements().addClass('muted');
        node.closedNeighborhood().removeClass('muted').addClass('highlight');
      }
    }
  }, [selected, data, labels]);

  const zoom = factor => { const cy = cyRef.current; if (cy) cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); };
  return <div className="canvas-shell">
    <div ref={container} className="graph-canvas" aria-label="Interactive graph visualization. Drag nodes, scroll to zoom, and click a node to explore its connections." />
    {!data.vertices.length && <div className="canvas-empty"><Network size={38} /><h3>No nodes here yet</h3><p>Add schema and data through Hubble or HugeGraph, then refresh this graph.</p></div>}
    <div className="canvas-hint"><span className="live-dot" /> DRAG TO EXPLORE · SCROLL TO ZOOM</div>
    <div className="canvas-controls">
      <button aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1.25)}><Plus size={17} /></button>
      <button aria-label="Zoom out" title="Zoom out" onClick={() => zoom(.8)}><Minus size={17} /></button>
      <button aria-label="Fit graph" title="Fit graph" onClick={() => cyRef.current?.fit(undefined, 50)}><Maximize size={17} /></button>
      <button aria-label="Rearrange graph" title="Rearrange graph" onClick={() => cyRef.current?.layout(graphLayout).run()}><RotateCcw size={17} /></button>
    </div>
    <div className="canvas-legend">{labels.map(label => <span key={label}><i style={{ background: labelColor(label, labels) }} />{label}</span>)}</div>
    {tooltip && <div className="node-tooltip" style={{ left: Math.min(Math.max(tooltip.x + 24, 10), Math.max(10, (container.current?.clientWidth || 300) - 260)), top: Math.min(Math.max(tooltip.y + 20, 10), Math.max(10, (container.current?.clientHeight || 300) - 210)) }}>
      <span className="eyebrow">{tooltip.vertex.label}</span><strong>{vertexName(tooltip.vertex)}</strong>
      <PropertyList properties={tooltip.vertex.properties} limit={6} className={null} />
      <small>Click to explore connections</small>
    </div>}
  </div>;
}
