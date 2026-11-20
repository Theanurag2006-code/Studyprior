import type { CSSProperties } from 'react';
import type { Topic, TopicRelationship, Unit } from '../types';

type Props = {
  topics: Topic[];
  units: Unit[];
  relationships: TopicRelationship[];
  onOpenTopic: (topicId: string) => void;
};

const panelStyle: CSSProperties = {
  display: 'grid', gap: 12, width: '100%', minWidth: 0,
};
const rowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
  gap: 12, padding: 14, border: '1px solid var(--border)', borderRadius: 14,
  background: 'var(--surface-2)', minWidth: 0,
};
const nodeStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3,
  textAlign: 'left', padding: '12px 14px', minWidth: 170, maxWidth: 260,
  border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)',
  color: 'var(--text)', cursor: 'pointer', boxShadow: '0 2px 6px rgba(15,22,48,.06)',
};
const arrowStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  minWidth: 70, color: 'var(--accent)', fontWeight: 800, fontSize: 24, lineHeight: 1.1,
};
const smallStyle: CSSProperties = { color: 'var(--muted)', fontSize: 12, fontWeight: 500 };

/** HTML/CSS relationship map. Each saved relationship is shown as a visible source → target row. */
export function TopicGraph({ topics, units, relationships, onOpenTopic }: Props) {
  if (!topics.length) return <p className="muted small">Add topics to build this subject's graph.</p>;

  const topicById = new Map(topics.map(topic => [topic.id, topic]));
  const unitName = (topic: Topic) => units.find(unit => unit.id === topic.unitId)?.name ?? 'General';
  const visibleRelationships = relationships.filter(r => topicById.has(r.sourceTopicId) && topicById.has(r.targetTopicId));
  const connectedIds = new Set(visibleRelationships.flatMap(r => [r.sourceTopicId, r.targetTopicId]));
  const unconnectedTopics = topics.filter(topic => !connectedIds.has(topic.id));

  const node = (topic: Topic) => (
    <button
      key={topic.id}
      type="button"
      onClick={() => onOpenTopic(topic.id)}
      aria-label={`Open topic ${topic.name}`}
      style={nodeStyle}
    >
      <strong style={{ fontSize: 14, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{topic.name}</strong>
      <span style={smallStyle}>{unitName(topic)}</span>
      <span style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 700 }}>OPEN TOPIC ↗</span>
    </button>
  );

  return (
    <div style={panelStyle} aria-label="Topic relationship graph">
      {visibleRelationships.length > 0 ? visibleRelationships.map(relation => {
        const from = topicById.get(relation.sourceTopicId)!;
        const to = topicById.get(relation.targetTopicId)!;
        const prerequisite = relation.type === 'PREREQUISITE';
        return (
          <div key={relation.id} style={rowStyle}>
            {node(from)}
            <div style={arrowStyle} aria-label={prerequisite ? 'Prerequisite leads to dependent topic' : 'Related topics'}>
              <span>{prerequisite ? '→' : '↔'}</span>
              <span style={{ ...smallStyle, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textAlign: 'center' }}>
                {prerequisite ? 'MUST COME BEFORE' : 'RELATED'}
              </span>
            </div>
            {node(to)}
          </div>
        );
      }) : (
        <div style={{ ...rowStyle, justifyContent: 'flex-start' }}>
          <p className="muted small">No connections yet. Add a prerequisite or related-topic link below.</p>
        </div>
      )}

      {unconnectedTopics.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <p className="muted small" style={{ margin: 0 }}>Other topics in this subject</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {unconnectedTopics.map(topic => node(topic))}
          </div>
        </div>
      )}
      <p className="muted small" style={{ margin: 0 }}>Select any topic card to open its profile.</p>
    </div>
  );
}
