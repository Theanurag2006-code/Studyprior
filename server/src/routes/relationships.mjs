import { conflict, forbidden, notFound } from '../lib/errors.mjs';
import { validator } from '../lib/validate.mjs';
import { newId } from '../lib/crypto.mjs';
import { nowIso } from '../db.mjs';
import { q } from '../dto.mjs';
import { findVisibleTopic } from '../services.mjs';

const toDto = (row, user) => ({
  id: row.id,
  subjectId: row.subject_id,
  sourceTopicId: row.source_topic_id,
  targetTopicId: row.target_topic_id,
  type: row.relationship_type,
  createdAt: row.created_at,
  isMine: Number(row.created_by) === Number(user.id),
});

export function register(r) {
  r.add('POST', '/topics/:id/relationships', { auth: 'student', limit: ['topic-relationship', 86_400_000, 150] }, ({ body, params, db, user, status }) => {
    const source = findVisibleTopic(db, user, params.id);
    if (!source) throw notFound('That topic is not available.');

    const v = validator(body);
    const targetTopicId = v.str('targetTopicId', { min: 1, max: 100 });
    const type = v.oneOf('type', ['PREREQUISITE', 'RELATED']);
    v.done();

    const target = findVisibleTopic(db, user, targetTopicId);
    if (!target) throw notFound('The other topic is not available.');
    if (source.subject_id !== target.subject_id) throw conflict('DIFFERENT_SUBJECTS', 'Relationships can only connect topics in the same subject.');
    if (source.id === target.id) throw conflict('SELF_RELATIONSHIP', 'A topic cannot be related to itself.');

    // RELATED is undirected, so store its IDs in a stable order and avoid mirrored duplicates.
    let fromId = source.id;
    let toId = target.id;
    if (type === 'RELATED' && fromId.localeCompare(toId) > 0) [fromId, toId] = [toId, fromId];

    if (q.get(db, 'SELECT 1 found FROM topic_relationships WHERE source_topic_id = ? AND target_topic_id = ? AND relationship_type = ?', fromId, toId, type)) {
      throw conflict('DUPLICATE_RELATIONSHIP', 'That relationship already exists.');
    }

    if (type === 'PREREQUISITE') {
      // source is the prerequisite; reject an edge that would introduce a directed cycle.
      const cycle = q.get(db, `WITH RECURSIVE reachable(id) AS (
        SELECT target_topic_id FROM topic_relationships WHERE source_topic_id = ? AND relationship_type = 'PREREQUISITE'
        UNION
        SELECT tr.target_topic_id FROM topic_relationships tr JOIN reachable r ON tr.source_topic_id = r.id
        WHERE tr.relationship_type = 'PREREQUISITE'
      ) SELECT 1 found FROM reachable WHERE id = ? LIMIT 1`, target.id, source.id);
      if (cycle) throw conflict('PREREQUISITE_CYCLE', 'That prerequisite would create a loop. Choose a different direction.');
    }

    const id = newId();
    const createdAt = nowIso();
    q.run(db, `INSERT INTO topic_relationships
      (id, subject_id, source_topic_id, target_topic_id, relationship_type, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, id, source.subject_id, fromId, toId, type, user.id, createdAt);
    const row = q.get(db, 'SELECT * FROM topic_relationships WHERE id = ?', id);
    status(201);
    return toDto(row, user);
  });

  r.add('DELETE', '/topics/:id/relationships/:relationshipId', { auth: true }, ({ params, db, user }) => {
    const topic = findVisibleTopic(db, user, params.id);
    if (!topic) throw notFound('That topic is not available.');
    const row = q.get(db, 'SELECT * FROM topic_relationships WHERE id = ? AND subject_id = ?', params.relationshipId, topic.subject_id);
    if (!row || (row.source_topic_id !== topic.id && row.target_topic_id !== topic.id)) throw notFound('That relationship is not available.');
    if (user.role !== 'ADMIN' && Number(row.created_by) !== Number(user.id)) throw forbidden('Only the person who added this relationship can remove it.');
    q.run(db, 'DELETE FROM topic_relationships WHERE id = ?', row.id);
    return { deleted: true };
  });
}
